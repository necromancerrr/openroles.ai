// StatusPage — §5.6. The only view that answers "is this thing working."
// Numeric columns in --font-data, right-aligned. Status as a text word (tinted:
// olive ok, rust failed, muted stale — but always the word, never just a dot).
// Also the GitHub Actions health check endpoint.
//
// Beyond "did the fetch succeed", it answers the question that actually goes
// wrong with aggregator feeds: is the feed still being *maintained*? A list
// that stops updating keeps serving 200s full of postings that have closed.
// Each feed's own newest sign of life is shown, and a feed quiet for three
// weeks is withheld with its reason (lib/ingest.ts).

import { getFeed } from '@/lib/ingest';
import { ageText } from '@/lib/age';
import { SiteNav, LivePill } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ORIGIN: Record<string, string> = {
  live: 'fetched live by this server',
  snapshot: 'loaded from the deploy’s build-time snapshot; checked live again once it’s an hour old',
  sample: 'no source reachable — sample data',
};

export default async function StatusPage() {
  const feed = await getFeed();
  const { jobs, runs, lastRunAt, origin } = feed;
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);
  const when = (t?: number) => (t === undefined ? '—' : ageText(t, now));

  // Host distribution across live postings (§1 finding 4).
  const hosts = new Map<string, number>();
  for (const j of jobs) hosts.set(j.host, (hosts.get(j.host) ?? 0) + 1);
  const hostRows = [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);

  const count = (pred: (j: (typeof jobs)[number]) => boolean) => jobs.filter(pred).length;

  const ok = runs.filter((r) => r.status === 'ok').length;
  const tile = (i: number) => ({ '--i': i }) as React.CSSProperties;

  return (
    <>
      <SiteNav
        current="status"
        meta={
          <LivePill>
            <strong>{ok}</strong> of {runs.length} sources ok
          </LivePill>
        }
      />
      <main className="shell" id="main">
        <section className="pagehead rise" style={tile(0)}>
          <p className="eyebrow">Fetch runs · source health</p>
          <h1>
            Is the board <em>healthy?</em>
          </h1>
          <p className="pagehead__lead">
            Every source, when it last changed, and why anything is held back. A list
            that stops updating keeps serving postings that have closed, so a feed quiet
            for three weeks is withheld until it moves again.
          </p>
        </section>

        <dl className="stats stats--status">
          <div className="stat rise" style={tile(1)}>
            <dt>Last run</dt>
            <dd className="stat__text">{ageText(lastRunAt, now)}</dd>
            <dd className="stat__note">
              {new Date(lastRunAt * 1000).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'America/Los_Angeles',
              })}{' '}
              PT · {ORIGIN[origin]}
            </dd>
          </div>
          <div className="stat rise" style={tile(2)}>
            <dt>On the board</dt>
            <dd>{jobs.length.toLocaleString('en-US')}</dd>
            <dd className="stat__note">
              {count((j) => j.type === 'internship').toLocaleString('en-US')} internships ·{' '}
              {count((j) => j.type === 'new_grad').toLocaleString('en-US')} new grad
            </dd>
          </div>
          <div className="stat rise" style={tile(3)}>
            <dt>Posted in the last 24h</dt>
            <dd>{count((j) => now - j.firstSeenAt < 86400).toLocaleString('en-US')}</dd>
            <dd className="stat__note">by the source&apos;s own posting time</dd>
          </div>
          <div className="stat rise" style={tile(4)}>
            <dt>Pay · sponsorship stated</dt>
            <dd>
              {count((j) => !!j.pay).toLocaleString('en-US')}
              <span className="stat__sep"> · </span>
              {count((j) => !!j.sponsorship).toLocaleString('en-US')}
            </dd>
            <dd className="stat__note">postings where a source said so</dd>
          </div>
        </dl>

      <div className="tablewrap">
        <table className="statustable">
          <caption className="eyebrow">Sources, in dedup priority order</caption>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th className="num">Last update</th>
              <th className="num">Newest posting</th>
              <th className="num">Rows</th>
              <th className="num">Live</th>
              <th className="num">Added</th>
              <th className="num">Enriched</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.name}>
                <td>
                  <a className="statuslink" href={r.home} target="_blank" rel="noopener noreferrer">
                    {r.name}
                  </a>
                </td>
                <td>
                  <span className={`statuspill statuspill--${r.status}`}>{r.status}</span>
                </td>
                <td className="num">{when(r.updatedAt)}</td>
                <td className="num">{when(r.newestPostedAt)}</td>
                <td className="num">{r.fetched.toLocaleString()}</td>
                <td className="num">{r.active.toLocaleString()}</td>
                <td className="num">{r.inserted.toLocaleString()}</td>
                <td className="num">{r.enriched.toLocaleString()}</td>
                <td className="mono">
                  {r.error ?? '—'}
                  {r.carried ? ' · showing its last good postings' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tablenote">
        Added: postings this source put on the board. Enriched: postings a source
        above it listed first, that this one added pay or sponsorship to.
      </p>

      <div className="tablewrap">
        <table className="statustable">
          <caption className="eyebrow">Live postings by host</caption>
          <thead>
            <tr>
              <th>Host</th>
              <th className="num">Postings</th>
            </tr>
          </thead>
          <tbody>
            {hostRows.map(([host, n]) => (
              <tr key={host}>
                <td className="mono">{host}</td>
                <td className="num">{n.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </main>
      <SiteFooter />
    </>
  );
}
