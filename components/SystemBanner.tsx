// SystemBanner — §5.3. One instance, above the grid. A statement of data
// quality, deliberately not dismissible. Copy states what happened and what it
// means for the data on screen. No apology, no exclamation mark.

import type { SourceRun } from '@/lib/ingest';

export function SystemBanner({
  runs,
  lastRunAt,
  now,
  totalJobs,
}: {
  runs: SourceRun[];
  lastRunAt: number;
  now: number;
  totalJobs: number;
}) {
  // `empty` — zero rows.
  if (totalJobs === 0) {
    return (
      <div className="banner" role="status" aria-live="polite">
        No postings yet — the fetcher hasn&apos;t run.
      </div>
    );
  }

  // `partial` — any source failed or was skipped.
  const failed = runs.filter((r) => r.status === 'failed' || r.status === 'skipped');
  if (failed.length > 0) {
    return (
      <div className="banner" role="status" aria-live="polite">
        Couldn&apos;t reach {failed.length} of {runs.length} sources. Showing
        everything else.
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
