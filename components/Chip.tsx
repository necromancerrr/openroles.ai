// Chip — §5.2. A filter control. Counts are not optional: every chip shows its
// result count from the current filter state, and a chip that leads to zero
// results is disabled before it can be clicked.
//
// The spec's ideal is <input type=checkbox> + <label>; here filters are driven
// by URL navigation to keep the page a Server Component, so each chip is a link
// (a navigation, natively keyboard-accessible). Selected/disabled state is
// carried in data-* attributes and announced via aria-*.

import Link from 'next/link';

export function Chip({
  label,
  count,
  selected = false,
  href,
}: {
  label: string;
  count?: number;
  selected?: boolean;
  href: string;
}) {
  const disabled = count === 0 && !selected;

  const inner = (
    <>
      <span>{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </>
  );

  if (disabled) {
    return (
      <span
        className="chip"
        data-disabled="true"
        aria-disabled="true"
        role="button"
      >
        {inner}
      </span>
    );
  }

  return (
    <Link
      className="chip"
      href={href}
      data-selected={selected ? 'true' : 'false'}
      aria-pressed={selected}
      scroll={false}
    >
      {inner}
    </Link>
  );
}
