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

// ATS URL decoration that doesn't change which job it is. Measured across the
// five feeds on 2026-09-29, each of these let the same posting through twice:
//
//   jobs.lever.co/kitware/<id>          vs  jobs.lever.co/kitware/<id>/apply
//   gm.wd5.myworkdayjobs.com/Careers_GM/job/Austin…_JR-202620418
//                                       vs  …/en-CA/Careers_GM/job/Austin…_JR-202620418
//
// Every rule is scoped to the ATS it describes. A false merge hides a real job
// from the board, which is worse than showing one twice, so nothing here is a
// guess about a host we haven't seen.
function normalizePath(host: string, path: string): string {
  // "…/apply" is the application form for the same posting, on any host.
  let p = path.replace(/\/apply(\/[a-z]+)?$/i, '');

  if (host === 'jobs.ashbyhq.com') p = p.replace(/\/application$/i, '');

  if (/\.myworkday(jobs|site)\.com$/.test(host)) {
    // Workday paths are case-insensitive, open with an optional locale, and put
    // a location segment in front of a slug that ends in the requisition id —
    // which is the one part that identifies the job: …/job/<where>/<title>_R123.
    p = p.toLowerCase().replace(/^\/[a-z]{2}-[a-z]{2}(?=\/)/, '');
    const req = /\/job\/(?:[^/]+\/)*[^/]*_([a-z0-9-]+)$/.exec(p);
    if (req) p = p.replace(/\/job\/.*$/, `/job/${req[1]}`);
  }

  if (host === 'jobs.smartrecruiters.com') {
    // /<Company>/<id>-<title-slug> → /<company>/<id>; the slug is decoration.
    p = p.replace(/^\/([^/]+)\/([0-9]{6,})(-[^/]*)?$/, (_, co: string, id: string) => `/${co.toLowerCase()}/${id}`);
  }

  if (host.endsWith('.icims.com')) {
    // /jobs/<id>/<title-slug>/job → /jobs/<id>
    p = p.replace(/^\/jobs\/([0-9]+)(\/.*)?$/, '/jobs/$1');
  }

  return p;
}

export function canonicalKey(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl.trim().toLowerCase();
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  let path = normalizePath(host, u.pathname.replace(/\/+$/, '')).replace(/\/+$/, '');
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
