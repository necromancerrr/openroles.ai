// Regenerate sources.verified.json — §7. Don't hand-curate the board list;
// derive it from where the live postings actually are, then trim to slugs that
// appear in >= 2 live postings. ~20 lines of real work against the two feeds.
//
// Run:  npm run ingest:sources
// Writes: sources.verified.json at the repo root.

import { writeFile } from 'node:fs/promises';
import type { RawListing } from '../lib/types.ts';

const FEEDS: { url: string; key: 'active_intern' | 'active_newgrad' }[] = [
  {
    url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json',
    key: 'active_intern',
  },
  {
    url: 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json',
    key: 'active_newgrad',
  },
];

// Slug path segments that are never a company (§3).
const BLOCK_SEGMENTS = new Set(['embed', 'agency', 'job_app', 'jobs', 'job', '']);

function detect(url: string): { kind: string; slug: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter((s) => !BLOCK_SEGMENTS.has(s.toLowerCase()));

  if (host.endsWith('greenhouse.io')) return firstSeg('greenhouse', seg);
  if (host === 'jobs.ashbyhq.com') return firstSeg('ashby', seg, /* keepCase */ true);
  if (host === 'jobs.lever.co') return firstSeg('lever', seg);
  if (host === 'jobs.smartrecruiters.com') return firstSeg('smartrecruiters', seg);
  return null;
}

function firstSeg(kind: string, seg: string[], keepCase = false): { kind: string; slug: string } | null {
  if (seg.length === 0) return null;
  const slug = keepCase ? seg[0] : seg[0].toLowerCase();
  return { kind, slug };
}

interface Entry {
  kind: string;
  slug: string;
  company: string;
  active_intern: number;
  active_newgrad: number;
}

async function main() {
  const boards = new Map<string, Entry>();

  for (const feed of FEEDS) {
    const res = await fetch(feed.url);
    if (!res.ok) throw new Error(`${feed.url} -> HTTP ${res.status}`);
    const rows = (await res.json()) as RawListing[];
    for (const r of rows) {
      if (!(r.active && r.is_visible)) continue;
      const d = detect(r.url);
      if (!d) continue;
      const id = `${d.kind}:${d.slug}`;
      const e =
        boards.get(id) ??
        { kind: d.kind, slug: d.slug, company: r.company_name, active_intern: 0, active_newgrad: 0 };
      e[feed.key]++;
      boards.set(id, e);
    }
  }

  // Trim: keep slugs appearing in >= 2 live postings total.
  const kept = [...boards.values()]
    .filter((e) => e.active_intern + e.active_newgrad >= 2)
    .sort((a, b) => b.active_intern + b.active_newgrad - (a.active_intern + a.active_newgrad));

  await writeFile('sources.verified.json', JSON.stringify(kept, null, 2) + '\n');
  console.log(`wrote sources.verified.json — ${kept.length} boards`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
