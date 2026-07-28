// URL param helpers for the filter bar. Multi-value facets are stored as a
// single comma-joined param (term=summer_2026,fall_2026) so the query string
// stays compact and readable.

export type SP = Record<string, string | string[] | undefined>;

function get(sp: SP, key: string): string[] {
  const v = sp[key];
  if (v == null) return [];
  const raw = Array.isArray(v) ? v.join(',') : v;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function build(sp: SP): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    const val = Array.isArray(v) ? v.join(',') : v;
    if (val) usp.set(k, val);
  }
  const s = usp.toString();
  return s ? `/?${s}` : '/';
}

// Stand-in for a value the client fills in — the location type-ahead builds one
// href template server-side and substitutes the slug on selection. It lives here
// rather than in the client component: anything exported from a 'use client'
// module reaches the server as a reference stub, not as its value.
export const SLUG_PLACEHOLDER = '__slug__';

// Toggle a value inside a multi-value facet, returning the resulting href.
// Changing a filter resets paging — `n` is a position in one result set, and it
// means nothing in the next one.
export function toggleHref(sp: SP, key: string, value: string): string {
  const cur = get(sp, key);
  const next = cur.includes(value)
    ? cur.filter((v) => v !== value)
    : [...cur, value];
  const copy: SP = { ...sp };
  if (next.length) copy[key] = next.join(',');
  else delete copy[key];
  delete copy.n;
  return build(copy);
}

// Set a single-value param (the Type segmented control). Switching type also
// clears the term filter, since terms only exist on the internship tab (§5.4).
export function setTypeHref(sp: SP, value: string): string {
  const copy: SP = { ...sp, type: value };
  delete copy.term;
  delete copy.n;
  return build(copy);
}

// Toggle a boolean param that's either present as `1` or absent (Remote only).
export function toggleFlagHref(sp: SP, key: string): string {
  const copy: SP = { ...sp };
  if (copy[key] === '1') delete copy[key];
  else copy[key] = '1';
  delete copy.n;
  return build(copy);
}

// Density is presentation, not a filter: it doesn't touch the result set, so it
// keeps whatever window the reader has already scrolled open.
export function setDensityHref(sp: SP, value: 'comfortable' | 'compact'): string {
  const copy: SP = { ...sp };
  if (value === 'compact') copy.d = 'compact';
  else delete copy.d;
  return build(copy);
}

export function parseDensity(sp: SP): 'comfortable' | 'compact' {
  const raw = Array.isArray(sp.d) ? sp.d[0] : sp.d;
  return raw === 'compact' ? 'compact' : 'comfortable';
}

// The search box is a plain GET form, so it submits only its own fields. Every
// other bit of filter state has to ride along as a hidden input — except `q`
// itself (the text input owns it) and `n` (a new query is a new result set).
export function carriedParams(sp: SP): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'q' || k === 'n' || v == null) continue;
    const val = Array.isArray(v) ? v.join(',') : v;
    if (val) out.push({ name: k, value: val });
  }
  return out;
}

export function clearQueryHref(sp: SP): string {
  const copy: SP = { ...sp };
  delete copy.q;
  delete copy.n;
  return build(copy);
}

// --- Paging (`n` = how many cards to render) ------------------------------
// The board is 1.4k+ postings deep. Rendering all of them costs megabytes of
// markup and RSC payload for a surface nobody scrolls past the first screen of,
// so the page renders a window and grows it on request. Server-rendered, in the
// URL, no client state — same contract as the filters.
export const PAGE_SIZE = 120;
const MAX_SHOWN = 5000;

export function parseShown(sp: SP): number {
  const raw = Array.isArray(sp.n) ? sp.n[0] : sp.n;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= PAGE_SIZE) return PAGE_SIZE;
  // Snap to a page boundary so hand-edited values can't produce odd windows.
  return Math.min(Math.ceil(n / PAGE_SIZE) * PAGE_SIZE, MAX_SHOWN);
}

export function moreHref(sp: SP, shown: number): string {
  return build({ ...sp, n: String(shown + PAGE_SIZE) });
}

// Remove one value from a facet (active-filter pills).
export function removeHref(sp: SP, key: string, value: string): string {
  return toggleHref(sp, key, value);
}

export const clearAllHref = '/';
