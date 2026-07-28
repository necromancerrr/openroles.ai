// SearchBox — free text over company + title, the first row of the FilterBar.
//
// A plain GET <form action="/">, which is the whole trick: submitting navigates
// to /?q=…, so search is just another URL param, the page stays a Server
// Component, results are shareable, and there is no client JS and no debounce to
// get wrong. Every other filter rides along as a hidden input.

import type { SP } from '@/lib/url';
import { carriedParams, clearQueryHref } from '@/lib/url';
import Link from 'next/link';

export function SearchBox({ sp, query }: { sp: SP; query: string }) {
  return (
    <form className="search" action="/" method="get" role="search">
      {carriedParams(sp).map((p) => (
        <input key={p.name} type="hidden" name={p.name} value={p.value} />
      ))}
      <input
        className="search__input"
        type="search"
        name="q"
        defaultValue={query}
        maxLength={80}
        placeholder="Company or title…"
        aria-label="Search company or title"
        enterKeyHint="search"
        autoComplete="off"
      />
      <button className="search__go" type="submit">
        Search
      </button>
      {query && (
        <Link className="search__clear" href={clearQueryHref(sp)} scroll={false}>
          Clear
        </Link>
      )}
    </form>
  );
}
