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
//
// Motion: the grid is keyed by the filter state, so a filter change mounts a
// fresh grid and its first rows deal in again (globals.css, "Cards"). Paging
// and density keep the key — growing the list or tightening it in place
// shouldn't replay anything.

import { Suspense } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getFeed, hasFeed, type Feed } from '@/lib/ingest';
import { parseFilters, applyFilters, newSinceCount } from '@/lib/filter';
import { parseVisit, sinceFor, VISIT_COOKIE, type Visit } from '@/lib/visit';
import { ageBucket, ageText } from '@/lib/age';
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
import { FilterBar, pillAt } from '@/components/FilterBar';
import { JobCard } from '@/components/JobCard';
import { SystemBanner } from '@/components/SystemBanner';
import { EmptyState } from '@/components/EmptyState';
import { ActiveFilterSummary } from '@/components/ActiveFilters';
import { BoardSkeleton } from '@/components/BoardSkeleton';
import { BoardMemory } from '@/components/BoardMemory';
import { CompanyMark } from '@/components/CompanyMark';
import { CountUp } from '@/components/CountUp';
import { SiteNav, LivePill } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

export const dynamic = 'force-dynamic';
// Room for the background refresh that `after()` runs once the response is
// sent — a full run over every feed takes a few seconds.
export const maxDuration = 60;

const TYPE_LABEL: Record<string, string> = {
  internship: 'internship',
  new_grad: 'new-grad',
  unknown: 'unclassified',
};

const TYPE_TITLE: Record<string, string> = {
  internship: 'Internships',
  new_grad: 'New grad roles',
  unknown: 'Unclassified',
};

const DENSITIES: { value: 'comfortable' | 'compact'; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

// Stagger index for the entrance animation (globals.css `.rise`).
const at = (i: number) => ({ '--i': i }) as React.CSSProperties;

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const visit = parseVisit((await cookies()).get(VISIT_COOKIE)?.value);
  const cold = !hasFeed();

  const meta = <NavMeta />;
  const board = <Board sp={sp} visit={visit} />;

  return (
    <>
      <SiteNav
        current="board"
        meta={
          cold ? (
            <Suspense fallback={<LivePill>Connecting…</LivePill>}>{meta}</Suspense>
          ) : (
            meta
          )
        }
      />
      <main className="shell" id="main">
        {cold ? <Suspense fallback={<BoardSkeleton />}>{board}</Suspense> : board}
      </main>
      <SiteFooter />
    </>
  );
}

async function NavMeta() {
  const { jobs, lastRunAt, origin } = await getFeed();
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);
  return (
    <LivePill>
      <strong>{jobs.length.toLocaleString('en-US')}</strong> live
      <span className="livepill__when">
        {' · '}checked {ageText(lastRunAt, now)}
        {origin === 'sample' && ' · sample data'}
      </span>
    </LivePill>
  );
}

// "14h ago", or "on Sep 20" once relative time stops meaning much.
function lastVisitPhrase(since: number, now: number): string {
  const t = ageText(since, now);
  return /ago$/.test(t) ? t : `on ${t}`;
}

// First visit: what this is and how to read it, with the live numbers and the
// newest postings themselves.
function Intro({ feed, now, sp }: { feed: Feed; now: number; sp: SP }) {
  const today = feed.jobs.filter((j) => now - j.firstSeenAt < 86400).length;
  const week = feed.jobs.filter((j) => now - j.firstSeenAt < 7 * 86400).length;
  const sources = feed.runs.filter((r) => r.status === 'ok' || r.carried).length;
  const newest = feed.jobs.filter((j) => j.active).slice(0, 4);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <p className="hero__eyebrow rise" style={at(0)}>
          <span className="livedot" aria-hidden /> Internships · New grad
          <span className="hide-sm"> · Refreshed hourly</span>
        </p>
        <h1 id="hero-title" className="rise" style={at(1)}>
          Catch the opening, <em>not the recap.</em>
        </h1>
        <p className="hero__lead rise" style={at(2)}>
          {feed.jobs.length.toLocaleString('en-US')} open early-career roles from {sources}{' '}
          live sources, newest first. Every filter is a link you can share, and the
          application is one click away.
        </p>
        <div className="hero__ctas rise" style={at(3)}>
          <a className="btn btn--primary btn--lg" href="#filters">
            Browse the board
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </a>
          <Link
            className="btn btn--glass btn--lg"
            href={`${toggleFlagHref(sp, 'campus')}#filters`}
          >
            Seattle + remote
          </Link>
        </div>
      </div>

      {newest.length > 0 && (
        <aside className="justposted glass rise" style={at(2)} aria-labelledby="justposted-title">
          <div className="justposted__head">
            <span className="livedot" aria-hidden />
            <span id="justposted-title">Just posted</span>
            <span className="justposted__hint">opens the application</span>
          </div>
          <ul>
            {newest.map((j, i) => (
              <li key={j.canonicalKey} style={at(i)}>
                <a
                  href={j.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-age={ageBucket(j.firstSeenAt, now)}
                >
                  <CompanyMark initials={j.initials} logoUrl={j.logoUrl} />
                  <span className="justposted__text">
                    <span className="justposted__company">{j.company}</span>
                    <span className="justposted__title">{j.title}</span>
                  </span>
                  <span className="justposted__age">{ageText(j.firstSeenAt, now)}</span>
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <dl className="stats">
        <div className="stat rise" style={at(4)}>
          <dt>Live roles</dt>
          <dd><CountUp value={feed.jobs.length} /></dd>
        </div>
        <div className="stat rise" style={at(5)}>
          <dt>Posted in the last 24h</dt>
          <dd><CountUp value={today} /></dd>
        </div>
        <div className="stat rise" style={at(6)}>
          <dt>Posted this week</dt>
          <dd><CountUp value={week} /></dd>
        </div>
        <div className="stat rise" style={at(7)}>
          <dt>Live sources, merged</dt>
          <dd><CountUp value={sources} /></dd>
        </div>
      </dl>

      <div className="hero__notes rise" style={at(8)}>
        <p>
          <span className="hero__note-index">01</span>
          The blue rail is time. Bright sky means just posted; it settles into earth
          as the window stays open.
        </p>
        <p>
          <span className="hero__note-index">02</span>
          Come back tomorrow: the board marks what&apos;s new since your last visit, and
          remembers which roles you&apos;ve opened.
        </p>
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
    <section className="welcome glass rise" style={at(0)} aria-label="Since your last visit">
      <div className="welcome__main">
        {count > 0 && <CountUp className="welcome__count" value={count} />}
        <p className="welcome__line">
          {count > 0 ? (
            <>
              new {typeLabel} {count === 1 ? 'posting' : 'postings'} since your last
              visit, {lastVisitPhrase(since, now)}.
            </>
          ) : (
            <>
              Nothing new in {typeLabel} postings since your last visit,{' '}
              {lastVisitPhrase(since, now)}. The board is checked hourly.
            </>
          )}
        </p>
      </div>
      {(count > 0 || showingOnlyNew) && (
        <Link
          className="btn btn--primary btn--next"
          href={toggleFlagHref(sp, 'new')}
          scroll={false}
        >
          {showingOnlyNew ? 'Show everything' : 'Show only these'}
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
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
        <Intro feed={feed} now={now} sp={sp} />
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

      <div className="results" id="roles">
        <div className="gridhead glass">
          <div className="gridhead__left">
            <h2 className="gridhead__title">{TYPE_TITLE[filters.type]}</h2>
            <span className="gridhead__count">
              {visible.length.toLocaleString('en-US')}{' '}
              {visible.length === 1 ? 'posting' : 'postings'} · newest first
            </span>
          </div>
          <div className="gridhead__right">
            <BoardMemory renderedAt={now} />
            {/* Density is documented on JobCard (§5.1); this is its control. */}
            <div className="segmented segmented--sm" aria-label="Card density">
              <span
                className="segmented__pill"
                aria-hidden
                style={pillAt(DENSITIES.findIndex((d) => d.value === density), DENSITIES.length)}
              />
              {DENSITIES.map((d) => (
                <Link
                  key={d.value}
                  href={setDensityHref(sp, d.value)}
                  aria-current={density === d.value}
                  scroll={false}
                  prefetch={false}
                >
                  <span className="segmented__label">{d.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState filters={filters} sp={sp} typeLabel={typeLabel} />
        ) : (
          <>
            <div
              key={gridKey(sp)}
              className={density === 'compact' ? 'grid grid--compact' : 'grid'}
            >
              {page.map((job, i) => (
                <FragmentWithEdge key={job.canonicalKey} edge={i === edge && i > 0} since={since} now={now}>
                  <JobCard job={job} now={now} density={density} showType={showType} />
                </FragmentWithEdge>
              ))}
            </div>
            <div className="gridfoot">
              {remaining > 0 && (
                <Link
                  className="btn btn--primary showmore"
                  href={moreHref(sp, page.length)}
                  scroll={false}
                  prefetch={false}
                >
                  Show {Math.min(PAGE_SIZE, remaining).toLocaleString('en-US')} more
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 5v14M6 13l6 6 6-6" />
                  </svg>
                </Link>
              )}
              <span className="gridfoot__count">
                {page.length.toLocaleString('en-US')} of {visible.length.toLocaleString('en-US')} shown
              </span>
              <a className="feedlink" href={feedHref(sp)}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8" />
                  <circle cx="6" cy="18" r="1.4" />
                </svg>
                RSS for this view
              </a>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// Identity of a result set: every param except the paging window and the
// density, which change how much of the same set is shown, not which set.
function gridKey(sp: SP): string {
  return Object.entries(sp)
    .filter(([k, v]) => k !== 'n' && k !== 'd' && v != null)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
    .sort()
    .join('&');
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
