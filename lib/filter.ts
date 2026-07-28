// Filter state + facet counting — §5.2 / §5.4. Filters live in URL search
// params so the page stays a Server Component and links are shareable. Every
// chip shows a result count computed from the CURRENT filter state, and a chip
// leading to zero results is disabled before it can be clicked.

import type { Category, Job, JobType, Term } from './types';

export interface Filters {
  type: JobType; // segmented control — always exactly one
  terms: Set<Term>;
  categories: Set<Category>;
  locations: Set<string>; // location slugs
  // Free text over company + title. Every word must appear (AND, not OR) — with
  // 1.4k rows on screen, narrowing is the whole point of typing.
  words: string[];
  query: string; // the raw string, for echoing back in the UI
  remote: boolean;
}

// A query longer than this is a paste accident, not a search.
const MAX_QUERY = 80;

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const list = (v: string | string[] | undefined): string[] => {
    if (v == null) return [];
    const raw = Array.isArray(v) ? v.join(',') : v;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  };

  const typeRaw = first(sp.type);
  const type: JobType =
    typeRaw === 'new_grad' || typeRaw === 'unknown' ? typeRaw : 'internship';

  const query = (first(sp.q) ?? '').slice(0, MAX_QUERY).trim();

  return {
    type,
    terms: new Set(list(sp.term) as Term[]),
    categories: new Set(list(sp.category) as Category[]),
    locations: new Set(list(sp.loc)),
    query,
    words: query.toLowerCase().split(/\s+/).filter(Boolean),
    remote: first(sp.remote) === '1',
  };
}

// Apply every filter EXCEPT the named facet — used for computing that facet's
// chip counts (so selecting one value in a facet doesn't zero out its siblings).
function matches(
  job: Job,
  f: Filters,
  except?: 'type' | 'term' | 'category' | 'location' | 'remote',
): boolean {
  if (except !== 'type' && job.type !== f.type) return false;
  // Text first: it's the cheapest way to reject a row and the most selective.
  for (const w of f.words) if (!job.search.includes(w)) return false;
  if (except !== 'remote' && f.remote && !job.isRemote) return false;
  if (except !== 'term' && f.terms.size > 0 && !job.terms.some((t) => f.terms.has(t)))
    return false;
  if (except !== 'category' && f.categories.size > 0 && !f.categories.has(job.category))
    return false;
  if (
    except !== 'location' &&
    f.locations.size > 0 &&
    !job.locSlugs.some((s) => f.locations.has(s))
  )
    return false;
  return true;
}

export function applyFilters(jobs: Job[], f: Filters): Job[] {
  return jobs.filter((j) => matches(j, f));
}

// Count helpers — each counts against everything else in the filter state.
export function typeCounts(jobs: Job[], f: Filters): Record<JobType, number> {
  const out: Record<JobType, number> = { internship: 0, new_grad: 0, unknown: 0 };
  for (const j of jobs) {
    if (matches(j, f, 'type')) out[j.type]++;
  }
  return out;
}

// The Remote chip's own count, computed with the remote filter itself excluded
// so the chip never reads zero while it's the thing being toggled (§5.2).
export function remoteCount(jobs: Job[], f: Filters): number {
  let n = 0;
  for (const j of jobs) if (j.isRemote && matches(j, f, 'remote')) n++;
  return n;
}

export function facetCounts<K extends string>(
  jobs: Job[],
  f: Filters,
  facet: 'term' | 'category' | 'location',
  keyOf: (j: Job) => K[],
): Map<K, number> {
  const out = new Map<K, number>();
  for (const j of jobs) {
    if (!matches(j, f, facet)) continue;
    for (const k of keyOf(j)) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}
