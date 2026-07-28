// EmptyState — §5.5. An empty screen is an invitation to act. Always name the
// specific filters that caused it; never a generic "no results found."

import Link from 'next/link';
import type { Filters } from '@/lib/filter';
import { ActiveFilterPills, hasActiveFilters } from './ActiveFilters';
import type { SP } from '@/lib/url';

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
      <div className="empty__title">
        {filters.query
          ? `No ${typeLabel} postings match “${filters.query}”.`
          : `No ${typeLabel} postings match these filters.`}
      </div>
      {narrowed ? (
        <>
          <div className="eyebrow">Remove a filter to widen the search</div>
          <div className="empty__filters">
            <ActiveFilterPills filters={filters} sp={sp} />
            <Link className="activefilters__clear" href="/">
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
