// JSON for any view of the board — the same URL params as the page, for
// scripts, bots and anything else that wants the data rather than the page.
//
//   /api/jobs?type=internship&campus=1&limit=50&offset=0
//
// Returns only facts a reader would see on a card, newest first.

import { getFeed } from '@/lib/ingest';
import { applyFilters, parseFilters } from '@/lib/filter';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_LIMIT = 500;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const limit = Math.min(Math.max(Number(sp.limit) || 100, 1), MAX_LIMIT);
  const offset = Math.max(Number(sp.offset) || 0, 0);

  const feed = await getFeed();
  const matched = applyFilters(feed.jobs, parseFilters(sp));

  return Response.json(
    {
      checkedAt: new Date(feed.lastRunAt * 1000).toISOString(),
      total: matched.length,
      offset,
      limit,
      jobs: matched.slice(offset, offset + limit).map((j) => ({
        company: j.company,
        initials: j.initials,
        logo: j.logoUrl ?? null,
        title: j.title,
        url: j.url,
        type: j.type,
        category: j.category,
        terms: j.terms,
        locations: j.locations,
        remote: j.isRemote,
        pay: j.pay ?? null,
        sponsorship: j.sponsorship ?? null,
        postedAt: new Date(j.firstSeenAt * 1000).toISOString(),
        source: j.source,
      })),
    },
    {
      headers: {
        'cache-control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
        'access-control-allow-origin': '*',
      },
    },
  );
}
