// Sources — every feed the board reads, and an adapter for each one's format.
//
// §1 finding 4 made the aggregators primary. There are now two tiers of them:
//
//   primary    SimplifyJobs. Hand-curated, labeled, and trusted to dedup
//              itself, so its rows are only ever matched by URL.
//   secondary  Scraper-built feeds that list postings straight off employer
//              job boards. They reach roles Simplify never lists and often see
//              a posting first, but they overlap each other and Simplify, so
//              their rows are also matched on company + title + place.
//
// Each adapter turns its feed's own shape into a `Listing` — the normalized
// vocabulary of §2 — and reports the feed's own sign of life, `updatedAt`, so
// a feed that stops being maintained can be withheld instead of quietly
// serving closed postings (see STALE_AFTER in ingest.ts).
//
// Measured against Simplify on 2026-09-29 before any of this was added — the
// point of a secondary feed is what it adds, not what it repeats:
//
//   zshah101     1,061 rows   604 not in Simplify   102 posted in the last week
//                sponsorship stated on 338 rows, pay on 302
//   WonOfAKind   3,090 rows   2,338 not in Simplify 324 posted in the last week
//                454 new-grad; ~1,000 mechanical, aerospace, manufacturing

import type { Category, JobType, RawListing, Sponsorship, Term } from './types';
import {
  normalizeAnyCategory,
  normalizeCategory,
  normalizeTerms,
  parseTerm,
  termsFromTitle,
} from './taxonomy';
import { aliasLocation, normalizeLocation } from './location';
import { formatPay } from './pay';
import { parseCSV } from './csv';

export interface Listing {
  id: string;
  company: string;
  companyUrl?: string;
  title: string;
  url: string;
  type: JobType;
  category: Category;
  terms: Term[];
  locations: string[];
  postedAt: number; // unix seconds
  sponsorship?: Sponsorship;
  pay?: string;
}

export interface ParsedSource {
  rows: number; // everything in the file
  listings: Listing[]; // the rows the feed itself considers live
  updatedAt?: number; // the newest sign of life in the file, unix seconds
}

export interface SourceSpec {
  name: string; // shown on /status
  home: string; // where the feed lives, for attribution on /status
  url: string;
  primary: boolean;
  parse(body: string, now: number): ParsedSource;
}

const DAY = 86400;
const seconds = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
};
const newest = (xs: (number | undefined)[]): number | undefined => {
  let best: number | undefined;
  for (const x of xs) if (x !== undefined && (best === undefined || x > best)) best = x;
  return best;
};

// --- SimplifyJobs format (also vanshb03, which forked the schema) ----------

const SIMPLIFY_SPONSORSHIP: Record<string, Sponsorship> = {
  'offers sponsorship': 'offers',
  'does not offer sponsorship': 'none',
  'u.s. citizenship is required': 'citizens',
};

export function fromSimplifyRow(r: RawListing, type: JobType): Listing {
  return {
    id: r.id,
    company: r.company_name,
    companyUrl: r.company_url,
    title: r.title,
    url: r.url,
    type,
    category: normalizeCategory(r.category),
    terms: normalizeTerms(r.terms),
    locations:
      Array.isArray(r.locations) && r.locations.length > 0
        ? [...new Set(r.locations.map(aliasLocation))]
        : ['Unspecified'],
    postedAt: r.date_posted,
    sponsorship: SIMPLIFY_SPONSORSHIP[(r.sponsorship ?? '').toLowerCase()],
  };
}

function simplifyFormat(type: JobType) {
  return (body: string): ParsedSource => {
    const rows = JSON.parse(body) as RawListing[];
    // §1 finding 1: filter on active && is_visible at parse time.
    const live = rows.filter((r) => r.active && r.is_visible);
    return {
      rows: rows.length,
      updatedAt: newest(rows.map((r) => r.date_updated)),
      listings: live.map((r) => fromSimplifyRow(r, type)),
    };
  };
}

// --- zshah101: CSV, scraped from employer boards every 30 minutes -----------

const ZSHAH_SPONSORSHIP: Record<string, Sponsorship> = {
  offers: 'offers',
  'no-sponsorship': 'none',
  'citizens-only': 'citizens',
};

function zshah(body: string): ParsedSource {
  const rows = parseCSV(body);
  const listings: Listing[] = [];
  for (const r of rows) {
    if (!r.url || !r.title || !r.company) continue;
    const firstSeen = seconds(r.first_seen_at);
    const posted = seconds(r.posted_at);
    // A date-only posted_at is midnight UTC on the posting day. When the
    // scraper first saw the posting that same day, its timestamp is the better
    // clock — it's the "first seen" the decay rail is defined on (§4.1).
    let postedAt = posted ?? firstSeen;
    if (r.posted_at_source !== 'exact' && posted !== undefined && firstSeen !== undefined) {
      if (firstSeen >= posted && firstSeen - posted < DAY) postedAt = firstSeen;
    }
    if (postedAt === undefined) continue;

    const season = r.season && !/^not stated$/i.test(r.season) ? parseTerm(r.season) : null;
    const locations = normalizeLocation(r.location);
    if (r.remote === 'yes' && !locations.some((l) => /^remote/i.test(l))) {
      locations.push('Remote in USA'); // a US-only board
    }
    listings.push({
      id: r.id,
      company: r.company,
      title: r.title,
      url: r.url,
      type: 'internship', // Internship, Co-op, or both — all internships here
      category: normalizeAnyCategory(r.category),
      terms: season && season !== 'unspecified' ? [season] : termsFromTitle(r.title),
      locations: locations.length > 0 ? locations : ['Unspecified'],
      postedAt,
      sponsorship: ZSHAH_SPONSORSHIP[r.sponsorship?.toLowerCase() ?? ''],
      pay: formatPay(r.salary),
    });
  }
  return {
    rows: rows.length,
    listings,
    updatedAt: newest(rows.map((r) => seconds(r.first_seen_at))),
  };
}

// --- WonOfAKind: JSON, verified daily against employer requisitions ---------

interface WonRow {
  role_id: string;
  company: string;
  title: string;
  location?: string;
  role_type?: string;
  discipline?: string;
  compensation?: string;
  url: string;
  posted_at?: string;
  date_seen?: string;
  last_seen?: string;
  expires_at?: string;
}

// The feed keeps a role for weeks after its scanner last saw it live. A role
// the scanner hasn't seen within this window of its newest scan has almost
// certainly closed (on 2026-09-29, ~500 of 3,090 rows) — dropped, not shown.
const WON_SEEN_WINDOW = 7 * DAY;

function wonTypeOf(roleType: string | undefined): JobType | undefined {
  if (!roleType) return undefined;
  if (/intern|co-?op/i.test(roleType)) return 'internship';
  if (/new grad|graduate|early career|entry/i.test(roleType)) return 'new_grad';
  return undefined;
}

function wonofakind(body: string, now: number): ParsedSource {
  const rows = JSON.parse(body) as WonRow[];
  const lastScan = newest(rows.map((r) => seconds(r.last_seen)));
  const listings: Listing[] = [];
  for (const r of rows) {
    const type = wonTypeOf(r.role_type);
    if (!type || !r.url || !r.title) continue;
    const expires = seconds(r.expires_at);
    if (expires !== undefined && expires < now) continue;
    const seen = seconds(r.last_seen);
    if (lastScan !== undefined && seen !== undefined && lastScan - seen > WON_SEEN_WINDOW) continue;
    const postedAt = seconds(r.posted_at) ?? seconds(r.date_seen);
    if (postedAt === undefined) continue;
    const locations = normalizeLocation(r.location);
    listings.push({
      id: r.role_id,
      company: r.company,
      title: r.title,
      url: r.url,
      type,
      category: normalizeAnyCategory(r.discipline),
      terms: type === 'internship' ? termsFromTitle(r.title) : ['unspecified'],
      locations: locations.length > 0 ? locations : ['Unspecified'],
      postedAt,
      pay: formatPay(r.compensation),
    });
  }
  return { rows: rows.length, listings, updatedAt: lastScan };
}

// Declared order is dedup priority: the first source to list a posting owns
// it. Simplify first (curated labels), then zshah101 (exact timestamps,
// sponsorship), then WonOfAKind.
export const SOURCES: SourceSpec[] = [
  {
    name: 'SimplifyJobs/Summer2027-Internships',
    home: 'https://github.com/SimplifyJobs/Summer2027-Internships',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
    primary: true,
    parse: simplifyFormat('internship'),
  },
  {
    name: 'SimplifyJobs/New-Grad-Positions',
    home: 'https://github.com/SimplifyJobs/New-Grad-Positions',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json',
    primary: true,
    parse: simplifyFormat('new_grad'),
  },
  {
    name: 'zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships',
    home: 'https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships',
    url: 'https://raw.githubusercontent.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships/main/data/internships.csv',
    primary: false,
    parse: zshah,
  },
  {
    name: 'WonOfAKind/New-Grad-And-Internships-2027',
    home: 'https://github.com/WonOfAKind/New-Grad-And-Internships-2027',
    url: 'https://raw.githubusercontent.com/WonOfAKind/New-Grad-And-Internships-2027/main/data/roles.json',
    primary: false,
    parse: wonofakind,
  },
  // Simplify's schema, but rows carry no `category` (they normalize to `other`)
  // and a bare `season` — "Summer", no year — which isn't inferable, so they
  // read `unspecified`. It stopped updating on 2026-08-23; the staleness rule
  // in ingest.ts withholds it until it moves again.
  {
    name: 'vanshb03/Summer2027-Internships',
    home: 'https://github.com/vanshb03/Summer2027-Internships',
    url: 'https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json',
    primary: false,
    parse: simplifyFormat('internship'),
  },
];
