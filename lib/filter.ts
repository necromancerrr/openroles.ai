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
  // A campus-friendly shortcut: roles in the Seattle tech corridor plus
  // anything explicitly remote. It is a product filter, not a claim of UW
  // affiliation.
  campus: boolean;
  // "I need visa sponsorship": hides postings that SAY they won't sponsor or
  // require citizenship. Postings that don't say — most of them — stay, because
  // silence isn't a no.
  visa: boolean;
  // Only postings newer than the reader's last visit. The URL says `new=1`;
  // the line itself comes from the reader's cookie (lib/visit.ts), so it's
  // undefined when there's no previous visit and the filter is then inert.
  newSince?: number;
}

// A query longer than this is a paste accident, not a search.
const MAX_QUERY = 80;

// Commutable from UW's Seattle campus: King and Snohomish county cities, plus
// Tacoma. Anchored to the state, because every one of these names is also a
// town somewhere else — Bellevue, NE sits next to an Air Force base, Kirkland,
// QC is a Montreal suburb, Everett, MA and Auburn, AL both host postings — and
// an unanchored match would put them on a Seattle student's shortlist.
const SEATTLE_AREA = new RegExp(
  '^(seattle|bellevue|redmond|kirkland|renton|bothell|issaquah|tacoma|everett|' +
    'mercer island|tukwila|kent|auburn|federal way|seatac|burien|lynnwood|' +
    'mukilteo|woodinville|sammamish|kenmore|shoreline|edmonds|mountlake terrace|' +
    'lake forest park|newcastle|snoqualmie|north bend|puyallup|lakewood|' +
    'des moines|maple valley|covington|mill creek|marysville),\\s*(wa|washington)\\b',
  'i',
);

// Remote work a US-based student can take. "Remote in UK" and "Remote in
// Canada" are remote for someone — not for a student who needs to be hired in
// the US — so they count toward the general Remote chip but not the campus view.
// A bare "Remote" names no country; these boards are US-centric, so it counts.
const US_REMOTE = /^remote(\s+in)?(\s+(usa?|united states))?$/i;

export function isCampusFit(job: Job): boolean {
  return job.locations.some((l) => SEATTLE_AREA.test(l) || US_REMOTE.test(l.trim()));
}

export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
  // Where the reader's "new" begins, from their visit cookie — see lib/visit.ts.
  since?: number,
): Filters {
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
    campus: first(sp.campus) === '1',
    visa: first(sp.visa) === '1',
    newSince: first(sp.new) === '1' ? since : undefined,
  };
}

// Known not to sponsor, or requires citizenship — out for a reader who needs a
// visa. Unknown stays in.
export function excludesVisa(job: Job): boolean {
  return job.sponsorship === 'none' || job.sponsorship === 'citizens';
}

type Facet = 'type' | 'term' | 'category' | 'location' | 'remote' | 'campus' | 'visa';

// Apply every filter EXCEPT the named facet — used for computing that facet's
// chip counts (so selecting one value in a facet doesn't zero out its siblings).
function matches(job: Job, f: Filters, except?: Facet): boolean {
  if (except !== 'type' && job.type !== f.type) return false;
  if (f.newSince !== undefined && job.firstSeenAt <= f.newSince) return false;
  // Text first: it's the cheapest way to reject a row and the most selective.
  for (const w of f.words) if (!job.search.includes(w)) return false;
  if (except !== 'visa' && f.visa && excludesVisa(job)) return false;
  if (except !== 'campus' && f.campus && !isCampusFit(job)) return false;
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

export function campusCount(jobs: Job[], f: Filters): number {
  let n = 0;
  for (const j of jobs) if (isCampusFit(j) && matches(j, f, 'campus')) n++;
  return n;
}

// Counts for the visa toggle, with the toggle itself excluded: how many results
// it would leave, and how many it would take away.
export function visaCounts(jobs: Job[], f: Filters): { kept: number; excluded: number } {
  let kept = 0;
  let excluded = 0;
  for (const j of jobs) {
    if (!matches(j, f, 'visa')) continue;
    if (excludesVisa(j)) excluded++;
    else kept++;
  }
  return { kept, excluded };
}

// Everything matching the current filters that's newer than `since`, counted
// with the new-only filter itself off — the number the welcome-back line and
// the "only these" toggle both show.
export function newSinceCount(jobs: Job[], f: Filters, since: number): number {
  const base = { ...f, newSince: undefined };
  let n = 0;
  // The feed is sorted newest first, so the scan can stop at the line.
  for (const j of jobs) {
    if (j.firstSeenAt <= since) break;
    if (matches(j, base)) n++;
  }
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
