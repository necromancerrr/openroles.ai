// EmptyState — §5.5. An empty screen is an invitation to act. Always name the
// specific filters that caused it; never a generic "no results found."

import Link from 'next/link';
import type { Filters } from '@/lib/filter';
import { ActiveFilterPills, hasActiveFilters } from './ActiveFilters';
import type { SP } from '@/lib/url';
import { clearFiltersHref } from '@/lib/url';

export function EmptyState({
  filters,
  sp,
  typeLabel,
}: {
  filters: Filters;
  sp: SP;
  typeLabel: string;
}) {
  const narrowed = hasActiveFilters(filters);

  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>
        <svg viewBox="0 0 48 48">
          <circle cx="21" cy="21" r="12" />
          <path d="m30 30 9 9" />
          <path d="M16 21h10" />
        </svg>
      </div>
      <div className="empty__title">
        {filters.query
          ? `No ${typeLabel} postings match “${filters.query}”.`
          : filters.newSince !== undefined
            ? `Nothing new in ${typeLabel} postings since your last visit.`
            : `No ${typeLabel} postings match these filters.`}
      </div>
      {narrowed ? (
        <>
          <div className="eyebrow">Remove a filter to widen the search</div>
          <div className="empty__filters">
            <ActiveFilterPills filters={filters} sp={sp} />
            <Link className="activefilters__clear" href={clearFiltersHref(sp)}>
              Clear all
            </Link>
          </div>
        </>
      ) : (
        <div className="eyebrow">
          Nothing is live in this tab right now.
        </div>
      )}
    </div>
  );
}
