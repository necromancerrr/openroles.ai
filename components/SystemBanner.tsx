// SystemBanner — §5.3. One instance, above the grid. A statement of data
// quality, deliberately not dismissible. Copy states what happened and what it
// means for the data on screen. No apology, no exclamation mark.
//
// A feed withheld as stale (lib/ingest.ts) is not reported here: it's a
// decision the system made, not a failure the reader should weigh, and /status
// lists it with its reason.

import type { Feed } from '@/lib/ingest';

export function SystemBanner({ feed, now }: { feed: Feed; now: number }) {
  const { runs, lastRunAt, origin, jobs } = feed;

  // `empty` — zero rows.
  if (jobs.length === 0) {
    return (
      <div className="banner" role="status" aria-live="polite">
        No postings yet — the fetcher hasn&apos;t run.
      </div>
    );
  }

  // Nothing reachable, nothing carried: what's on screen is the fixture.
  if (origin === 'sample') {
    return (
      <div className="banner" role="status" aria-live="polite">
        Couldn&apos;t reach any source. These are sample postings, not live ones.
      </div>
    );
  }

  // `partial` — some feeds failed this run.
  const counted = runs.filter((r) => r.status !== 'stale');
  const failed = counted.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    const carried = failed.some((r) => r.carried);
    return (
      <div className="banner" role="status" aria-live="polite">
        Couldn&apos;t reach {failed.length} of {counted.length} sources.{' '}
        {carried
          ? 'Their postings are from the last successful check.'
          : 'Showing everything else.'}
      </div>
    );
  }

  // `stale` — newest run > 3h old.
  const hours = Math.floor((now - lastRunAt) / 3600);
  if (hours >= 3) {
    return (
      <div className="banner" role="status" aria-live="polite">
        Last checked {hours} hours ago. New postings may be missing.
      </div>
    );
  }

  return null;
}
