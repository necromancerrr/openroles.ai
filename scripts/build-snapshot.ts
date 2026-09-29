// Build the board once, at build time, and ship it with the deployment.
//
// Run:  npm run snapshot      (also runs as part of `prebuild`)
// Writes: .snapshot/feed.json — gitignored; traced into every server function
// by next.config.mjs.
//
// Why: a server instance keeps the feed in memory, but a *fresh* instance has
// nothing, and building the board from scratch means downloading ~45MB of
// feeds before the first card can render. On a low-traffic deployment most
// visits land on a fresh instance. With the snapshot they're answered at once
// from the build's copy, and the live refresh happens after the response
// (lib/ingest.ts). The banner says how old the data is if it's old.
//
// This must never fail a deploy: if no feed is reachable it writes nothing,
// and the app falls back to fetching live on first request, as it always has.

import { refreshFeed, writeSnapshot, SNAPSHOT_FILE } from '../lib/ingest';

async function main() {
  const started = Date.now();
  const feed = await refreshFeed(null);

  const pad = (s: string | number, n: number) => String(s).padStart(n);
  console.log('\n  source                                                              status   rows  live  added  enriched');
  for (const r of feed.runs) {
    console.log(
      `  ${r.name.padEnd(68)} ${r.status.padEnd(7)}${pad(r.fetched, 6)}${pad(r.active, 6)}${pad(r.inserted, 7)}${pad(r.enriched, 10)}` +
        (r.error ? `   ${r.error}` : ''),
    );
  }

  if (feed.origin === 'sample') {
    console.warn('\n  no feed was reachable — not writing a snapshot; the app will fetch live on first request\n');
    return;
  }

  const byType = new Map<string, number>();
  for (const j of feed.jobs) byType.set(j.type, (byType.get(j.type) ?? 0) + 1);
  await writeSnapshot(feed);
  console.log(
    `\n  ${feed.jobs.length} postings (${[...byType].map(([t, n]) => `${n} ${t}`).join(', ')})` +
      ` · pay on ${feed.jobs.filter((j) => j.pay).length}` +
      ` · sponsorship stated on ${feed.jobs.filter((j) => j.sponsorship).length}` +
      `\n  wrote ${SNAPSHOT_FILE} in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
  );
}

main().catch((err) => {
  // A snapshot is an optimization. Never let it take a deploy down.
  console.warn('\n  snapshot skipped:', err instanceof Error ? err.message : err, '\n');
});
