// Filter state + facet counting — §5.2 / §5.4. Filters live in URL search
// params so the page stays a Server Component and links are shareable. Every
// chip shows a result count computed from the CURRENT filter state, and a chip
// leading to zero results is disabled before it can be clicked.

import type { Category, Job, JobType, Term } from './types';
import { locSlug } from './taxonomy';

export interface Filters {
  type: JobType; // segmented control — always exactly one
  terms: Set<Term>;
  categories: Set<Category>;
  locations: Set<string>; // location slugs
}

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

  return {
    type,
    terms: new Set(list(sp.term) as Term[]),
    categories: new Set(list(sp.category) as Category[]),
    locations: new Set(list(sp.loc)),
  };
}

// Apply every filter EXCEPT the named facet — used for computing that facet's
// chip counts (so selecting one value in a facet doesn't zero out its siblings).
function matches(job: Job, f: Filters, except?: 'type' | 'term' | 'category' | 'location'): boolean {
  if (except !== 'type' && job.type !== f.type) return false;
  if (except !== 'term' && f.terms.size > 0 && !job.terms.some((t) => f.terms.has(t)))
    return false;
  if (except !== 'category' && f.categories.size > 0 && !f.categories.has(job.category))
    return false;
  if (
    except !== 'location' &&
    f.locations.size > 0 &&
    !job.locations.some((l) => f.locations.has(locSlug(l)))
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
