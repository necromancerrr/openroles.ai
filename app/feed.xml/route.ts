// RSS for any view of the board: /feed.xml takes exactly the board's URL
// params, so "Seattle + remote, software internships, Summer 2027" is a feed
// a student can put in a reader, a Slack channel, or a Discord bot — the board
// comes to them instead of them remembering to come to it.
//
// The newest 100 matches, newest first. Cached at the edge for 15 minutes:
// feed readers poll on their own schedule and the board refreshes hourly.

import { getFeed } from '@/lib/ingest';
import { applyFilters, parseFilters, type Filters } from '@/lib/filter';
import { CATEGORY_LABELS, SPONSORSHIP_LABEL, primaryTerm, termLabel } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMIT = 100;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function describe(f: Filters): string {
  const parts: string[] = [];
  if (f.query) parts.push(`“${f.query}”`);
  for (const c of f.categories) parts.push(CATEGORY_LABELS[c]);
  for (const t of f.terms) parts.push(termLabel(t));
  parts.push(f.type === 'new_grad' ? 'new-grad roles' : f.type === 'unknown' ? 'unclassified roles' : 'internships');
  const where: string[] = [];
  if (f.campus) where.push('Seattle + remote');
  if (f.remote) where.push('remote');
  for (const l of f.locations) where.push(l.replace(/-/g, ' '));
  if (where.length) parts.push(`in ${where.join(', ')}`);
  if (f.visa) parts.push('(open to visa holders)');
  return parts.join(' ');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const filters = parseFilters(sp);
  const feed = await getFeed();
  const items = applyFilters(feed.jobs, filters).slice(0, LIMIT);
  const now = new Date(feed.lastRunAt * 1000);

  const board = new URL('/', url.origin);
  for (const [k, v] of url.searchParams) board.searchParams.set(k, v);
  const title = `OpenRoles — ${describe(filters)}`;

  const body = items
    .map((j) => {
      const term = primaryTerm(j.terms, now);
      const details = [
        j.locations.join(' · '),
        term ? termLabel(term) : '',
        j.pay ?? '',
        j.sponsorship ? SPONSORSHIP_LABEL[j.sponsorship] : '',
      ]
        .filter(Boolean)
        .join(' — ');
      return `    <item>
      <title>${esc(`${j.company} — ${j.title}`)}</title>
      <link>${esc(j.url)}</link>
      <guid isPermaLink="false">${esc(j.canonicalKey)}</guid>
      <pubDate>${new Date(j.firstSeenAt * 1000).toUTCString()}</pubDate>
      <category>${esc(CATEGORY_LABELS[j.category])}</category>
      <description>${esc(details)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(board.toString())}</link>
    <atom:link href="${esc(url.toString())}" rel="self" type="application/rss+xml"/>
    <description>${esc(`The newest ${describe(filters)} on OpenRoles, newest first.`)}</description>
    <language>en-us</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
${body}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
