// Active-filter summary row — §5.4. Selected facet values render as removable
// pills with one Clear all. This row is also what the empty state points at.

import Link from 'next/link';
import type { Filters } from '@/lib/filter';
import { CATEGORY_LABELS, TERM_LABELS } from '@/lib/taxonomy';
import type { Category, Term } from '@/lib/types';
import { removeHref, type SP } from '@/lib/url';

export function ActiveFilterPills({ filters, sp }: { filters: Filters; sp: SP }) {
  const pills: { key: string; value: string; label: string }[] = [];

  for (const t of filters.terms)
    pills.push({ key: 'term', value: t, label: TERM_LABELS[t as Term] });
  for (const c of filters.categories)
    pills.push({ key: 'category', value: c, label: CATEGORY_LABELS[c as Category] });
  for (const l of filters.locations)
    pills.push({ key: 'loc', value: l, label: l.replace(/-/g, ' ') });

  return (
    <>
      {pills.map((p) => (
        <Link
          key={`${p.key}:${p.value}`}
          className="pill"
          href={removeHref(sp, p.key, p.value)}
          scroll={false}
          aria-label={`Remove filter ${p.label}`}
        >
          {p.label} <span className="x" aria-hidden>×</span>
        </Link>
      ))}
    </>
  );
}

export function ActiveFilterSummary({ filters, sp }: { filters: Filters; sp: SP }) {
  const has =
    filters.terms.size + filters.categories.size + filters.locations.size > 0;
  if (!has) return null;
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
