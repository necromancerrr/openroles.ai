// Naming-consistency audit of the feed — §2. The source ships the same concept
// under multiple names; we normalize on ingest and FAIL LOUDLY on anything
// unseen (§2.1) so a new category surfaces in logs instead of vanishing.

import type { Category, Term } from './types';

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

// §2.2 — the repo is not summer-only. `terms` is an array; map each entry.
const TERM_MAP: Record<string, Term> = {
  'summer 2026': 'summer_2026',
  'fall 2026': 'fall_2026',
  'spring 2026': 'spring_2026',
  'winter 2026': 'winter_2026',
  'winter 2025': 'winter_2026', // both winters collapse to the nearest season
  'summer 2027': 'summer_2027',
  'n/a': 'unspecified',
};

export const TERM_LABELS: Record<Term, string> = {
  summer_2026: 'Summer 2026',
  fall_2026: 'Fall 2026',
  spring_2026: 'Spring 2026',
  winter_2026: 'Winter 2026',
  summer_2027: 'Summer 2027',
  unspecified: 'Unspecified',
};

export const TERM_ORDER: Term[] = [
  'summer_2026',
  'fall_2026',
  'spring_2026',
  'winter_2026',
  'summer_2027',
  'unspecified',
];

export function normalizeTerms(raw: string[] | undefined): Term[] {
  if (!raw || raw.length === 0) return ['unspecified'];
  const out = new Set<Term>();
  for (const t of raw) {
    const mapped = TERM_MAP[t.trim().toLowerCase()];
    out.add(mapped ?? 'unspecified');
  }
  return [...out];
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
