// URL canonicalization — §3. v2's "strip all query params" rule would collapse
// every Greenhouse-on-own-domain posting (gh_jid IS the identity, 190 uses).
// Rule: allowlist ID params, drop the rest.

const KEEP_PARAMS = new Set([
  'gh_jid',
  'token',
  'jobId',
  'job',
  'id',
  'icims',
  'siteid',
  'req',
  'requisitionId',
]);

export function canonicalKey(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl.trim().toLowerCase();
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  let path = u.pathname.replace(/\/+$/, ''); // strip trailing slash
  if (path === '') path = '/';

  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (KEEP_PARAMS.has(k)) kept.push([k, v]);
  }
  kept.sort(([a], [b]) => a.localeCompare(b));

  const query =
    kept.length > 0
      ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&')
      : '';

  return `${host}${path}${query}`; // fragment already dropped by not reading it
}

// §1 finding 4 — Greenhouse has two live hosts plus a .eu variant. Any host
// matching must accept all three.
const GREENHOUSE_HOSTS = [
  'job-boards.greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
];

// A coarse host bucket for the StatusPage source breakdown (§1 finding 4).
export function hostBucket(rawUrl: string): string {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (GREENHOUSE_HOSTS.includes(host)) return 'greenhouse';
  if (host === 'jobs.ashbyhq.com') return 'ashby';
  if (host === 'jobs.lever.co') return 'lever';
  if (host === 'jobs.smartrecruiters.com') return 'smartrecruiters';
  if (host.endsWith('.myworkdayjobs.com')) return 'workday';
  if (host === 'www.tesla.com') return 'tesla';
  if (host === 'lifeattiktok.com' || host === 'jobs.bytedance.com')
    return 'bytedance';
  return host.replace(/^www\./, '');
}
