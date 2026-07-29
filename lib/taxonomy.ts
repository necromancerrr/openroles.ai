// Naming-consistency audit of the feed — §2. The source ships the same concept
// under multiple names; we normalize on ingest and FAIL LOUDLY on anything
// unseen (§2.1) so a new category surfaces in logs instead of vanishing.

import type { Category, Season, Term } from './types';

// §2.1 — five duplicate pairs. Long forms are un-migrated legacy rows.
const CATEGORY_MAP: Record<string, Category> = {
  software: 'software',
  'software engineering': 'software',
  'ai/ml/data': 'ai_data',
  'data science, ai & machine learning': 'ai_data',
  hardware: 'hardware',
  'hardware engineering': 'hardware',
  product: 'product',
  'product management': 'product',
  quant: 'quant',
  'quantitative finance': 'quant',
  other: 'other',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  software: 'Software',
  ai_data: 'AI / ML / Data',
  hardware: 'Hardware',
  product: 'Product',
  quant: 'Quant',
  other: 'Other',
};

export const CATEGORY_ORDER: Category[] = [
  'software',
  'ai_data',
  'hardware',
  'product',
  'quant',
  'other',
];

// Collects categories the map has never seen. Ingest logs these loudly
// (§2.1) rather than silently defaulting to `other`.
export const unseenCategories = new Set<string>();

export function normalizeCategory(raw: string | undefined): Category {
  if (!raw) return 'other';
  const key = raw.trim().toLowerCase();
  const mapped = CATEGORY_MAP[key];
  if (!mapped) {
    // Fail loudly, but don't crash the whole ingest over one row.
    unseenCategories.add(raw);
    return 'other';
  }
  return mapped;
}

// §2.2 — the repo is not summer-only, and it isn't 2026-only either. `terms` is
// an array of "{Season} {Year}" strings, parsed rather than looked up in a table
// so the vocabulary never needs an annual edit.

const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];

// The month a term begins, by convention: the year in the label is the calendar
// year the term STARTS in, so winter 2026 runs from December 2026. That single
// rule is what makes terms orderable and what decides whether one is still open
// to apply to.
const SEASON_START_MONTH: Record<Season, number> = {
  spring: 0, // January
  summer: 4, // May
  fall: 8, // September
  winter: 11, // December
};

// Term strings the parser didn't recognize. Ingest logs these loudly (§2.1) —
// the previous table-lookup version dropped anything it hadn't been told about
// into `unspecified` in silence, which is how 13 real terms went missing.
export const unseenTerms = new Set<string>();

const TERM_RE = /^(spring|summer|fall|winter)\s+(\d{4})$/i;

export function parseTerm(raw: string): Term | null {
  const t = raw.trim().toLowerCase();
  if (t === 'n/a' || t === '' || t === 'unspecified') return 'unspecified';
  const m = TERM_RE.exec(t);
  if (!m) return null;
  return `${m[1] as Season}_${Number(m[2])}`;
}

function split(term: Term): { season: Season; year: number } | null {
  if (term === 'unspecified') return null;
  const i = term.lastIndexOf('_');
  const season = term.slice(0, i) as Season;
  const year = Number(term.slice(i + 1));
  if (!SEASONS.includes(season) || !Number.isFinite(year)) return null;
  return { season, year };
}

export function termLabel(term: Term): string {
  const p = split(term);
  if (!p) return 'Unspecified';
  return `${p.season[0].toUpperCase()}${p.season.slice(1)} ${p.year}`;
}

// Months since year 0 — a total order over terms. `unspecified` sorts last.
export function termSortKey(term: Term): number {
  const p = split(term);
  if (!p) return Number.MAX_SAFE_INTEGER;
  return p.year * 12 + SEASON_START_MONTH[p.season];
}

// You apply to a term before it starts, so "open" means the start month is still
// ahead. Everything else has either begun or finished.
export function isTermOpen(term: Term, now: Date): boolean {
  const p = split(term);
  if (!p) return false;
  return termSortKey(term) > now.getFullYear() * 12 + now.getMonth();
}

export function normalizeTerms(raw: string[] | undefined): Term[] {
  if (!raw || raw.length === 0) return ['unspecified'];
  const out = new Set<Term>();
  for (const t of raw) {
    const parsed = parseTerm(t);
    if (parsed === null) unseenTerms.add(t);
    out.add(parsed ?? 'unspecified');
  }
  return [...out];
}

// The chip row for the Term facet: every term still open to apply to, soonest
// first, then the term running right now, then Unspecified. Terms whose window
// has closed get no chip — a board about windows closing shouldn't lead with one
// that already has. They stay on the board and stay reachable by URL, and a
// selected one keeps its chip so a shared link never loses a control.
export function termChipOrder(
  present: Iterable<Term>,
  now: Date,
  selected: ReadonlySet<Term> = new Set(),
): Term[] {
  const terms = [...new Set(present)];
  const open = terms.filter((t) => isTermOpen(t, now));
  const running = terms.filter(
    (t) => !isTermOpen(t, now) && t !== 'unspecified' && selectedOrCurrent(t, now, selected),
  );
  const byStart = (a: Term, b: Term) => termSortKey(a) - termSortKey(b);
  const tail: Term[] = terms.includes('unspecified') ? ['unspecified'] : [];
  return [...open.sort(byStart), ...running.sort(byStart), ...tail];
}

// A closed term earns a chip only if it's the one currently running, or if the
// reader already has it selected.
function selectedOrCurrent(term: Term, now: Date, selected: ReadonlySet<Term>): boolean {
  if (selected.has(term)) return true;
  const p = split(term);
  if (!p) return false;
  // Currently running: started at or before this month, and the next term's
  // start is still ahead.
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  const start = termSortKey(term);
  return start <= nowKey && nowKey - start < 4;
}

// The one term a card shows (§5.1 keeps the eyebrow to a single value): the
// soonest one still open, so a posting tagged both Summer 2026 and Fall 2026
// reads as the term you can still apply to. Falls back to the latest term.
export function primaryTerm(terms: Term[], now: Date): Term | null {
  const dated = terms.filter((t) => t !== 'unspecified');
  if (dated.length === 0) return null;
  const open = dated.filter((t) => isTermOpen(t, now)).sort((a, b) => termSortKey(a) - termSortKey(b));
  if (open.length > 0) return open[0];
  return dated.sort((a, b) => termSortKey(b) - termSortKey(a))[0];
}

// §2.4 — Simplify already normalizes location into a compact vocabulary.
// We adopt their strings as canonical. `Remote in USA` is a location, not a
// boolean — derive is_remote from the string, don't replace it.
export function deriveRemote(locations: string[]): boolean {
  return locations.some((l) => /remote/i.test(l));
}

// Turn a location string into a URL-safe slug for filter params.
export function locSlug(location: string): string {
  return location
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
