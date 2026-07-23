// StatusPage — §5.6. The only view that answers "is this thing working." Reads
// the fetch runs directly. Numeric columns in --font-data, right-aligned.
// Status as a text word, not a colored dot. Also the GitHub Actions health
// check endpoint.

import Link from 'next/link';
import { getFeed } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const { jobs, runs, lastRunAt } = await getFeed();

  // Host distribution across live postings (§1 finding 4).
  const hosts = new Map<string, number>();
  for (const j of jobs) hosts.set(j.host, (hosts.get(j.host) ?? 0) + 1);
  const hostRows = [...hosts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <div className="wordmark">status</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>
            fetch runs · source health
          </div>
        </div>
        <div className="masthead__meta">
          <Link className="backlink" href="/">
            ← board
          </Link>
        </div>
      </header>

      <p className="masthead__meta" style={{ paddingTop: 24 }}>
        Last run{' '}
        {new Date(lastRunAt * 1000).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </p>

      <table className="statustable">
        <caption className="eyebrow" style={{ textAlign: 'left', paddingBottom: 8 }}>
          Sources
        </caption>
        <thead>
          <tr>
            <th>Source</th>
            <th>Status</th>
            <th className="num">Fetched</th>
            <th className="num">Active</th>
            <th className="num">Inserted</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className={`status-${r.status} mono`}>{r.status}</td>
              <td className="num">{r.fetched.toLocaleString()}</td>
              <td className="num">{r.active.toLocaleString()}</td>
              <td className="num">{r.inserted.toLocaleString()}</td>
              <td className="mono">{r.error ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="statustable">
        <caption className="eyebrow" style={{ textAlign: 'left', paddingBottom: 8 }}>
          Live postings by host
        </caption>
        <thead>
          <tr>
            <th>Host</th>
            <th className="num">Postings</th>
          </tr>
        </thead>
        <tbody>
          {hostRows.map(([host, count]) => (
            <tr key={host}>
              <td className="mono">{host}</td>
              <td className="num">{count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
