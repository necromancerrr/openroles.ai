// Canonical enums — §2.5 of the Ledger design system.
// These are the only shapes the UI ever sees. Everything the source hands us
// is normalized into this vocabulary at ingest time (see taxonomy.ts).

export type Category =
  | 'software'
  | 'ai_data'
  | 'hardware'
  | 'product'
  | 'quant'
  | 'other';

export type JobType = 'internship' | 'new_grad' | 'unknown';

// Where the `type` value came from. 'source' = repo-of-origin (trustworthy).
// 'inferred' = the internship title classifier fired (§1 finding 5).
export type TypeConf = 'source' | 'inferred';

export type Term =
  | 'summer_2026'
  | 'fall_2026'
  | 'spring_2026'
  | 'winter_2026'
  | 'summer_2027'
  | 'unspecified';

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
  date_updated: number;
  date_posted: number;
  url: string;
  locations?: string[];
  company_url?: string;
  is_visible: boolean;
  sponsorship?: string;
  degrees?: string[];
}

// The normalized record the whole app is built on.
export interface Job {
  id: string;
  company: string;
  companyUrl?: string;
  title: string;
  url: string;
  canonicalKey: string;
  category: Category;
  type: JobType;
  typeConf: TypeConf;
  terms: Term[];
  locations: string[];
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
  // Unix seconds. `firstSeenAt` drives the decay rail (§4.1). In a persisted
  // system this is "our first fetch"; here we approximate with date_posted.
  datePosted: number;
  firstSeenAt: number;
  active: boolean;
  // ATS host bucket, for the StatusPage breakdown.
  host: string;
}
