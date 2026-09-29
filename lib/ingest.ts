// Ingest — §1. Download every feed in lib/sources.ts, keep the rows each one
// considers live, normalize them into the canonical Job shape, and merge them
// into one board: dedup by canonical_key (§3), and for scraper-built feeds also
// by company + title + place, since the same posting reaches them under
// different URLs.
//
// Serving rule: a request never waits on the network when there is anything
// to show. The feed lives in memory; once it's an hour old, the next request
// is answered from it and the refresh runs after the response (`after()`). A
// fresh server instance starts from the snapshot the build wrote (see
// scripts/build-snapshot.ts) rather than from ~45MB of downloads. Only a
// process with neither — `next dev` before any build — blocks, behind the
// board skeleton.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after } from 'next/server';
import type { Job, JobCore } from './types';
import { deriveRemote, locSlug, unseenCategories, unseenTerms } from './taxonomy';
import { canonicalKey, hostBucket } from './canonical';
import { logoDomain, logoSrc, markInitials } from './logo';
import { SOURCES, fromSimplifyRow, type Listing, type SourceSpec } from './sources';
import { SAMPLE_LISTINGS } from './sample-data';

export type RunStatus = 'ok' | 'failed' | 'stale';

export interface SourceRun {
  name: string;
  home: string;
  status: RunStatus;
  fetched: number; // rows in the file
  active: number; // rows the feed itself considers live
  inserted: number; // postings this feed put on the board
  enriched: number; // postings another feed listed first, that this one added pay or sponsorship to
  updatedAt?: number; // the feed's newest sign of life
  newestPostedAt?: number;
  error?: string;
  // Failed this run, but its postings from the last good run are still up.
  carried?: boolean;
}

export interface Feed {
  jobs: Job[];
  runs: SourceRun[];
  lastRunAt: number; // unix seconds: when the run that built this feed ran
  // live: built in this process. snapshot: loaded from the build's snapshot.
  // sample: nothing reachable and nothing to carry — the bundled fixture.
  origin: 'live' | 'snapshot' | 'sample';
}

const FETCH_TIMEOUT_MS = 30_000;
// A feed whose newest sign of life is older than this is withheld: its
// "active" flags are no longer being maintained, so it would be serving
// postings that have closed. It comes back on its own the day it updates.
export const STALE_AFTER_S = 21 * 86400;
const TTL_S = 60 * 60;
// After a failed run, try again sooner — the board is carrying old rows.
const RETRY_S = 5 * 60;

// --- Normalized Job ----------------------------------------------------------

// Everything on Job that isn't a fact from a source is derived here, once —
// both for fresh rows and for rows loaded from the snapshot.
export function finalize(core: JobCore): Job {
  return {
    ...core,
    canonicalKey: canonicalKey(core.url),
    locSlugs: core.locations.map(locSlug),
    isRemote: deriveRemote(core.locations),
    initials: markInitials(core.company),
    logoUrl: logoSrc(logoDomain(core.url, core.company)),
    search: `${core.company} ${core.title}`.toLowerCase(),
    host: hostBucket(core.url),
  };
}

function coreFrom(l: Listing, source: string, now: number): JobCore {
  // A posting dated in the future is a clock error upstream; it would sit at
  // the top of the board forever reading "0m ago".
  const at = Math.min(l.postedAt, now);
  return {
    id: l.id,
    company: l.company,
    companyUrl: l.companyUrl,
    title: l.title,
    url: l.url,
    category: l.category,
    type: l.type,
    typeConf: 'source',
    terms: l.terms,
    locations: l.locations,
    datePosted: at,
    firstSeenAt: at,
    active: true,
    sponsorship: l.sponsorship,
    pay: l.pay,
    source,
  };
}

function toCore(j: Job): JobCore {
  return {
    id: j.id,
    company: j.company,
    companyUrl: j.companyUrl,
    title: j.title,
    url: j.url,
    category: j.category,
    type: j.type,
    typeConf: j.typeConf,
    terms: j.terms,
    locations: j.locations,
    datePosted: j.datePosted,
    firstSeenAt: j.firstSeenAt,
    active: j.active,
    sponsorship: j.sponsorship,
    pay: j.pay,
    source: j.source,
  };
}

// --- Merge -------------------------------------------------------------------

const COMPANY_NOISE =
  /\b(inc|llc|ltd|corp|corporation|co|company|the|group|holdings|plc|gmbh|lp|llp)\b\.?/g;

function nameKey(j: { company: string; title: string }): string {
  const company = j.company.toLowerCase().replace(/&/g, ' and ').replace(COMPANY_NOISE, ' ');
  return `${company.replace(/[^a-z0-9]+/g, '')}|${j.title.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

// Locations that don't pin a posting down; they never rule a match in or out.
const VAGUE_PLACE = /^(unspecified|united states|canada|united kingdom|remote( in .+)?)$/i;

function samePlace(a: string[], b: string[]): boolean {
  const A = a.filter((l) => !VAGUE_PLACE.test(l));
  const B = new Set(b.filter((l) => !VAGUE_PLACE.test(l)));
  if (A.length === 0 || B.size === 0) return true;
  return A.some((l) => B.has(l));
}

type Outcome = 'inserted' | 'enriched' | 'duplicate';

// The board being built. The first feed to list a posting owns it; a later
// feed listing the same posting can only fill fields the owner left empty.
class Board {
  readonly jobs: Job[] = [];
  private byKey = new Map<string, Job>();
  private byName = new Map<string, Job[]>();

  add(job: Job, fuzzy: boolean): Outcome {
    const existing =
      this.byKey.get(job.canonicalKey) ?? (fuzzy ? this.sameElsewhere(job) : undefined);
    if (existing) {
      let added = false;
      if (!existing.sponsorship && job.sponsorship) {
        existing.sponsorship = job.sponsorship;
        added = true;
      }
      if (!existing.pay && job.pay) {
        existing.pay = job.pay;
        added = true;
      }
      return added ? 'enriched' : 'duplicate';
    }
    this.jobs.push(job);
    this.byKey.set(job.canonicalKey, job);
    const k = nameKey(job);
    const list = this.byName.get(k);
    if (list) list.push(job);
    else this.byName.set(k, [job]);
    return 'inserted';
  }

  // The same posting reached through a different URL: same company, same
  // title, same type, and somewhere in common. Two requisitions with one title
  // in two cities stay two postings.
  private sameElsewhere(job: Job): Job | undefined {
    return this.byName
      .get(nameKey(job))
      ?.find((j) => j.type === job.type && samePlace(j.locations, job.locations));
  }
}

const newest = (xs: number[]): number | undefined =>
  xs.length === 0 ? undefined : xs.reduce((a, b) => (b > a ? b : a));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    // The bodies are far over Next's 2MB data-cache limit; this module's own
    // cache owns their lifetime.
    cache: 'no-store',
    // One hung feed must not hold the whole board hostage.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// One full run over every feed. `prev` is the feed currently being served: a
// feed that fails this run keeps its postings from it instead of vanishing.
export async function refreshFeed(
  prev: Feed | null,
  sources: SourceSpec[] = SOURCES,
  fetcher: (url: string) => Promise<string> = fetchText,
): Promise<Feed> {
  const now = Math.floor(Date.now() / 1000);

  // Network time dominates. Fetch every feed at once, then merge in declared
  // order so dedup priority stays deterministic.
  const fetched = await Promise.all(
    sources.map(async (src) => {
      try {
        return { src, parsed: src.parse(await fetcher(src.url), now) };
      } catch (error) {
        return { src, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  const board = new Board();
  const runs: SourceRun[] = [];

  for (const r of fetched) {
    const { src } = r;
    const base = { name: src.name, home: src.home };

    if ('error' in r) {
      const last = prev?.runs.find((x) => x.name === src.name);
      // Copies: `prev` may still be rendering a request while this runs.
      const carried = (prev?.jobs ?? []).filter((j) => j.source === src.name).map((j) => ({ ...j }));
      let inserted = 0;
      for (const j of carried) if (board.add(j, !src.primary) === 'inserted') inserted++;
      runs.push({
        ...base,
        status: 'failed',
        fetched: 0,
        active: 0,
        inserted,
        enriched: 0,
        updatedAt: last?.updatedAt,
        newestPostedAt: last?.newestPostedAt,
        error: r.error,
        carried: inserted > 0,
      });
      continue;
    }

    const { parsed } = r;
    const newestPostedAt = newest(parsed.listings.map((l) => l.postedAt));
    if (parsed.updatedAt !== undefined && now - parsed.updatedAt > STALE_AFTER_S) {
      runs.push({
        ...base,
        status: 'stale',
        fetched: parsed.rows,
        active: parsed.listings.length,
        inserted: 0,
        enriched: 0,
        updatedAt: parsed.updatedAt,
        newestPostedAt,
        error: `no updates since ${new Date(parsed.updatedAt * 1000).toISOString().slice(0, 10)}`,
      });
      continue;
    }

    let inserted = 0;
    let enriched = 0;
    for (const l of parsed.listings) {
      const outcome = board.add(finalize(coreFrom(l, src.name, now)), !src.primary);
      if (outcome === 'inserted') inserted++;
      else if (outcome === 'enriched') enriched++;
    }
    runs.push({
      ...base,
      status: 'ok',
      fetched: parsed.rows,
      active: parsed.listings.length,
      inserted,
      enriched,
      updatedAt: parsed.updatedAt,
      newestPostedAt,
    });
  }

  let origin: Feed['origin'] = 'live';
  if (board.jobs.length === 0 && !runs.some((r) => r.status === 'ok')) {
    // Nothing reachable and nothing to carry — the bundled sample, so the UI
    // still renders. The SystemBanner says why.
    origin = 'sample';
    for (const raw of SAMPLE_LISTINGS) {
      const l = fromSimplifyRow(raw, raw.terms ? 'internship' : 'new_grad');
      board.add(finalize(coreFrom(l, 'sample', now)), false);
    }
  }

  // Newest first — the board answers "what's new since yesterday" (§4.1).
  board.jobs.sort((a, b) => b.firstSeenAt - a.firstSeenAt);

  if (unseenCategories.size > 0) {
    // Fail loudly (§2.1) — surface unseen categories in the server logs.
    console.warn('[ingest] unseen category values (mapped to `other`):', [...unseenCategories]);
  }
  if (unseenTerms.size > 0) {
    // The parser handles any "{Season} {Year}", so anything landing here is a
    // genuinely new shape worth seeing rather than absorbing.
    console.warn('[ingest] unparsed term values (mapped to `unspecified`):', [...unseenTerms]);
  }

  return { jobs: board.jobs, runs, lastRunAt: now, origin };
}

// --- Snapshot ----------------------------------------------------------------
// Written by the build (scripts/build-snapshot.ts) and shipped with the
// deployment (next.config.mjs traces it into every server function). Only the
// facts are stored; derived fields are rebuilt on load, so a logo fetched in
// the same build shows up without the snapshot having to know about it.

const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_FILE = path.join(process.cwd(), '.snapshot', 'feed.json');

interface Snapshot {
  version: number;
  feed: Omit<Feed, 'jobs'> & { jobs: JobCore[] };
}

export async function writeSnapshot(feed: Feed, file = SNAPSHOT_FILE): Promise<void> {
  const snapshot: Snapshot = {
    version: SNAPSHOT_VERSION,
    feed: { ...feed, jobs: feed.jobs.map(toCore) },
  };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(snapshot));
}

export async function readSnapshot(file = SNAPSHOT_FILE): Promise<Feed | null> {
  try {
    const snap = JSON.parse(await readFile(file, 'utf8')) as Snapshot;
    if (snap.version !== SNAPSHOT_VERSION || !Array.isArray(snap.feed?.jobs)) return null;
    return { ...snap.feed, jobs: snap.feed.jobs.map(finalize), origin: 'snapshot' };
  } catch {
    return null; // no snapshot (dev), or an unreadable one: fetch live instead
  }
}

// --- Serving -----------------------------------------------------------------

let current: Feed | null = null;
let snapshotLoad: Promise<Feed | null> | null = null;
let pending: Promise<Feed> | null = null;
let lastAttempt = 0;
let snapshotOnDisk: boolean | undefined;

// Will getFeed() answer without a network round trip? The page uses this to
// decide whether rendering needs a loading state at all: React streams a
// Suspense fallback even when the child resolves in 30ms, which would flash a
// skeleton on every filter click.
export function hasFeed(): boolean {
  if (current) return true;
  snapshotOnDisk ??= existsSync(SNAPSHOT_FILE);
  return snapshotOnDisk;
}

function needsRefresh(feed: Feed): boolean {
  const age = Date.now() / 1000 - feed.lastRunAt;
  const retrying = feed.origin === 'sample' || feed.runs.some((r) => r.status === 'failed');
  return age > (retrying ? RETRY_S : TTL_S);
}

function refresh(): Promise<Feed> {
  if (!pending) {
    lastAttempt = Date.now();
    pending = refreshFeed(current)
      .then((feed) => (current = feed))
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function getFeed(): Promise<Feed> {
  if (!current) {
    // Concurrent first requests share one read of the snapshot.
    snapshotLoad ??= readSnapshot();
    const snap = await snapshotLoad;
    if (!current && snap) current = snap;
  }

  // Nothing to show at all: the only honest option is to wait.
  if (!current) return refresh();

  if (needsRefresh(current) && !pending && Date.now() - lastAttempt > 30_000) {
    const run = refresh();
    try {
      // Keep the function alive until the refresh lands, without making this
      // response wait for it.
      after(() => run.then(() => undefined, () => undefined));
    } catch {
      // Outside a request (a script): the promise just runs.
    }
  }
  return current;
}
