// The board — a Server Component. Filters come from URL search params (§5.4),
// so the page renders on the server, links are shareable, and back/forward
// works with no client state.

import Link from 'next/link';
import { getFeed } from '@/lib/ingest';
import { parseFilters, applyFilters } from '@/lib/filter';
import type { SP } from '@/lib/url';
import { FilterBar } from '@/components/FilterBar';
import { JobCard } from '@/components/JobCard';
import { SystemBanner } from '@/components/SystemBanner';
import { EmptyState } from '@/components/EmptyState';
import { ActiveFilterSummary } from '@/components/ActiveFilters';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  internship: 'internship',
  new_grad: 'new-grad',
  unknown: 'unclassified',
};

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const { jobs, runs, lastRunAt, usedFallback } = await getFeed();
  const now = Math.floor(Date.now() / 1000);

  const filters = parseFilters(sp);
  const visible = applyFilters(jobs, filters);
  const showType = filters.type === 'unknown';

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <div className="wordmark">
            open<span>roles</span>
          </div>
          <div className="eyebrow" style={{ marginTop: 4 }}>
            what&apos;s open, and what&apos;s about to close
          </div>
        </div>
        <div className="masthead__meta">
          {jobs.length} live · updated{' '}
          {new Date(lastRunAt * 1000).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
          {' · '}
          <Link href="/status">status</Link>
          {usedFallback && ' · sample data'}
        </div>
      </header>

      <SystemBanner
        runs={runs}
        lastRunAt={lastRunAt}
        now={now}
        totalJobs={jobs.length}
      />

      <FilterBar jobs={jobs} filters={filters} sp={sp} />
      <ActiveFilterSummary filters={filters} sp={sp} />

      <div className="gridhead">
        <span className="eyebrow">
          {TYPE_LABEL[filters.type]} · newest first
        </span>
        <span className="gridhead__count">
          {visible.length} {visible.length === 1 ? 'posting' : 'postings'}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          filters={filters}
          sp={sp}
          typeLabel={TYPE_LABEL[filters.type]}
        />
      ) : (
        <div className="grid">
          {visible.map((job) => (
            <JobCard key={job.id} job={job} now={now} showType={showType} />
          ))}
        </div>
      )}
    </main>
  );
}
