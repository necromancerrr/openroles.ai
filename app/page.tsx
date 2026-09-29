// The board — a Server Component. Filters come from URL search params (§5.4),
// so the page renders on the server, links are shareable, and back/forward
// works with no client state.
//
// The feed is served from memory or from the build's snapshot, and refreshed
// after the response (lib/ingest.ts), so a request normally never waits on the
// network. The one case that does — a process with no snapshot, i.e. `next dev`
// before a build — streams the board in behind a skeleton. That boundary is
// applied *only* then: React streams a fallback even when the child resolves in
// 30ms, which would flash a skeleton on every filter click.
//
// The page is also where the reader's last visit (lib/visit.ts) turns into
// something on screen: first-timers get the introduction; returning readers
// get what's new since they were last here, a line across the grid where
// "new" ends, and a way to see only those.

import { Suspense } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getFeed, hasFeed, type Feed } from '@/lib/ingest';
import { parseFilters, applyFilters, newSinceCount } from '@/lib/filter';
import { parseVisit, sinceFor, VISIT_COOKIE, type Visit } from '@/lib/visit';
import { ageText } from '@/lib/age';
import {
  moreHref,
  parseShown,
  parseDensity,
  setDensityHref,
  toggleFlagHref,
  feedHref,
  PAGE_SIZE,
  type SP,
} from '@/lib/url';
import { FilterBar } from '@/components/FilterBar';
import { JobCard } from '@/components/JobCard';
import { SystemBanner } from '@/components/SystemBanner';
import { EmptyState } from '@/components/EmptyState';
import { ActiveFilterSummary } from '@/components/ActiveFilters';
import { BoardSkeleton } from '@/components/BoardSkeleton';
import { BoardMemory } from '@/components/BoardMemory';

export const dynamic = 'force-dynamic';
// Room for the background refresh that `after()` runs once the response is
// sent — a full run over every feed takes a few seconds.
export const maxDuration = 60;

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
  const visit = parseVisit((await cookies()).get(VISIT_COOKIE)?.value);
  const cold = !hasFeed();

  const meta = <MastheadMeta />;
  const board = <Board sp={sp} visit={visit} />;

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
  const { jobs, lastRunAt, origin } = await getFeed();
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);
  return (
    <div className="masthead__meta">
      {jobs.length.toLocaleString()} live · checked {ageText(lastRunAt, now)}
      {' · '}
      <Link href="/status">status</Link>
      {origin === 'sample' && ' · sample data'}
    </div>
  );
}

// "14h ago", or "on Sep 20" once relative time stops meaning much.
function lastVisitPhrase(since: number, now: number): string {
  const t = ageText(since, now);
  return /ago$/.test(t) ? t : `on ${t}`;
}

// First visit: what this is and how to read it, with the live numbers.
function Intro({ feed, now }: { feed: Feed; now: number }) {
  const today = feed.jobs.filter((j) => now - j.firstSeenAt < 86400).length;
  const sources = feed.runs.filter((r) => r.status === 'ok' || r.carried).length;
  return (
    <section className="intro" aria-labelledby="intro-title">
      <div className="intro__copy">
        <span className="eyebrow">Internships · new grad · refreshed hourly</span>
        <h1 id="intro-title">Catch the opening, not the recap.</h1>
        <p>
          {feed.jobs.length.toLocaleString()} open early-career roles from {sources} live
          sources, newest first — {today.toLocaleString()} of them posted in the last 24
          hours. Every filter is a link you can share, and the application is one click
          away.
        </p>
      </div>
      <div className="intro__notes">
        <div className="intro__note">
          <span className="intro__note-index">01</span>
          <p>
            The green rail is time. Brighter means newer; a quiet rail means the window
            has been open a while.
          </p>
        </div>
        <div className="intro__note">
          <span className="intro__note-index">02</span>
          <p>
            Come back tomorrow: the board marks what&apos;s new since your last visit,
            and remembers which roles you&apos;ve opened.
          </p>
        </div>
      </div>
    </section>
  );
}

// Returning reader: the one number they came for.
function WelcomeBack({
  count,
  since,
  now,
  typeLabel,
  showingOnlyNew,
  sp,
}: {
  count: number;
  since: number;
  now: number;
  typeLabel: string;
  showingOnlyNew: boolean;
  sp: SP;
}) {
  return (
    <section className="welcome" aria-label="Since your last visit">
      <p className="welcome__line">
        {count > 0 ? (
          <>
            <span className="welcome__count">{count.toLocaleString()}</span> new {typeLabel}{' '}
            {count === 1 ? 'posting' : 'postings'} since your last visit,{' '}
            {lastVisitPhrase(since, now)}.
          </>
        ) : (
          <>
            Nothing new in {typeLabel} postings since your last visit,{' '}
            {lastVisitPhrase(since, now)}. The board is checked hourly.
          </>
        )}
      </p>
      {(count > 0 || showingOnlyNew) && (
        <Link className="welcome__cta" href={toggleFlagHref(sp, 'new')} scroll={false}>
          {showingOnlyNew ? 'Show everything' : 'Show only these →'}
        </Link>
      )}
    </section>
  );
}

async function Board({ sp, visit }: { sp: SP; visit: Visit }) {
  const feed = await getFeed();
  const { jobs } = feed;
  // This timestamp is intentionally taken once per server render so every card
  // on the page uses the same age boundary.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);

  const since = sinceFor(visit, now);
  const filters = parseFilters(sp, since);
  const visible = applyFilters(jobs, filters);
  const showType = filters.type === 'unknown';
  const density = parseDensity(sp);
  const typeLabel = TYPE_LABEL[filters.type];
  const newCount = since !== undefined ? newSinceCount(jobs, filters, since) : 0;

  // Render a window, not the whole result set — the board is a scanning surface,
  // and all 1.4k cards is ~3MB of markup. `n` grows it; filters reset it.
  const shown = Math.min(parseShown(sp), visible.length);
  const page = shown < visible.length ? visible.slice(0, shown) : visible;
  const remaining = visible.length - page.length;

  // Where "new since your last visit" ends in this window — drawn only when
  // there's something on both sides of it.
  const edge =
    since !== undefined && filters.newSince === undefined
      ? page.findIndex((j) => j.firstSeenAt <= since)
      : -1;

  return (
    <>
      {since === undefined ? (
        <Intro feed={feed} now={now} />
      ) : (
        <WelcomeBack
          count={newCount}
          since={since}
          now={now}
          typeLabel={typeLabel}
          showingOnlyNew={filters.newSince !== undefined}
          sp={sp}
        />
      )}

      <SystemBanner feed={feed} now={now} />

      <FilterBar jobs={jobs} filters={filters} sp={sp} />
      <ActiveFilterSummary filters={filters} sp={sp} />

      <div className="gridhead" id="roles">
        <span className="eyebrow">{typeLabel} · newest first</span>
        <div className="gridhead__right">
          <BoardMemory renderedAt={now} />
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
            {visible.length.toLocaleString()} {visible.length === 1 ? 'posting' : 'postings'}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState filters={filters} sp={sp} typeLabel={typeLabel} />
      ) : (
        <>
          <div className={density === 'compact' ? 'grid grid--compact' : 'grid'}>
            {page.map((job, i) => (
              <FragmentWithEdge key={job.canonicalKey} edge={i === edge && i > 0} since={since} now={now}>
                <JobCard job={job} now={now} density={density} showType={showType} />
              </FragmentWithEdge>
            ))}
          </div>
          <div className="gridfoot">
            {remaining > 0 && (
              <Link
                className="showmore"
                href={moreHref(sp, page.length)}
                scroll={false}
                prefetch={false}
              >
                Show {Math.min(PAGE_SIZE, remaining)} more
              </Link>
            )}
            <span className="eyebrow">
              {page.length.toLocaleString()} of {visible.length.toLocaleString()} shown
            </span>
            <span className="gridfoot__aside">
              <span className="kbdhint">
                <kbd>/</kbd> search · <kbd>j</kbd> <kbd>k</kbd> move · <kbd>↵</kbd> open
              </span>
              <a className="feedlink" href={feedHref(sp)}>
                RSS for this view
              </a>
            </span>
          </div>
        </>
      )}
    </>
  );
}

// A card, preceded — for exactly one card per render — by the line where the
// reader's "new since last visit" ends.
function FragmentWithEdge({
  edge,
  since,
  now,
  children,
}: {
  edge: boolean;
  since: number | undefined;
  now: number;
  children: React.ReactNode;
}) {
  return (
    <>
      {edge && since !== undefined && (
        <div className="grid__since" role="separator">
          <span aria-hidden>↑</span> New since your last visit, {lastVisitPhrase(since, now)}
        </div>
      )}
      {children}
    </>
  );
}
