// Company mark — the identity chip that sits to the left of the company name
// on every card (§5.1). Two layers, resolved once at ingest and never per
// render:
//
//   1. A monogram derived from the company name. Neutral ink on paper, because
//      §4.2 is absolute: age is the only thing that gets color. It always
//      renders, needs no network, and costs nothing.
//   2. Optionally a real logo on top of it, if the deployment configures a
//      logo host (LOGO_URL_TEMPLATE). A logo that 404s paints nothing over an
//      `alt=""` image, so the monogram underneath stays visible — the fallback
//      is structural, no client JS involved.

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

// ATS hosts whose first path segment is the employer's own slug.
const SLUG_IN_PATH = new Set([
  'job-boards.greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
  'jobs.lever.co',
  'jobs.ashbyhq.com',
  'jobs.smartrecruiters.com',
  'ats.rippling.com',
  'apply.workable.com',
]);

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
];

function slugToDomain(slug: string): string | undefined {
  const clean = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean.length >= 2 ? `${clean}.com` : undefined;
}

// Best-effort employer domain, derived from the apply URL. Company-owned hosts
// (www.tesla.com, jobs.apple.com) are exact; ATS slugs are a guess, and a wrong
// guess just means the monogram stays. Never blocks or throws.
export function logoDomain(applyUrl: string): string | undefined {
  let u: URL;
  try {
    u = new URL(applyUrl);
  } catch {
    return undefined;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);

  if (SLUG_IN_PATH.has(host)) return slugToDomain(seg[0] ?? '');

  // tenant.wd1.myworkdayjobs.com/en-US/… → tenant
  const wd = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/.exec(host);
  if (wd) return slugToDomain(wd[1]);

  // careers-acme.icims.com → acme
  const icims = /^(?:careers-)?([a-z0-9-]+)\.icims\.com$/.exec(host);
  if (icims) return slugToDomain(icims[1]);

  if (GENERIC_HOSTS.some((g) => host === g || host.endsWith(`.${g}`))) return undefined;

  const own = host.replace(CAREERS_PREFIX, '');
  return own.includes('.') ? own : undefined;
}

// A logo host is opt-in: set LOGO_URL_TEMPLATE with a {domain} placeholder,
// e.g. https://logo.example.com/{domain}. Unset (the default) means monograms
// only — no third-party requests, nothing to block, nothing to lay out twice.
const TEMPLATE = process.env.LOGO_URL_TEMPLATE;

export function logoSrc(domain: string | undefined): string | undefined {
  if (!TEMPLATE || !domain) return undefined;
  // The result is interpolated into a CSS url("…"), so nothing that could close
  // that string survives. The domain half is percent-encoded anyway.
  return TEMPLATE.replace('{domain}', encodeURIComponent(domain)).replace(
    /["'()\\\s]/g,
    '',
  );
}
