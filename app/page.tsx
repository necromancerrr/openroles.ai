// The board — a Server Component. Filters come from URL search params (§5.4),
// so the page renders on the server, links are shareable, and back/forward
// works with no client state.
//
// A cold request has ~23MB of source JSON to download before it can render a
// card, so the board streams in behind a skeleton and the masthead paints at
// once. That boundary is applied *only* when the feed isn't already in memory:
// a warm request answers in ~30ms, and React streams a fallback even when the
// child resolves that fast, which would flash a skeleton on every filter click.

import { Suspense } from 'react';
import Link from 'next/link';
import { getFeed, isFeedFresh } from '@/lib/ingest';
import { parseFilters, applyFilters } from '@/lib/filter';
import {
  moreHref,
  parseShown,
  parseDensity,
  setDensityHref,
  PAGE_SIZE,
  type SP,
} from '@/lib/url';
import { FilterBar } from '@/components/FilterBar';
import { JobCard } from '@/components/JobCard';
import { SystemBanner } from '@/components/SystemBanner';
import { EmptyState } from '@/components/EmptyState';
import { ActiveFilterSummary } from '@/components/ActiveFilters';
import { BoardSkeleton } from '@/components/BoardSkeleton';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  internship: 'internship',
  new_grad: 'new-grad',
  unknown: 'unclassified',
};

const DENSITIES: { value: 'comfortable' | 'compact'; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const cold = !isFeedFresh();

  const meta = <MastheadMeta />;
  const board = <Board sp={sp} />;

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
        {cold ? (
          <Suspense
            fallback={
              <div className="masthead__meta">
                <Link href="/status">status</Link>
              </div>
            }
          >
            {meta}
          </Suspense>
        ) : (
          meta
        )}
      </header>

      {cold ? <Suspense fallback={<BoardSkeleton />}>{board}</Suspense> : board}
    </main>
  );
}

async function MastheadMeta() {
  const { jobs, lastRunAt, usedFallback } = await getFeed();
  return (
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
  );
}

async function Board({ sp }: { sp: SP }) {
  const { jobs, runs, lastRunAt } = await getFeed();
  const now = Math.floor(Date.now() / 1000);

  const filters = parseFilters(sp);
  const visible = applyFilters(jobs, filters);
  const showType = filters.type === 'unknown';
  const density = parseDensity(sp);

  // Render a window, not the whole result set — the board is a scanning surface,
  // and all 1.4k cards is ~3MB of markup. `n` grows it; filters reset it.
  const shown = Math.min(parseShown(sp), visible.length);
  const page = shown < visible.length ? visible.slice(0, shown) : visible;
  const remaining = visible.length - page.length;

  return (
    <>
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
        <div className="gridhead__right">
          {/* Density is documented on JobCard (§5.1); this is its control. */}
          <div className="segmented segmented--sm" aria-label="Card density">
            {DENSITIES.map((d) => (
              <Link
                key={d.value}
                href={setDensityHref(sp, d.value)}
                aria-current={density === d.value}
                scroll={false}
                prefetch={false}
              >
                {d.label}
              </Link>
            ))}
          </div>
          <span className="gridhead__count">
            {visible.length} {visible.length === 1 ? 'posting' : 'postings'}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          filters={filters}
          sp={sp}
          typeLabel={TYPE_LABEL[filters.type]}
        />
      ) : (
        <>
          <div className={density === 'compact' ? 'grid grid--compact' : 'grid'}>
            {page.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                now={now}
                density={density}
                showType={showType}
              />
            ))}
          </div>
          {remaining > 0 && (
            <div className="gridfoot">
              <Link
                className="showmore"
                href={moreHref(sp, page.length)}
                scroll={false}
                prefetch={false}
              >
                Show {Math.min(PAGE_SIZE, remaining)} more
              </Link>
              <span className="eyebrow">
                {page.length} of {visible.length} shown
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
}
