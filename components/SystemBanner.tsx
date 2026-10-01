// SystemBanner — §5.3. One instance, above the grid. A statement of data
// quality, deliberately not dismissible. Copy states what happened and what it
// means for the data on screen. No apology, no exclamation mark. Rust, because
// rust only ever means "watch out" on this board.
//
// A feed withheld as stale (lib/ingest.ts) is not reported here: it's a
// decision the system made, not a failure the reader should weigh, and /status
// lists it with its reason.

import type { Feed } from '@/lib/ingest';

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="banner" role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
        <path d="M12 10v4.2M12 16.9v.1" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

export function SystemBanner({ feed, now }: { feed: Feed; now: number }) {
  const { runs, lastRunAt, origin, jobs } = feed;

  // `empty` — zero rows.
  if (jobs.length === 0) {
    return (
      <Banner>
        No postings yet — the fetcher hasn&apos;t run.
      </Banner>
    );
  }

  // Nothing reachable, nothing carried: what's on screen is the fixture.
  if (origin === 'sample') {
    return (
      <Banner>
        Couldn&apos;t reach any source. These are sample postings, not live ones.
      </Banner>
    );
  }

  // `partial` — some feeds failed this run.
  const counted = runs.filter((r) => r.status !== 'stale');
  const failed = counted.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    const carried = failed.some((r) => r.carried);
    return (
      <Banner>
        Couldn&apos;t reach {failed.length} of {counted.length} sources.{' '}
        {carried
          ? 'Their postings are from the last successful check.'
          : 'Showing everything else.'}
      </Banner>
    );
  }

  // `stale` — newest run > 3h old.
  const hours = Math.floor((now - lastRunAt) / 3600);
  if (hours >= 3) {
    return (
      <Banner>
        Last checked {hours} hours ago. New postings may be missing.
      </Banner>
    );
  }

  return null;
}
