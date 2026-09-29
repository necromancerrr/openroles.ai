// Canonical enums — §2.5 of the Ledger design system.
// These are the only shapes the UI ever sees. Everything the source hands us
// is normalized into this vocabulary at ingest time (see taxonomy.ts).

// `engineering` is an addition to the §2.5 enum: mechanical, aerospace,
// manufacturing, civil and the rest of the non-software disciplines. Simplify
// never carried them, so the doc never needed a name for them; WonOfAKind
// carries ~1,000, and filing them under `other` would bury them next to
// technical writing.
export type Category =
  | 'software'
  | 'ai_data'
  | 'hardware'
  | 'engineering'
  | 'product'
  | 'quant'
  | 'other';

export type JobType = 'internship' | 'new_grad' | 'unknown';

// Where the `type` value came from. 'source' = repo-of-origin (trustworthy).
// 'inferred' = the internship title classifier fired (§1 finding 5).
export type TypeConf = 'source' | 'inferred';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

// Generative, not a fixed list. A hardcoded vocabulary goes stale the moment the
// calendar moves: the 2026-only version silently collapsed Fall 2027, Winter
// 2027, Spring 2027/28 and Summer 2028 — 135 term-mentions — into
// `unspecified`, so postings for those terms couldn't be filtered for at all.
// The year in a term is the calendar year it STARTS in (winter 2026 begins
// December 2026), which is what makes them orderable — see lib/taxonomy.ts.
export type Term = `${Season}_${number}` | 'unspecified';

// What a source says about visa sponsorship. §2.3 dropped Simplify's field
// because it's "Other" on 99% of rows and so carries no information; the new
// feeds carry real values on ~470 rows. Absent means the source didn't say —
// which is still most rows — and must never be read as a "no".
//   offers   — the employer sponsors visas
//   none     — the employer won't sponsor
//   citizens — US citizenship required (usually a clearance)
export type Sponsorship = 'offers' | 'none' | 'citizens';

// The raw record as it appears in either SimplifyJobs listings.json.
// `terms` exists only on the internship repo (§1 finding 2).
export interface RawListing {
  source: string;
  category?: string;
  company_name: string;
  id: string;
  title: string;
  active: boolean;
  terms?: string[];
  // vanshb03's feed carries a bare season ("Summer", "Fall") with no year.
  // Declared so it's clear we see it and deliberately don't map it — see the
  // note on that source in sources.ts.
  season?: string;
  date_updated: number;
  date_posted: number;
  url: string;
  locations?: string[];
  company_url?: string;
  is_visible: boolean;
  sponsorship?: string;
  degrees?: string[];
}

// The facts about one posting, as sources state them once normalized. This is
// what the build snapshot stores; everything on `Job` beyond it is derived.
export interface JobCore {
  id: string;
  company: string;
  companyUrl?: string;
  title: string;
  url: string;
  category: Category;
  type: JobType;
  typeConf: TypeConf;
  terms: Term[];
  locations: string[];
  // Unix seconds. `firstSeenAt` drives the decay rail (§4.1). In a persisted
  // system this is "our first fetch"; here we approximate with the source's
  // posting time.
  datePosted: number;
  firstSeenAt: number;
  active: boolean;
  sponsorship?: Sponsorship;
  // Display-ready pay, e.g. "$25–33/hr" — see lib/pay.ts.
  pay?: string;
  // The feed that listed this posting first, and so owns its fields. Later
  // feeds that list it again can only fill gaps (sponsorship, pay).
  source: string;
}

// The normalized record the whole app is built on.
export interface Job extends JobCore {
  canonicalKey: string;
  // Slugs for `locations`, index-aligned. Precomputed at ingest: the location
  // facet is scanned five times per request (once to filter, four times to
  // count) and slugging 1.4k × N locations per pass is pure waste.
  locSlugs: string[];
  isRemote: boolean;
  // Company mark (§5.1). Resolved once at ingest — see lib/logo.ts.
  initials: string;
  logoUrl?: string;
  // Lowercased `company + title`, the haystack for the search box. Built once at
  // ingest so a keystroke doesn't re-lowercase 4k strings five times over.
  search: string;
  // ATS host bucket, for the StatusPage breakdown.
  host: string;
}
