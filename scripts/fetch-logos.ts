// Fetch company logos once, offline, and serve them from our own origin — the
// §7 pattern applied to images: do the work ahead of time, check the artifact
// in, don't depend on a third party at render time.
//
// Run:  npm run fetch:logos                    # each company's own favicon
//       npm run fetch:logos -- --top=600
//       npm run fetch:logos -- --from='https://icons.duckduckgo.com/ip3/{domain}.ico'
//
// The default source is the company's own site, which is the answer to "can we
// have logos without a provider": every domain we resolved already serves a
// favicon, and asking it directly involves no logo host at all. --from lets you
// pull from anywhere instead — including a provider, once — because the point is
// that whatever the source, the result ends up as a file we serve ourselves.
//
// Writes: public/logos/<domain>.<ext> and lib/logo-manifest.ts.

import { writeFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { resolveLogoDomain, type DomainSource } from '../lib/logo.ts';
import { canonicalKey } from '../lib/canonical.ts';
import type { RawListing } from '../lib/types.ts';

const FEEDS = [
  '.eval-cache/internships.json',
  '.eval-cache/new-grad.json',
  '.eval-cache/vanshb03.json',
];
const FEED_URLS = [
  'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json',
  'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json',
  'https://raw.githubusercontent.com/vanshb03/Summer2026-Internships/dev/.github/scripts/listings.json',
];

const OUT_DIR = 'public/logos';
const MANIFEST = 'lib/logo-manifest.ts';
const DEFAULT_SOURCE = 'https://{domain}/favicon.ico';

// TLDs to retry when a domain was *guessed* from an ATS slug. The guess always
// appends .com, which is wrong for most of the AI cohort (mistral.ai,
// together.ai), for national labs (.gov) and for universities (.edu). Only
// guesses get this treatment — see DomainSource in lib/logo.ts.
const ALT_TLDS = ['ai', 'io', 'co', 'gov', 'edu'];

// Plenty of sites serve no /favicon.ico at all and declare their icon in the
// page instead. Reading that link is the difference between "some cards" and
// "most cards" — Jump Trading is a live example.
const ICON_LINK_RE =
  /<link[^>]+rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/gi;
const HREF_RE = /href=["']([^"']+)["']/i;

// Anything smaller than this is a tracking pixel or an error page, not a logo.
const MIN_BYTES = 100;
// A body returned for this many different domains is the source's placeholder.
const PLACEHOLDER_MIN = 3;
const CONCURRENCY = 16;
const TIMEOUT_MS = 5000;
// A whole-run deadline. This is a prebuild step on somebody's deploy: unreachable
// hosts each cost a timeout, and 1,273 domains of those add up to far more than a
// build is willing to wait. Whatever has been collected when the budget runs out
// is what gets written.
const DEFAULT_BUDGET_S = 180;

const EXT_BY_TYPE: Record<string, string> = {
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function loadFeed(cache: string, url: string): Promise<RawListing[]> {
  try {
    return JSON.parse(await readFile(cache, 'utf8')) as RawListing[];
  } catch {
    /* not cached */
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const rows = (await res.json()) as RawListing[];
  await mkdir('.eval-cache', { recursive: true });
  await writeFile(cache, JSON.stringify(rows));
  return rows;
}

function hashBytes(buf: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${buf.length}-${h.toString(16)}`;
}

interface Fetched {
  domain: string;
  postings: number;
  bytes: Uint8Array;
  ext: string;
  hash: string;
  via: string; // the domain the bytes actually came from, for the report
}

interface Image {
  bytes: Uint8Array;
  ext: string;
}

// One image fetch: must be an image, must have real weight. Anything else is an
// error page wearing a 200.
export async function getImage(url: string): Promise<Image | undefined> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  if (!res.ok) return undefined;
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[type];
  if (!ext) return undefined;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length >= MIN_BYTES ? { bytes, ext } : undefined;
}

// Ask the homepage what its icon is. Sites increasingly ship /favicon.svg, a
// hashed asset path, or an Apple touch icon and nothing at the classic location.
export async function getImageViaPage(origin: string): Promise<Image | undefined> {
  const res = await fetch(origin, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: { accept: 'text/html' },
  });
  if (!res.ok) return undefined;
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return undefined;
  // Only the <head> can carry the link, so a slice is enough and keeps a
  // multi-megabyte page from being pulled into memory a thousand times over.
  const html = (await res.text()).slice(0, 200_000);
  for (const tag of html.match(ICON_LINK_RE) ?? []) {
    const href = HREF_RE.exec(tag)?.[1];
    if (!href) continue;
    try {
      const img = await getImage(new URL(href, res.url).toString());
      if (img) return img;
    } catch {
      /* try the next link */
    }
  }
  return undefined;
}

async function main() {
  // Every domain by default: capping at an arbitrary N silently leaves the long
  // tail of the board with no logo at all, which is most of the companies.
  const top = Number(arg('top') ?? Number.MAX_SAFE_INTEGER);
  const source = arg('from') ?? DEFAULT_SOURCE;
  const useAlts = !process.argv.includes('--no-alt');
  const usePage = !process.argv.includes('--no-page');
  const budgetMs = Number(arg('budget') ?? DEFAULT_BUDGET_S) * 1000;
  const deadline = Date.now() + budgetMs;

  // Rank domains by how many postings ride on each, so a bounded fetch covers
  // the most cards rather than an arbitrary slice of the alphabet.
  const byDomain = new Map<string, number>();
  const sourceOf = new Map<string, DomainSource>();
  const seen = new Set<string>();
  let totalPostings = 0;
  let feeds: RawListing[][];
  try {
    feeds = await Promise.all(FEEDS.map((c, i) => loadFeed(c, FEED_URLS[i])));
  } catch (err) {
    // This runs as `prebuild`, so it must never take a deploy down. No feed
    // means no ranking, which means nothing to fetch — leave whatever logos are
    // already there and let the build continue.
    console.warn(
      `\n  couldn't read the feeds (${err instanceof Error ? err.message : err})` +
        `\n  keeping the existing manifest, continuing.\n`,
    );
    return;
  }
  for (let i = 0; i < feeds.length; i++) {
    for (const r of feeds[i]) {
      if (!(r.active && r.is_visible)) continue;
      const key = canonicalKey(r.url);
      if (seen.has(key)) continue;
      seen.add(key);
      totalPostings++;
      const resolved = resolveLogoDomain(r.url, r.company_name);
      if (resolved) {
        byDomain.set(resolved.domain, (byDomain.get(resolved.domain) ?? 0) + 1);
        sourceOf.set(resolved.domain, resolved.source);
      }
    }
  }

  const ranked = [...byDomain.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  console.log(
    `\n  ${byDomain.size} distinct domains across ${totalPostings} postings` +
      `\n  fetching ${ranked.length} from ${source}` +
      `${useAlts ? ', retrying guessed domains under other TLDs' : ''}` +
      `${usePage ? ", following <link rel=icon> when there's no favicon.ico" : ''}\n`,
  );

  const got: Fetched[] = [];
  let failed = 0;
  let viaAltTld = 0;
  let viaPage = 0;

  // Candidates for one company, most-likely first. A guessed domain gets its
  // TLD swapped; anything read off the apply URL or pinned by an override is
  // taken as given.
  function candidates(domain: string): string[] {
    if (!useAlts || sourceOf.get(domain) !== 'slug') return [domain];
    const base = domain.replace(/\.[a-z]+$/, '');
    return [domain, ...ALT_TLDS.map((tld) => `${base}.${tld}`)];
  }

  let ranOut = false;
  for (let i = 0; i < ranked.length; i += CONCURRENCY) {
    if (Date.now() > deadline) {
      ranOut = true;
      break;
    }
    await Promise.all(
      ranked.slice(i, i + CONCURRENCY).map(async ([domain, postings]) => {
        for (const cand of candidates(domain)) {
          const url = source.replace('{domain}', encodeURIComponent(cand)).replace('{size}', '64');
          let img: Image | undefined;
          try {
            img = await getImage(url);
          } catch {
            /* fall through to the page lookup */
          }
          // Nothing at the conventional path — ask the site itself. Only for the
          // domain we actually believe in; doing it for every TLD guess multiplies
          // requests against hosts that mostly don't exist.
          if (!img && usePage && cand === domain && source === DEFAULT_SOURCE) {
            try {
              img = await getImageViaPage(`https://${cand}/`);
              if (img) viaPage++;
            } catch {
              /* candidate exhausted */
            }
          }
          if (img) {
            if (cand !== domain) viaAltTld++;
            // Stored under the domain the app will ask for at render time, not
            // the one the bytes came from — the manifest is a lookup table.
            got.push({
              domain,
              postings,
              bytes: img.bytes,
              ext: img.ext,
              hash: hashBytes(img.bytes),
              via: cand,
            });
            return;
          }
        }
        failed++;
      }),
    );
    process.stdout.write(`\r  fetched ${got.length}, failed ${failed}…   `);
  }
  process.stdout.write('\n');
  if (ranOut) {
    console.log(
      `  budget of ${budgetMs / 1000}s reached — keeping the ${got.length} fetched so far` +
        ` (raise it with --budget=SECONDS)`,
    );
  }

  // Drop the source's own placeholder art: a body repeated across several
  // unrelated domains is a fallback image, and a fallback that looks like a
  // broken logo is worse on a card than the monogram it would cover.
  const counts = new Map<string, number>();
  for (const f of got) counts.set(f.hash, (counts.get(f.hash) ?? 0) + 1);
  const kept = got.filter((f) => (counts.get(f.hash) ?? 0) < PLACEHOLDER_MIN);
  const dropped = got.length - kept.length;

  // Nothing usable came back — a blocked network, an outage, a bad --from. Do
  // not wipe logos that are already on disk over a transient failure: leaving
  // yesterday's art beats shipping a board that silently lost all of it.
  if (kept.length === 0) {
    console.warn(
      `\n  fetched nothing usable (${failed} failures` +
        (dropped > 0 ? `, ${dropped} placeholders` : '') +
        `) — leaving the existing manifest untouched.\n`,
    );
    return;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const manifest: Record<string, string> = {};
  for (const f of kept.sort((a, b) => a.domain.localeCompare(b.domain))) {
    const file = `${f.domain}.${f.ext}`;
    await writeFile(`${OUT_DIR}/${file}`, f.bytes);
    manifest[f.domain] = file;
  }

  const header = `// GENERATED by \`npm run fetch:logos\` — do not edit by hand.
//
// Domains whose logo is stored in public/logos/ and therefore served from this
// app's own origin. A local file beats any provider: no third-party request at
// render time, nothing to rate-limit, nothing that can start returning a globe
// or disappear, and the file is cached by whatever already serves the site.
//
// Empty is a valid state — every domain then falls back to the configured
// provider if there is one, and to the monogram if there isn't.

export const LOCAL_LOGOS: Record<string, string> = ${JSON.stringify(manifest, null, 2)};
`;
  await writeFile(MANIFEST, header);

  const coveredPostings = kept.reduce((n, f) => n + f.postings, 0);
  const bytes = kept.reduce((n, f) => n + f.bytes.length, 0);
  console.log(
    `\n  kept ${kept.length} logos (${(bytes / 1024).toFixed(0)} KB on disk)` +
      (dropped > 0 ? `, dropped ${dropped} placeholder image(s)` : '') +
      (viaAltTld > 0 ? `\n  ${viaAltTld} found under a non-.com TLD` : '') +
      (viaPage > 0 ? `\n  ${viaPage} found via the page's <link rel=icon>` : '') +
      `\n  ${((100 * coveredPostings) / totalPostings).toFixed(1)}% of postings now` +
      ` show a real logo, served from this origin; the rest keep their monogram\n`,
  );

  const files = await readdir(OUT_DIR);
  if (files.length !== kept.length) {
    console.error(`  mismatch: ${files.length} files vs ${kept.length} manifest entries`);
    process.exit(1);
  }
}

// Only run when invoked directly — importing this module (a test, another
// script) should get the helpers without kicking off a thousand fetches.
if (process.argv[1]?.endsWith('fetch-logos.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
