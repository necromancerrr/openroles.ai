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

// Toggle a value inside a multi-value facet, returning the resulting href.
export function toggleHref(sp: SP, key: string, value: string): string {
  const cur = get(sp, key);
  const next = cur.includes(value)
    ? cur.filter((v) => v !== value)
    : [...cur, value];
  const copy: SP = { ...sp };
  if (next.length) copy[key] = next.join(',');
  else delete copy[key];
  return build(copy);
}

// Set a single-value param (the Type segmented control). Switching type also
// clears the term filter, since terms only exist on the internship tab (§5.4).
export function setTypeHref(sp: SP, value: string): string {
  const copy: SP = { ...sp, type: value };
  delete copy.term;
  return build(copy);
}

// Remove one value from a facet (active-filter pills).
export function removeHref(sp: SP, key: string, value: string): string {
  return toggleHref(sp, key, value);
}

export const clearAllHref = '/';
