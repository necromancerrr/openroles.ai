// Logo coverage audit — which employer domain each company resolves to, ranked
// by how many postings ride on it, so the curated override list in
// lib/logo-overrides.ts gets extended head-first instead of at random.
//
// Run:  npm run audit:logos                 # ranking + coverage, no network
//       npm run audit:logos -- --top=60
//       npm run audit:logos -- --probe \
//         --template='https://icons.duckduckgo.com/ip3/{domain}.ico'
//                                           # measure a provider's real hit rate
//
// --probe is how you choose a logo host with a number instead of a hunch: it
// requests every distinct domain once and reports coverage weighted by postings,
// which is what a reader actually sees. It needs egress to that host.

import { logoDomain } from '../lib/logo.ts';
import { LOGO_DOMAIN_OVERRIDES, normalizeCompany } from '../lib/logo-overrides.ts';
import { canonicalKey } from '../lib/canonical.ts';
import type { RawListing } from '../lib/types.ts';

// Same cache files as scripts/eval-classifier.ts, so the two tools share one
// download and can never disagree about what the feed currently says.
const FEEDS: { url: string; cache: string }[] = [
  {
    cache: '.eval-cache/internships.json',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
  },
  {
    cache: '.eval-cache/new-grad.json',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json',
  },
  {
    cache: '.eval-cache/vanshb03.json',
    url: 'https://raw.githubusercontent.com/vanshb03/Summer2026-Internships/dev/.github/scripts/listings.json',
  },
];

const CACHE_DIR = '.eval-cache';

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.slice(2).includes(`--${name}`);

async function load(feed: (typeof FEEDS)[number]): Promise<RawListing[]> {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  try {
    return JSON.parse(await readFile(feed.cache, 'utf8')) as RawListing[];
  } catch {
    /* not cached */
  }
  const res = await fetch(feed.url);
  if (!res.ok) throw new Error(`${feed.url} -> HTTP ${res.status}`);
  const rows = (await res.json()) as RawListing[];
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(feed.cache, JSON.stringify(rows));
  return rows;
}

interface Company {
  name: string;
  postings: number;
  domain?: string;
  overridden: boolean;
}

async function main() {
  const top = Number(arg('top') ?? 40);

  const byCompany = new Map<string, { postings: number; url: string }>();
  // Dedup exactly as ingest does, so "postings" here is what the board shows
  // rather than the sum of the feeds counting cross-source duplicates twice.
  const seen = new Set<string>();
  for (const feed of FEEDS) {
    for (const r of await load(feed)) {
      if (!(r.active && r.is_visible)) continue;
      const key = canonicalKey(r.url);
      if (seen.has(key)) continue;
      seen.add(key);
      const e = byCompany.get(r.company_name) ?? { postings: 0, url: r.url };
      e.postings++;
      byCompany.set(r.company_name, e);
    }
  }

  const companies: Company[] = [...byCompany.entries()]
    .map(([name, e]) => ({
      name,
      postings: e.postings,
      domain: logoDomain(e.url, name),
      overridden: normalizeCompany(name) in LOGO_DOMAIN_OVERRIDES,
    }))
    .sort((a, b) => b.postings - a.postings);

  const totalPostings = companies.reduce((n, c) => n + c.postings, 0);
  const resolved = companies.filter((c) => c.domain);
  const resolvedPostings = resolved.reduce((n, c) => n + c.postings, 0);
  const overridden = companies.filter((c) => c.overridden);

  console.log(
    `\n  ${companies.length} companies · ${totalPostings} postings` +
      `\n  domain resolved for ${resolved.length} companies` +
      ` (${((100 * resolvedPostings) / totalPostings).toFixed(1)}% of postings)` +
      `\n  ${overridden.length} of ${Object.keys(LOGO_DOMAIN_OVERRIDES).length}` +
      ` override keys matched a live company` +
      ` (${overridden.reduce((n, c) => n + c.postings, 0)} postings)\n`,
  );

  console.log(`  top ${top} companies by postings — the domain a logo host is asked for\n`);
  console.log('  postings  company                              domain');
  console.log('  ' + '─'.repeat(78));
  for (const c of companies.slice(0, top)) {
    console.log(
      `  ${String(c.postings).padStart(8)}  ${c.name.slice(0, 34).padEnd(34)}  ` +
        `${c.domain ?? '(none)'}${c.overridden ? '  ← override' : ''}`,
    );
  }

  const unresolved = companies.filter((c) => !c.domain).slice(0, 15);
  if (unresolved.length > 0) {
    console.log(`\n  highest-volume companies with no domain at all:`);
    for (const c of unresolved) {
      console.log(`  ${String(c.postings).padStart(8)}  ${c.name}`);
    }
    console.log('  (each is one line in lib/logo-overrides.ts)');
  }

  if (!flag('probe')) {
    console.log('\n  pass --probe with --template=… (or LOGO_URL_TEMPLATE) to measure hit rate\n');
    return;
  }
  // --template beats the env var so two providers can be compared back to back
  // without re-exporting anything.
  const template = arg('template') ?? process.env.LOGO_URL_TEMPLATE;
  if (!template) {
    console.error('\n  --probe needs --template=… or LOGO_URL_TEMPLATE.\n');
    process.exit(1);
  }
  const srcFor = (domain: string) =>
    template
      .replace('{domain}', encodeURIComponent(domain))
      .replace('{size}', '64');
  console.log(`\n  provider: ${template}`);

  // One request per distinct domain, not per posting.
  const distinct = new Map<string, number>();
  for (const c of resolved) distinct.set(c.domain!, (distinct.get(c.domain!) ?? 0) + c.postings);

  console.log(`  probing ${distinct.size} distinct domains…`);

  // Some providers answer 200 with a generic placeholder — a globe, a lettermark
  // — instead of 404ing on a domain they don't have. The status code can't see
  // that, and it matters: a globe on every card is worse than a clean monogram,
  // because it looks like a logo that failed rather than a mark that's meant.
  // Identical bytes returned for many different domains is the tell, so hash
  // each body and treat any image repeated across several domains as a miss.
  const byHash = new Map<string, string[]>();
  const responses = new Map<string, { ok: boolean; hash: string; postings: number }>();
  const entries = [...distinct.entries()];
  const CONCURRENCY = 8;

  function hashBytes(buf: ArrayBuffer): string {
    const view = new Uint8Array(buf);
    let h = 0x811c9dc5;
    for (let i = 0; i < view.length; i++) {
      h ^= view[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${view.length}-${h.toString(16)}`;
  }

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    await Promise.all(
      entries.slice(i, i + CONCURRENCY).map(async ([domain, postings]) => {
        try {
          const res = await fetch(srcFor(domain));
          const buf = await res.arrayBuffer();
          const ok = res.ok && buf.byteLength > 100;
          const hash = hashBytes(buf);
          responses.set(domain, { ok, hash, postings });
          if (ok) byHash.set(hash, [...(byHash.get(hash) ?? []), domain]);
        } catch {
          responses.set(domain, { ok: false, hash: 'error', postings });
        }
      }),
    );
  }

  // Any image body served for 3+ different domains is that provider's fallback,
  // not those companies' logos.
  const PLACEHOLDER_MIN = 3;
  const placeholders = new Set(
    [...byHash.entries()].filter(([, ds]) => ds.length >= PLACEHOLDER_MIN).map(([h]) => h),
  );

  let hit = 0;
  let hitPostings = 0;
  let placeheld = 0;
  const misses: [string, number][] = [];
  for (const [domain, r] of responses) {
    if (r.ok && !placeholders.has(r.hash)) {
      hit++;
      hitPostings += r.postings;
    } else {
      if (r.ok) placeheld++;
      misses.push([domain, r.postings]);
    }
  }

  if (placeholders.size > 0) {
    console.log(
      `\n  ${placeheld} domains got one of ${placeholders.size} generic placeholder image(s)` +
        ` — counted as misses, since a placeholder on a card is worse than a monogram.`,
    );
  }

  console.log(
    `\n  hit ${hit}/${distinct.size} domains` +
      ` — ${((100 * hitPostings) / totalPostings).toFixed(1)}% of all postings` +
      ` get a real logo, the rest keep their monogram\n`,
  );
  misses.sort((a, b) => b[1] - a[1]);
  if (misses.length > 0) {
    console.log('  biggest misses (fix these domains first):');
    for (const [domain, postings] of misses.slice(0, 15)) {
      console.log(`  ${String(postings).padStart(8)}  ${domain}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
