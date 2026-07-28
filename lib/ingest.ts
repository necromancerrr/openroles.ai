// Ingest — §1. Download both listings.json, filter on `active && is_visible`
// AT PARSE TIME (finding 1: 90% of the file is dead; don't carry it further),
// normalize into the canonical Job shape, dedup by canonical_key (§3).
//
// This is the "aggregator is primary" model from §1 finding 4: the two repos
// are the source of truth, and type comes from repo-of-origin (typeConf
// 'source'). An ATS freshness layer would sit on top and reuse these same
// normalizers.

import type { Job, JobType, RawListing } from './types';
import {
  normalizeCategory,
  normalizeTerms,
  deriveRemote,
  unseenCategories,
  locSlug,
} from './taxonomy';
import { canonicalKey, hostBucket } from './canonical';
import { logoDomain, logoSrc, markInitials } from './logo';
import { SAMPLE_LISTINGS } from './sample-data';

const SOURCES: { url: string; type: JobType; name: string }[] = [
  {
    name: 'Summer2026-Internships',
    type: 'internship',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json',
  },
  {
    name: 'New-Grad-Positions',
    type: 'new_grad',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json',
  },
  // A second internship aggregator, same schema and same dedup key. Measured
  // against the SimplifyJobs feed: 235 active rows, 210 of them not present
  // there, and 40% of those posted inside 7 days versus 9% for SimplifyJobs —
  // it's a genuine freshness gain at the head of the board, which is the thing
  // this surface exists to show.
  //
  // Two quirks, both handled by not pretending otherwise: rows carry no
  // `category` (so they normalize to `other` and can't be category-filtered),
  // and `season` is bare — "Summer", "Fall", no year. A year is not inferable
  // from the repo name either, since these repos carry off-season rows (§2.2),
  // so the season is left unmapped and the rows read `unspecified` rather than
  // being assigned a term nobody stated.
  {
    name: 'vanshb03/Summer2026-Internships',
    type: 'internship',
    url: 'https://raw.githubusercontent.com/vanshb03/Summer2026-Internships/dev/.github/scripts/listings.json',
  },
];

export interface SourceRun {
  name: string;
  host: 'aggregator';
  status: 'ok' | 'failed' | 'skipped';
  fetched: number; // rows in file
  active: number; // active && is_visible
  inserted: number; // survived dedup into the board
  error?: string;
}

export interface Feed {
  jobs: Job[];
  runs: SourceRun[];
  lastRunAt: number; // unix seconds
  usedFallback: boolean;
}

function toJob(raw: RawListing, type: JobType): Job {
  const locations =
    Array.isArray(raw.locations) && raw.locations.length > 0
      ? raw.locations
      : ['Unspecified'];
  return {
    id: raw.id,
    company: raw.company_name,
    companyUrl: raw.company_url,
    title: raw.title,
    url: raw.url,
    canonicalKey: canonicalKey(raw.url),
    category: normalizeCategory(raw.category),
    type,
    typeConf: 'source',
    terms: normalizeTerms(raw.terms),
    locations,
    locSlugs: locations.map(locSlug),
    isRemote: deriveRemote(locations),
    initials: markInitials(raw.company_name),
    logoUrl: logoSrc(logoDomain(raw.url)),
    search: `${raw.company_name} ${raw.title}`.toLowerCase(),
    datePosted: raw.date_posted,
    firstSeenAt: raw.date_posted, // approximation; a persisted DB stores our own first-fetch
    active: raw.active,
    host: hostBucket(raw.url),
  };
}

async function fetchSource(url: string): Promise<RawListing[]> {
  const res = await fetch(url, {
    // Cache the 11MB payload; the source updates a few times a day.
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as RawListing[];
}

let cached: Feed | null = null;
let cachedAt = 0;
const TTL_MS = 60 * 60 * 1000;

// Is the feed already in memory? Callers use this to decide whether rendering
// will actually block: a warm request resolves in microseconds and must not be
// put behind a loading state, a cold one has ~23MB to download first.
export function isFeedFresh(): boolean {
  return cached !== null && Date.now() - cachedAt < TTL_MS;
}

export async function getFeed(): Promise<Feed> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const runs: SourceRun[] = [];
  const seen = new Set<string>();
  const jobs: Job[] = [];
  let anyOk = false;

  for (const src of SOURCES) {
    try {
      const rows = await fetchSource(src.url);
      // Finding 1: filter active && is_visible at parse time.
      const active = rows.filter((r) => r.active && r.is_visible);
      let inserted = 0;
      for (const r of active) {
        const job = toJob(r, src.type);
        // Dedup by canonical_key (§3). Cross-repo dupes collapse here too.
        if (seen.has(job.canonicalKey)) continue;
        seen.add(job.canonicalKey);
        jobs.push(job);
        inserted++;
      }
      runs.push({
        name: src.name,
        host: 'aggregator',
        status: 'ok',
        fetched: rows.length,
        active: active.length,
        inserted,
      });
      anyOk = true;
    } catch (err) {
      runs.push({
        name: src.name,
        host: 'aggregator',
        status: 'failed',
        fetched: 0,
        active: 0,
        inserted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let usedFallback = false;
  if (!anyOk) {
    // Network blocked — fall back to the bundled sample so the UI still
    // renders. The SystemBanner will report the failed sources regardless.
    usedFallback = true;
    for (const r of SAMPLE_LISTINGS) {
      const type: JobType = r.terms ? 'internship' : 'new_grad';
      const job = toJob(r as RawListing, type);
      if (seen.has(job.canonicalKey)) continue;
      seen.add(job.canonicalKey);
      jobs.push(job);
    }
  }

  // Newest first — the board answers "what's new since yesterday" (§4.1).
  jobs.sort((a, b) => b.firstSeenAt - a.firstSeenAt);

  if (unseenCategories.size > 0) {
    // Fail loudly (§2.1) — surface unseen categories in the server logs.
    console.warn(
      '[ingest] unseen category values (mapped to `other`):',
      [...unseenCategories],
    );
  }

  cached = { jobs, runs, lastRunAt: Math.floor(Date.now() / 1000), usedFallback };
  cachedAt = Date.now();
  return cached;
}
