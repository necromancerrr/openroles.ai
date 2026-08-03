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
import { logoDomain } from '../lib/logo.ts';
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

// Anything smaller than this is a tracking pixel or an error page, not a logo.
const MIN_BYTES = 100;
// A body returned for this many different domains is the source's placeholder.
const PLACEHOLDER_MIN = 3;
const CONCURRENCY = 8;
const TIMEOUT_MS = 8000;

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
}

async function main() {
  const top = Number(arg('top') ?? 400);
  const source = arg('from') ?? DEFAULT_SOURCE;

  // Rank domains by how many postings ride on each, so a bounded fetch covers
  // the most cards rather than an arbitrary slice of the alphabet.
  const byDomain = new Map<string, number>();
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
      const domain = logoDomain(r.url, r.company_name);
      if (domain) byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
    }
  }

  const ranked = [...byDomain.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  console.log(
    `\n  ${byDomain.size} distinct domains across ${totalPostings} postings` +
      `\n  fetching the top ${ranked.length} from ${source}\n`,
  );

  const got: Fetched[] = [];
  let failed = 0;
  for (let i = 0; i < ranked.length; i += CONCURRENCY) {
    await Promise.all(
      ranked.slice(i, i + CONCURRENCY).map(async ([domain, postings]) => {
        const url = source.replace('{domain}', encodeURIComponent(domain)).replace('{size}', '64');
        try {
          const res = await fetch(url, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            redirect: 'follow',
          });
          if (!res.ok) return void failed++;
          const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
          const ext = EXT_BY_TYPE[type];
          // No recognisable image type means an HTML error page dressed as 200.
          if (!ext) return void failed++;
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length < MIN_BYTES) return void failed++;
          got.push({ domain, postings, bytes, ext, hash: hashBytes(bytes) });
        } catch {
          failed++;
        }
      }),
    );
    process.stdout.write(`\r  fetched ${got.length}, failed ${failed}…   `);
  }
  process.stdout.write('\n');

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
      `\n  ${((100 * coveredPostings) / totalPostings).toFixed(1)}% of postings now` +
      ` show a real logo, served from this origin; the rest keep their monogram\n`,
  );

  const files = await readdir(OUT_DIR);
  if (files.length !== kept.length) {
    console.error(`  mismatch: ${files.length} files vs ${kept.length} manifest entries`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
