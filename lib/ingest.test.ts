import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { refreshFeed, readSnapshot, writeSnapshot, STALE_AFTER_S } from './ingest';
import type { Listing, ParsedSource, SourceSpec } from './sources';

const now = Math.floor(Date.now() / 1000);

function listing(over: Partial<Listing> & Pick<Listing, 'id' | 'url'>): Listing {
  return {
    company: 'Acme',
    title: 'Software Engineer Intern',
    type: 'internship',
    category: 'software',
    terms: ['summer_2027'],
    locations: ['Seattle, WA'],
    postedAt: now - 3600,
    ...over,
  };
}

// A source whose body is the JSON of its parsed result, so `fetcher` can
// serve it (or throw) and `parse` stays trivial.
function source(name: string, primary: boolean): SourceSpec {
  return {
    name,
    home: `https://example.com/${name}`,
    url: `https://feeds.example.com/${name}`,
    primary,
    parse: (body) => JSON.parse(body) as ParsedSource,
  };
}

function serve(bodies: Record<string, ParsedSource | Error>) {
  return async (url: string) => {
    const b = bodies[url.replace('https://feeds.example.com/', '')];
    if (b instanceof Error) throw b;
    return JSON.stringify(b);
  };
}

const parsed = (listings: Listing[], updatedAt = now): ParsedSource => ({
  rows: listings.length,
  listings,
  updatedAt,
});

test('the first feed to list a posting owns it; later feeds only fill gaps', async () => {
  const feed = await refreshFeed(null, [source('simplify', true), source('scraper', false)], serve({
    simplify: parsed([listing({ id: 's1', url: 'https://jobs.lever.co/acme/abc' })]),
    scraper: parsed([
      // Same posting, the /apply form URL — collapses by canonical key.
      listing({ id: 'z1', url: 'https://jobs.lever.co/acme/abc/apply', pay: '$40/hr', sponsorship: 'none', title: 'Renamed' }),
    ]),
  }));
  assert.equal(feed.jobs.length, 1);
  const [job] = feed.jobs;
  assert.equal(job.source, 'simplify');
  assert.equal(job.title, 'Software Engineer Intern'); // the owner's fields stand
  assert.equal(job.pay, '$40/hr'); // …and the gaps are filled
  assert.equal(job.sponsorship, 'none');
  assert.deepEqual(
    feed.runs.map((r) => [r.name, r.status, r.inserted, r.enriched]),
    [['simplify', 'ok', 1, 0], ['scraper', 'ok', 0, 1]],
  );
});

test('a scraper row under a different URL still dedups on company + title + place', async () => {
  const feed = await refreshFeed(null, [source('simplify', true), source('scraper', false)], serve({
    simplify: parsed([listing({ id: 's1', url: 'https://www.acme.com/careers/job/1', company: 'Acme, Inc.' })]),
    scraper: parsed([
      listing({ id: 'z1', url: 'https://acme.wd1.myworkdayjobs.com/x/job/Seattle/SWE-Intern_R1', company: 'Acme', locations: ['Seattle, WA', 'Remote in USA'] }),
      // Same company and title in another city is a different requisition.
      listing({ id: 'z2', url: 'https://acme.wd1.myworkdayjobs.com/x/job/Austin/SWE-Intern_R2', company: 'Acme', locations: ['Austin, TX'] }),
    ]),
  }));
  assert.deepEqual(feed.jobs.map((j) => j.id).sort(), ['s1', 'z2']);
});

test('a feed that fails keeps its last good postings on the board', async () => {
  const sources = [source('simplify', true), source('scraper', false)];
  const first = await refreshFeed(null, sources, serve({
    simplify: parsed([listing({ id: 's1', url: 'https://a.example/1' })]),
    scraper: parsed([listing({ id: 'z1', url: 'https://b.example/2', title: 'Data Intern' })]),
  }));
  const second = await refreshFeed(first, sources, serve({
    simplify: parsed([listing({ id: 's1', url: 'https://a.example/1' })]),
    scraper: new Error('HTTP 503'),
  }));
  assert.deepEqual(second.jobs.map((j) => j.id).sort(), ['s1', 'z1']);
  const run = second.runs.find((r) => r.name === 'scraper')!;
  assert.equal(run.status, 'failed');
  assert.equal(run.carried, true);
  assert.equal(run.error, 'HTTP 503');
});

test('a feed that has stopped updating is withheld, not served', async () => {
  const feed = await refreshFeed(null, [source('simplify', true), source('abandoned', false)], serve({
    simplify: parsed([listing({ id: 's1', url: 'https://a.example/1' })]),
    abandoned: parsed([listing({ id: 'v1', url: 'https://c.example/3', title: 'Old Intern' })], now - STALE_AFTER_S - 86400),
  }));
  assert.deepEqual(feed.jobs.map((j) => j.id), ['s1']);
  const run = feed.runs.find((r) => r.name === 'abandoned')!;
  assert.equal(run.status, 'stale');
  assert.match(run.error ?? '', /^no updates since \d{4}-\d{2}-\d{2}$/);
});

test('nothing reachable and nothing to carry falls back to the sample', async () => {
  const feed = await refreshFeed(null, [source('simplify', true)], serve({ simplify: new Error('offline') }));
  assert.equal(feed.origin, 'sample');
  assert.ok(feed.jobs.length > 0);
});

test('a posting dated in the future is clamped to now', async () => {
  const feed = await refreshFeed(null, [source('simplify', true)], serve({
    simplify: parsed([listing({ id: 's1', url: 'https://a.example/1', postedAt: now + 86400 * 30 })]),
  }));
  assert.ok(feed.jobs[0].firstSeenAt <= Math.floor(Date.now() / 1000));
});

test('newest first', async () => {
  const feed = await refreshFeed(null, [source('simplify', true)], serve({
    simplify: parsed([
      listing({ id: 'old', url: 'https://a.example/old', postedAt: now - 86400 * 9 }),
      listing({ id: 'new', url: 'https://a.example/new', postedAt: now - 60 }),
    ]),
  }));
  assert.deepEqual(feed.jobs.map((j) => j.id), ['new', 'old']);
});

test('the snapshot round-trips the facts and rebuilds everything derived', async () => {
  const feed = await refreshFeed(null, [source('simplify', true)], serve({
    simplify: parsed([listing({ id: 's1', url: 'https://jobs.lever.co/acme/abc', pay: '$40/hr', locations: ['NYC', 'Remote in USA'] })]),
  }));
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'snap-')), 'feed.json');
  await writeSnapshot(feed, file);
  const back = await readSnapshot(file);
  assert.ok(back);
  assert.equal(back.origin, 'snapshot');
  assert.equal(back.lastRunAt, feed.lastRunAt);
  // Derived fields rebuilt identically. (JSON drops keys whose value is
  // undefined; an absent optional field and an undefined one mean the same.)
  const defined = (x: unknown) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(defined(back.jobs), defined(feed.jobs));
  assert.equal(back.jobs[0].canonicalKey, 'jobs.lever.co/acme/abc');
  assert.equal(back.jobs[0].isRemote, true);
  assert.equal(await readSnapshot(path.join(path.dirname(file), 'missing.json')), null);
});
