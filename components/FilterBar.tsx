// FilterBar — §5.4. Narrowest-to-widest, top to bottom:
//   1. Type  — segmented (Internships · New grad · Unclassified)
//   2. Term  — chips, internships only (row disappears on other tabs)
//   3. Category — chips, seven canonical values
//   4. Location — top ~12 chips + type-ahead for the tail
//   5. Visa — "I need sponsorship", which hides postings that say they won't
// All counts are computed server-side from the current filter state (§5.2).
//
// On a phone, rows 2–5 fold behind a "More filters" toggle: unfolded, they are
// two screens of chips before the first job. The toggle is a checkbox and a
// sibling selector — no client JS, no layout shift, and the desktop layout
// never sees it.

import Link from 'next/link';
import type { Job, Category, Term, JobType } from '@/lib/types';
import type { Filters } from '@/lib/filter';
import {
  typeCounts,
  facetCounts,
  remoteCount,
  campusCount,
  visaCounts,
} from '@/lib/filter';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  termChipOrder,
  termLabel,
} from '@/lib/taxonomy';
import { Chip } from './Chip';
import { LocationTypeahead } from './LocationTypeahead';
import { SearchBox } from './SearchBox';
import {
  toggleHref,
  setTypeHref,
  toggleFlagHref,
  SLUG_PLACEHOLDER,
  type SP,
} from '@/lib/url';

const TYPE_TABS: { value: JobType; label: string }[] = [
  { value: 'internship', label: 'Internships' },
  { value: 'new_grad', label: 'New grad' },
  { value: 'unknown', label: 'Unclassified' },
];

export function FilterBar({
  jobs,
  filters,
  sp,
}: {
  jobs: Job[];
  filters: Filters;
  sp: SP;
}) {
  const tCounts = typeCounts(jobs, filters);

  const termCounts = facetCounts<Term>(jobs, filters, 'term', (j) => j.terms);
  // The chip row is drawn from every term in this tab's feed, not just the
  // ones with results right now: §5.2 wants a zero-count chip disabled in
  // place, not gone, so the row doesn't reshuffle under the reader as they
  // filter. A term with only a handful of postings in the whole feed gets no
  // chip, though — the scraped feeds carry stray far-off terms ("Winter 2029",
  // one posting) that turned one row into two on a laptop and seven on a phone.
  // Those postings stay on the board; a selected term always keeps its chip.
  const MIN_TERM_POSTINGS = 20;
  const termTotals = new Map<Term, number>();
  for (const j of jobs) {
    if (j.type !== filters.type) continue;
    for (const t of j.terms) termTotals.set(t, (termTotals.get(t) ?? 0) + 1);
  }
  const allTerms = new Set<Term>(
    [...termTotals]
      .filter(([t, n]) => n >= MIN_TERM_POSTINGS || t === 'unspecified' || filters.terms.has(t))
      .map(([t]) => t),
  );
  const catCounts = facetCounts<Category>(jobs, filters, 'category', (j) => [j.category]);
  const locCounts = facetCounts<string>(jobs, filters, 'location', (j) => j.locSlugs);

  // Top ~12 locations by count for chips; the rest go to the type-ahead.
  const locByLabel = new Map<string, { slug: string; count: number }>();
  for (const j of jobs) {
    // only count within the current type tab for a stable head
    if (j.type !== filters.type) continue;
    for (let i = 0; i < j.locations.length; i++) {
      const label = j.locations[i];
      const cur = locByLabel.get(label) ?? { slug: j.locSlugs[i], count: 0 };
      cur.count++;
      locByLabel.set(label, cur);
    }
  }
  const locSorted = [...locByLabel.entries()].sort((a, b) => b[1].count - a[1].count);
  const topLocs = locSorted.slice(0, 12);
  // Already-selected values live in the summary row, not the tail search.
  const tailLocs = locSorted
    .slice(12)
    .filter(([, { slug }]) => !filters.locations.has(slug))
    .map(([label]) => label);

  const showTerms = filters.type === 'internship';
  const visa = visaCounts(jobs, filters);
  const facetsActive =
    filters.terms.size +
    filters.categories.size +
    filters.locations.size +
    (filters.remote ? 1 : 0) +
    (filters.visa ? 1 : 0);

  return (
    <div className="filterbar">
      <div className="campusbar">
        <div className="campusbar__copy">
          <span className="campusbar__badge">UW launchpad</span>
          <div>
            <strong>Seattle + remote, in one tap.</strong>
            <p>Built for Huskies searching around class, commute, and graduation.</p>
          </div>
        </div>
        <Chip
          label={filters.campus ? 'Campus view on' : 'Try campus view'}
          count={campusCount(jobs, filters)}
          selected={filters.campus}
          href={toggleFlagHref(sp, 'campus')}
        />
      </div>

      {/* 0. Search — widest possible net, so it sits above the facets. */}
      <div className="filterrow">
        <span className="filterrow__label">Search</span>
        <SearchBox sp={sp} query={filters.query} />
      </div>

      {/* 1. Type */}
      <div className="filterrow">
        <span className="filterrow__label">Type</span>
        <div className="segmented" role="tablist" aria-label="Job type">
          {TYPE_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={setTypeHref(sp, tab.value)}
              role="tab"
              aria-selected={filters.type === tab.value}
              aria-current={filters.type === tab.value}
              scroll={false}
            >
              {tab.label}
              <span className="count">{tCounts[tab.value]}</span>
            </Link>
          ))}
        </div>
      </div>

      <input
        type="checkbox"
        id="facets-toggle"
        className="facets-toggle__input"
        aria-controls="facets"
      />
      <label htmlFor="facets-toggle" className="facets-toggle">
        <span>More filters</span>
        {facetsActive > 0 && <span className="count">{facetsActive} active</span>}
        <span className="facets-toggle__chev" aria-hidden>
          ▾
        </span>
      </label>

      <div className="facets" id="facets">
      {/* 2. Term — internships only */}
      {showTerms && (
        <fieldset className="filterrow">
          <legend>Filter by term</legend>
          <span className="filterrow__label" aria-hidden>Term</span>
          {termChipOrder(allTerms, new Date(), filters.terms).map((t) => (
            <Chip
              key={t}
              label={termLabel(t)}
              count={termCounts.get(t) ?? 0}
              selected={filters.terms.has(t)}
              href={toggleHref(sp, 'term', t)}
            />
          ))}
        </fieldset>
      )}

      {/* 3. Category */}
      <fieldset className="filterrow">
        <legend>Filter by category</legend>
        <span className="filterrow__label" aria-hidden>Category</span>
        {CATEGORY_ORDER.map((c) => (
          <Chip
            key={c}
            label={CATEGORY_LABELS[c]}
            count={catCounts.get(c) ?? 0}
            selected={filters.categories.has(c)}
            href={toggleHref(sp, 'category', c)}
          />
        ))}
      </fieldset>

      {/* 4. Location */}
      <fieldset className="filterrow">
        <legend>Filter by location</legend>
        <span className="filterrow__label" aria-hidden>Location</span>
        {/* Distinct from the "Remote in USA" location value below: this is the
            derived isRemote flag across every remote-ish location string. */}
        <Chip
          label="Remote only"
          count={remoteCount(jobs, filters)}
          selected={filters.remote}
          href={toggleFlagHref(sp, 'remote')}
        />
        {topLocs.map(([label, { slug }]) => (
          <Chip
            key={slug}
            label={label}
            count={locCounts.get(slug) ?? 0}
            selected={filters.locations.has(slug)}
            href={toggleHref(sp, 'loc', slug)}
          />
        ))}
        {tailLocs.length > 0 && (
          <LocationTypeahead
            options={tailLocs}
            hrefTemplate={toggleHref(sp, 'loc', SLUG_PLACEHOLDER)}
          />
        )}
      </fieldset>

      {/* 5. Visa. Silence isn't a "no", so only postings that state they
          won't sponsor — or require citizenship — are hidden. The note says
          how many that is, because it's a minority and the reader should know
          the filter can't vouch for the rest. */}
      <fieldset className="filterrow">
        <legend>Visa sponsorship</legend>
        <span className="filterrow__label" aria-hidden>Visa</span>
        <Chip
          label="I need sponsorship"
          count={visa.kept}
          selected={filters.visa}
          href={toggleFlagHref(sp, 'visa')}
        />
        <span className="filterrow__note">
          {filters.visa ? 'Hiding' : 'Hides'} {visa.excluded.toLocaleString()} posting
          {visa.excluded === 1 ? '' : 's'} that say they won&apos;t sponsor or need US
          citizenship. Most postings don&apos;t say either way.
        </span>
      </fieldset>
      </div>
    </div>
  );
}
