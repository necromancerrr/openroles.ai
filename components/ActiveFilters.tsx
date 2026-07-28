// Active-filter summary row — §5.4. Selected facet values render as removable
// pills with one Clear all. This row is also what the empty state points at.

import Link from 'next/link';
import type { Filters } from '@/lib/filter';
import { CATEGORY_LABELS, TERM_LABELS } from '@/lib/taxonomy';
import type { Category, Term } from '@/lib/types';
import {
  removeHref,
  clearQueryHref,
  toggleFlagHref,
  type SP,
} from '@/lib/url';

export function ActiveFilterPills({ filters, sp }: { filters: Filters; sp: SP }) {
  // Each pill carries the href that removes it — one link, one thing removed.
  const pills: { id: string; label: string; href: string }[] = [];

  if (filters.query)
    pills.push({
      id: 'q',
      label: `“${filters.query}”`,
      href: clearQueryHref(sp),
    });
  for (const t of filters.terms)
    pills.push({
      id: `term:${t}`,
      label: TERM_LABELS[t as Term],
      href: removeHref(sp, 'term', t),
    });
  for (const c of filters.categories)
    pills.push({
      id: `category:${c}`,
      label: CATEGORY_LABELS[c as Category],
      href: removeHref(sp, 'category', c),
    });
  if (filters.remote)
    pills.push({ id: 'remote', label: 'Remote', href: toggleFlagHref(sp, 'remote') });
  for (const l of filters.locations)
    pills.push({
      id: `loc:${l}`,
      label: l.replace(/-/g, ' '),
      href: removeHref(sp, 'loc', l),
    });

  return (
    <>
      {pills.map((p) => (
        <Link
          key={p.id}
          className="pill"
          href={p.href}
          scroll={false}
          aria-label={`Remove filter ${p.label}`}
        >
          {p.label} <span className="x" aria-hidden>×</span>
        </Link>
      ))}
    </>
  );
}

// Does anything narrow the board right now? Type is always set, so it doesn't
// count — it's a tab, not a filter.
export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.terms.size +
      filters.categories.size +
      filters.locations.size +
      (filters.query ? 1 : 0) +
      (filters.remote ? 1 : 0) >
    0
  );
}

export function ActiveFilterSummary({ filters, sp }: { filters: Filters; sp: SP }) {
  if (!hasActiveFilters(filters)) return null;
  return (
    <div className="activefilters">
      <span className="eyebrow">Active</span>
      <ActiveFilterPills filters={filters} sp={sp} />
      <Link className="activefilters__clear" href="/">
        Clear all
      </Link>
    </div>
  );
}
