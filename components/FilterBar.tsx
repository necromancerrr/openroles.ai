// FilterBar — §5.4. Narrowest-to-widest, top to bottom:
//   1. Type  — segmented (Internships · New grad · Unclassified)
//   2. Term  — chips, internships only (row disappears on other tabs)
//   3. Category — chips, six canonical values
//   4. Location — top ~12 chips + type-ahead for the tail
// All counts are computed server-side from the current filter state (§5.2).

import Link from 'next/link';
import type { Job, Category, Term, JobType } from '@/lib/types';
import type { Filters } from '@/lib/filter';
import { typeCounts, facetCounts, remoteCount, campusCount } from '@/lib/filter';
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
  // The chip row is drawn from every term in the feed, not just the ones with
  // results right now: §5.2 wants a zero-count chip disabled in place, not gone,
  // so the row doesn't reshuffle under the reader as they filter.
  const allTerms = new Set<Term>();
  for (const j of jobs) for (const t of j.terms) allTerms.add(t);
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
              aria-current={filters.type === tab.value}
              scroll={false}
            >
              {tab.label}
              <span className="count">{tCounts[tab.value]}</span>
            </Link>
          ))}
        </div>
      </div>

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
    </div>
  );
}
