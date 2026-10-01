// SearchBox — free text over company + title, the first thing in the filter
// panel.
//
// A plain GET <form action="/">, which is the whole trick: submitting navigates
// to /?q=…, so search is just another URL param, the page stays a Server
// Component, results are shareable, and there is no client JS and no debounce to
// get wrong. Every other filter rides along as a hidden input. (The ⌘K palette
// is the instant, as-you-type search; this is the one that filters the board.)

import type { SP } from '@/lib/url';
import { carriedParams, clearQueryHref } from '@/lib/url';
import Link from 'next/link';

export function SearchBox({ sp, query }: { sp: SP; query: string }) {
  return (
    <form className="search" action="/" method="get" role="search">
      {carriedParams(sp).map((p) => (
        <input key={p.name} type="hidden" name={p.name} value={p.value} />
      ))}
      <label className="search__field">
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          className="search__input"
          type="search"
          name="q"
          defaultValue={query}
          maxLength={80}
          placeholder="Search a company or title"
          aria-label="Search company or title"
          enterKeyHint="search"
          autoComplete="off"
        />
        {query ? (
          <Link className="search__clear" href={clearQueryHref(sp)} scroll={false}>
            Clear
          </Link>
        ) : (
          <kbd className="search__kbd" aria-hidden>
            /
          </kbd>
        )}
      </label>
      <button className="btn btn--primary search__go" type="submit">
        Search
      </button>
    </form>
  );
}
