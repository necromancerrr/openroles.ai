// Company mark — the identity chip that sits to the left of the company name
// on every card (§5.1). Two layers, resolved once at ingest and never per
// render:
//
//   1. A monogram derived from the company name. Neutral ink on paper, because
//      §4.2 is absolute: age is the only thing that gets color. It always
//      renders, needs no network, and costs nothing.
//   2. Optionally a real logo on top of it, if the deployment configures a
//      logo host (LOGO_URL_TEMPLATE). It paints as a CSS background layer, so a
//      logo that 404s draws nothing and the monogram underneath stays visible —
//      the fallback is structural, with no client JS in the loop.

// Explicit .ts specifier: scripts/ load this module directly under
// `node --experimental-strip-types`, which does no extension resolution.
import { LOGO_DOMAIN_OVERRIDES, normalizeCompany } from './logo-overrides.ts';
import { LOCAL_LOGOS } from './logo-manifest.ts';

// Legal suffixes carry no identity; drop them before taking initials.
const NOISE = new Set([
  'inc', 'inc.', 'llc', 'l.l.c.', 'ltd', 'ltd.', 'corp', 'corp.',
  'corporation', 'co', 'co.', 'company', 'the', 'group', 'holdings',
  'plc', 'gmbh', 'sa', 'ag', 'lp', 'llp',
  // Connectives: "Bank of America" is BA, not BO.
  'of', 'and', 'for', 'de', 'du', 'la',
]);

// One to three characters, following whatever break the name itself offers:
// acronyms stay whole (IMC, AMD), multi-word names take one letter per word
// (Jane Street → JS), internal capitals count as a word break (TikTok → TT,
// SpaceX → SX), and anything else is a single letter (Google → G).
export function markInitials(company: string): string {
  const words = company
    .replace(/[(),.'"|/\\&-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()));

  if (words.length === 0) return company.trim().slice(0, 1).toUpperCase() || '·';

  const first = words[0];
  // A single initial ("D." in "D. E. Shaw") is not an acronym — it's a word.
  const isAcronym =
    first.length >= 2 && first.length <= 4 && first === first.toUpperCase();

  if (words.length > 1 && !isAcronym) return (first[0] + words[1][0]).toUpperCase();
  if (words.length > 1) return first.slice(0, 3);
  if (first === first.toUpperCase()) return first.slice(0, 3);

  const parts = first.split(/(?=[A-Z0-9])/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return first[0].toUpperCase();
}

// ATS families that put the employer's own slug in the URL path. Matched by
// suffix, not exact host, because every one of them has regional variants
// (eu.lever.co, job-boards.eu.greenhouse.io) that carry the same slug.
const ATS_PATH_SUFFIXES = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'smartrecruiters.com',
  'workable.com',
  'rippling.com',
];

// Path segments that sit in front of the slug rather than being it: locale codes
// (en-GB, fr) and the ATS's own routing words. `ats.rippling.com/en-GB/rippling/…`
// and `jobs.lever.co/embed/…` both put the real slug one or two segments in.
const NOT_A_SLUG = /^(en|fr|de|es|it|nl|pt|ja|ko|zh|[a-z]{2}-[a-zA-Z]{2}|jobs?|embed|careers?|search|o|c)$/i;

function slugFromPath(segments: string[]): string | undefined {
  for (const seg of segments) {
    if (!NOT_A_SLUG.test(seg)) return seg;
  }
  return undefined;
}

// Subdomains that mean "careers site", not "different company".
const CAREERS_PREFIX = /^(jobs|job|careers|career|apply|boards|talent|recruiting|work|www)\./;

// Hosts that identify the software, not the employer. If the employer slug
// can't be pulled out of one of these, there's no logo to ask for.
const GENERIC_HOSTS = [
  'oraclecloud.com', 'myworkdaysite.com', 'taleo.net', 'icims.com',
  'avature.net', 'phenompeople.com', 'eightfold.ai', 'dayforcehcm.com',
  'paylocity.com', 'jobvite.com', 'breezy.hr', 'recruitee.com',
  'teamtailor.com', 'bamboohr.com', 'applytojob.com', 'trakstar.com',
  'simplify.jobs', 'linkedin.com', 'indeed.com', 'ripplingats.com',
  'hirevue.com',
];

function slugToDomain(slug: string): string | undefined {
  const clean = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean.length >= 2 ? `${clean}.com` : undefined;
}

// Best-effort employer domain. A curated override wins when there is one —
// derivation can't reach .edu/.gov, and can't know that lifeattiktok.com is
// TikTok's careers brand rather than TikTok's domain (see logo-overrides.ts).
// Otherwise it's read off the apply URL: company-owned hosts (www.tesla.com,
// jobs.apple.com) are exact, ATS slugs are a guess, and a wrong guess just means
// the monogram stays. Never blocks or throws.
// Where a domain came from, which decides how much it can be trusted. `host` is
// read straight off the apply URL and is as good as fact; `slug` is an ATS path
// segment with `.com` bolted on, which is a guess — and a guess that's wrong for
// every company on .ai, .io, .gov or .edu. Only guesses are worth re-trying under
// another TLD; swapping the TLD on a known-good host would fetch a stranger's
// logo (tesla.ai is not Tesla).
export type DomainSource = 'override' | 'host' | 'slug';

export function resolveLogoDomain(
  applyUrl: string,
  company?: string,
): { domain: string; source: DomainSource } | undefined {
  if (company) {
    const override = LOGO_DOMAIN_OVERRIDES[normalizeCompany(company)];
    if (override) return { domain: override, source: 'override' };
  }

  let u: URL;
  try {
    u = new URL(applyUrl);
  } catch {
    return undefined;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  const guess = (slug: string | undefined) => {
    const domain = slugToDomain(slug ?? '');
    return domain ? { domain, source: 'slug' as const } : undefined;
  };

  if (ATS_PATH_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    return guess(slugFromPath(seg));
  }

  // tenant.wd1.myworkdayjobs.com/en-US/… → tenant
  const wd = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/.exec(host);
  if (wd) return guess(wd[1]);

  // careers-acme.icims.com → acme
  const icims = /^(?:careers-)?([a-z0-9-]+)\.icims\.com$/.exec(host);
  if (icims) return guess(icims[1]);

  if (GENERIC_HOSTS.some((g) => host === g || host.endsWith(`.${g}`))) return undefined;

  // Strip repeatedly: careers hosts stack (jobs.careers.microsoft.com), and one
  // pass leaves a subdomain that no logo host has ever heard of.
  let own = host;
  for (let i = 0; i < 4 && CAREERS_PREFIX.test(own); i++) {
    own = own.replace(CAREERS_PREFIX, '');
  }
  return own.includes('.') ? { domain: own, source: 'host' } : undefined;
}

export function logoDomain(applyUrl: string, company?: string): string | undefined {
  return resolveLogoDomain(applyUrl, company)?.domain;
}

// A logo host is opt-in: set LOGO_URL_TEMPLATE with a {domain} placeholder, and
// optionally {size} if the host takes one —
//   https://logo.example.com/{domain}?size={size}
// Unset (the default) means monograms only: no third-party requests, nothing to
// block, nothing to lay out twice.
const TEMPLATE = process.env.LOGO_URL_TEMPLATE;

// The mark is a 28px box, so ask for 64px art: enough for a 2x screen, and
// small enough that a card's logo is a couple of KB rather than a full-size PNG.
const LOGO_PX = 64;

export function logoSrc(domain: string | undefined): string | undefined {
  if (!domain) return undefined;

  // A logo we already hold wins over any provider: it's same-origin, so there's
  // no third-party request when the card paints, nothing to rate-limit, and
  // nothing that can quietly start serving a globe instead. `npm run fetch:logos`
  // populates public/logos/ and regenerates the manifest.
  const local = LOCAL_LOGOS[domain];
  if (local) return `/logos/${local}`;

  if (!TEMPLATE) return undefined;
  // The result is interpolated into a CSS url("…"), so nothing that could close
  // that string survives. The domain half is percent-encoded anyway.
  return TEMPLATE.replace('{domain}', encodeURIComponent(domain))
    .replace('{size}', String(LOGO_PX))
    .replace(/["'()\\\s]/g, '');
}
