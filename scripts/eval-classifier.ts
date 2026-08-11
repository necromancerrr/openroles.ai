// Type-classifier eval — addendum §5. The two SimplifyJobs repos are free
// labeled ground truth: repo of origin IS the correct answer. That makes it
// possible to put a number on the one question that decides whether a model
// earns its cost here — how much of the board can be typed from the title alone?
//
// Run:  npm run eval:classifier
//       npm run eval:classifier -- --sample=300 --seed=7
//       npm run eval:classifier -- --update      (rewrite the recorded baseline)
//
// What's being measured (§6): a title-only classifier whose output space is
// internship | new_grad | unknown. Positive evidence is required for a label, so
// a title carrying no signal comes back `unknown` and the row lands in the
// Unclassified tab rather than being confidently wrong (§4's confidence floor,
// applied to a keyword rule instead of a model).
//
// Reads: both live listings.json, cached under .eval-cache/ so reruns are
// instant and work offline.
// Writes: eval/type-classifier.json — the recorded numbers, for regression
// checking after any change to the rules.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { looksLikeInternship } from '../lib/classify.ts';
import type { RawListing } from '../lib/types.ts';

type Label = 'internship' | 'new_grad';
type Verdict = Label | 'unknown';

const FEEDS: { url: string; label: Label; cache: string }[] = [
  {
    label: 'internship',
    cache: '.eval-cache/internships.json',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
  },
  {
    label: 'new_grad',
    cache: '.eval-cache/new-grad.json',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json',
  },
];

const BASELINE_PATH = 'eval/type-classifier.json';
// The feed turns over daily, so an exact match would always "fail". This is wide
// enough to absorb data drift and narrow enough to catch a rule regression.
const DRIFT_TOLERANCE_PP = 2.0;

// --- classifiers under test ------------------------------------------------
// A classifier is a name and a title → verdict function, so a model-backed one
// (addendum §2) drops in here as one more entry rather than a rewrite.
interface Classifier {
  name: string;
  classify: (title: string) => Verdict;
}

// Reference new-grad keyword rule. MEASUREMENT ONLY — deliberately not exported
// from lib/. §1 finding 5 and §6 both say don't ship a new-grad title
// classifier; the point of having it here is to measure exactly how badly it
// does, which is the entire argument for reading the description instead.
const NEW_GRAD_PATTERNS: RegExp[] = [
  /\bnew\s*grad(uate)?s?\b/i,
  /\bentry[-\s]?level\b/i,
  /\bearly[-\s]?career\b/i,
  /\bcampus\s+hire\b/i,
  /\buniversity\s+(grad(uate)?|hire|recruit)/i,
  /\bgraduate\s+(program|scheme|analyst|engineer|developer|rotational)/i,
  /\bclass\s+of\s+20\d\d\b/i,
  /\b20\d\d\s+grad(uate)?s?\b/i,
  /\brecent\s+grad(uate)?s?\b/i,
  /\bjunior\b/i,
  /\bassociate\s+(software|engineer|developer|analyst)/i,
  /\b(engineer|developer|analyst|scientist)\s+i\b/i,
  /\brotational\s+program\b/i,
];

// Seniority markers — evidence a posting is NOT for a new graduate.
const SENIOR_PATTERNS: RegExp[] = [
  /\bsenior\b/i, /\bsr\.?\b/i, /\bstaff\b/i, /\bprincipal\b/i, /\blead\b/i,
  /\bmanager\b/i, /\bdirector\b/i, /\bhead\s+of\b/i, /\bii+\b/i,
  /\b(level|lvl)\s*[2-9]\b/i, /\b[3-9]\+?\s*years\b/i, /\bexperienced\b/i,
];

const CLASSIFIERS: Classifier[] = [
  {
    // What the app ships. Positive evidence or nothing: never guesses a label it
    // can't see in the string. Internship evidence wins — a title that says
    // "intern" is an internship regardless of what else it says.
    name: 'keyword-strict',
    classify: (title) => {
      if (looksLikeInternship(title)) return 'internship';
      if (NEW_GRAD_PATTERNS.some((re) => re.test(title))) return 'new_grad';
      return 'unknown';
    },
  },
  {
    // The tempting alternative, measured so it can be argued about with numbers:
    // treat absence of seniority as evidence of new-grad. It buys recall by
    // guessing, which converts hidden rows into confidently wrong ones — the
    // error that costs a reader an application instead of a glance (§4).
    name: 'keyword-broad',
    classify: (title) => {
      if (looksLikeInternship(title)) return 'internship';
      if (SENIOR_PATTERNS.some((re) => re.test(title))) return 'unknown';
      return 'new_grad';
    },
  },
];

// --- metrics ---------------------------------------------------------------
interface ClassMetrics {
  n: number;
  correct: number; // labeled as its true class
  wrong: number; // labeled as the *other* class — the expensive error
  hidden: number; // unknown — costs a glance, not an application
  recall_pct: number;
  wrong_pct: number;
  hidden_pct: number;
}

interface Result {
  classifier: string;
  total: number;
  by_class: Record<Label, ClassMetrics>;
  overall: { correct_pct: number; wrong_pct: number; hidden_pct: number };
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((1000 * n) / d) / 10;
}

function evaluate(rows: Row[], c: Classifier): Result {
  const blank = (): ClassMetrics => ({
    n: 0, correct: 0, wrong: 0, hidden: 0,
    recall_pct: 0, wrong_pct: 0, hidden_pct: 0,
  });
  const by_class: Record<Label, ClassMetrics> = {
    internship: blank(),
    new_grad: blank(),
  };

  for (const r of rows) {
    const m = by_class[r.label];
    m.n++;
    const v = c.classify(r.title);
    if (v === r.label) m.correct++;
    else if (v === 'unknown') m.hidden++;
    else m.wrong++;
  }

  let correct = 0, wrong = 0, hidden = 0;
  for (const m of Object.values(by_class)) {
    m.recall_pct = pct(m.correct, m.n);
    m.wrong_pct = pct(m.wrong, m.n);
    m.hidden_pct = pct(m.hidden, m.n);
    correct += m.correct;
    wrong += m.wrong;
    hidden += m.hidden;
  }
  const total = rows.length;

  return {
    classifier: c.name,
    total,
    by_class,
    overall: {
      correct_pct: pct(correct, total),
      wrong_pct: pct(wrong, total),
      hidden_pct: pct(hidden, total),
    },
  };
}

// --- data ------------------------------------------------------------------
interface Row {
  title: string;
  company: string;
  label: Label;
}

async function load(feed: (typeof FEEDS)[number]): Promise<RawListing[]> {
  try {
    return JSON.parse(await readFile(feed.cache, 'utf8')) as RawListing[];
  } catch {
    // Not cached yet — fetch once and keep it.
  }
  const res = await fetch(feed.url);
  if (!res.ok) throw new Error(`${feed.url} -> HTTP ${res.status}`);
  const rows = (await res.json()) as RawListing[];
  await mkdir('.eval-cache', { recursive: true });
  await writeFile(feed.cache, JSON.stringify(rows));
  return rows;
}

// Deterministic PRNG (mulberry32) so a sampled run is reproducible from its seed
// and re-runnable as a regression check.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stratified: half from each repo, so per-class recall is equally precise on
// both sides rather than tracking the 1:2 split of the feeds.
function sample(rows: Row[], perClass: number, seed: number): Row[] {
  const rand = rng(seed);
  const out: Row[] = [];
  for (const label of ['internship', 'new_grad'] as Label[]) {
    const pool = rows.filter((r) => r.label === label);
    // Fisher-Yates, seeded.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    out.push(...pool.slice(0, perClass));
  }
  return out;
}

// --- reporting -------------------------------------------------------------
function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.slice(2).includes(`--${name}`);

function bar(p: number, width = 28): string {
  const filled = Math.round((p / 100) * width);
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function report(r: Result) {
  const rows: [string, ClassMetrics][] = [
    ['internship', r.by_class.internship],
    ['new grad', r.by_class.new_grad],
  ];
  console.log(`\n  ${r.classifier} — title-only, n=${r.total}\n`);
  console.log('  class        n     typed   miswritten   hidden');
  console.log('  ' + '─'.repeat(52));
  for (const [name, m] of rows) {
    console.log(
      `  ${name.padEnd(11)} ${String(m.n).padStart(5)}   ` +
        `${(m.recall_pct + '%').padStart(6)}   ` +
        `${(m.wrong_pct + '%').padStart(10)}   ` +
        `${(m.hidden_pct + '%').padStart(6)}`,
    );
    console.log(`  ${' '.repeat(11)}       ${bar(m.recall_pct)}`);
  }
  console.log('  ' + '─'.repeat(52));
  console.log(
    `  all         ${String(r.total).padStart(5)}   ` +
      `${(r.overall.correct_pct + '%').padStart(6)}   ` +
      `${(r.overall.wrong_pct + '%').padStart(10)}   ` +
      `${(r.overall.hidden_pct + '%').padStart(6)}`,
  );
  console.log(
    `\n  typed      = given its correct type from the title alone` +
      `\n  miswritten = given the OTHER type — costs a wasted application` +
      `\n  hidden     = unknown, lands in the Unclassified tab — costs a glance\n`,
  );
}

// A fingerprint of the exact rows scored. Without it a re-run can't tell a rule
// regression from the feed simply moving on — and it moves a lot: one week of
// churn shifted internship recall +6pp with no code change at all. Fail only
// when the rows are identical and the numbers still moved; otherwise report the
// deltas for what they are, feed drift.
function fingerprint(rows: Row[]): string {
  let h = 0x811c9dc5;
  for (const s of rows.map((r) => `${r.label}:${r.title}`).sort()) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return `${rows.length}-${h.toString(16)}`;
}

interface Baseline {
  recorded_at: string;
  source: string;
  dataset: string;
  results: Result[];
}

async function compare(results: Result[], dataset: string): Promise<boolean> {
  let baseline: Baseline;
  try {
    baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8')) as Baseline;
  } catch {
    console.log(`  no baseline at ${BASELINE_PATH} — run with --update to record one\n`);
    return true;
  }

  const sameRows = baseline.dataset === dataset;
  console.log(`  vs baseline recorded ${baseline.recorded_at.slice(0, 10)}` +
    ` (tolerance ±${DRIFT_TOLERANCE_PP}pp)`);
  if (!sameRows) {
    // A baseline recorded before fingerprinting existed has no dataset field;
    // treat it the same way — it can't prove the rows were identical either.
    const wasRows = baseline.dataset?.split('-')[0] ?? 'unknown';
    console.log(
      `  NOTE: these are not the rows the baseline was recorded on` +
        ` (${wasRows} → ${dataset.split('-')[0]}).` +
        `\n        Movement below is the feed, not a rule regression. Re-record with --update.`,
    );
  }
  console.log('');
  let ok = true;
  for (const r of results) {
    const was = baseline.results.find((b) => b.classifier === r.classifier);
    if (!was) {
      console.log(`  ${r.classifier}: new classifier, nothing to compare`);
      continue;
    }
    for (const label of ['internship', 'new_grad'] as Label[]) {
      const d = r.by_class[label].recall_pct - was.by_class[label].recall_pct;
      const moved = Math.abs(d) > DRIFT_TOLERANCE_PP;
      if (moved && sameRows) ok = false;
      const tag = !moved ? '  ok ' : sameRows ? 'DRIFT' : 'feed ';
      console.log(
        `  ${tag} ${r.classifier} ${label.padEnd(11)}` +
          ` ${was.by_class[label].recall_pct}% → ${r.by_class[label].recall_pct}%` +
          ` (${d >= 0 ? '+' : ''}${Math.round(d * 10) / 10}pp)`,
      );
    }
  }
  console.log('');
  return ok;
}

async function main() {
  const perClassArg = arg('sample');
  const seed = Number(arg('seed') ?? 1);

  const all: Row[] = [];
  for (const feed of FEEDS) {
    const raw = await load(feed);
    // Same gate as ingest (§1 finding 1): only rows the board would show.
    for (const r of raw) {
      if (!(r.active && r.is_visible)) continue;
      all.push({ title: r.title, company: r.company_name, label: feed.label });
    }
  }

  // The full feed is the default because a regex costs nothing to run 4,248
  // times — an exact number beats an estimate. --sample exists for the case the
  // addendum was written for: a classifier that bills per row (§3), where 300
  // held-out rows are what you can afford to measure.
  let rows = all;
  if (perClassArg) {
    const perClass = Math.max(1, Math.floor(Number(perClassArg) / 2));
    rows = sample(all, perClass, seed);
    console.log(
      `\n  sampled ${rows.length} of ${all.length} rows` +
        ` (${perClass}/class, seed ${seed})`,
    );
  } else {
    console.log(`\n  full feed — ${all.length} labeled rows, no sampling`);
  }

  const dataset = fingerprint(rows);
  const results = CLASSIFIERS.map((c) => evaluate(rows, c));
  for (const r of results) report(r);

  if (flag('update')) {
    await mkdir('eval', { recursive: true });
    const baseline: Baseline = {
      recorded_at: new Date().toISOString(),
      source: perClassArg
        ? `stratified sample of ${rows.length}, seed ${seed}`
        : 'full active feed',
      dataset,
      results,
    };
    await writeFile(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`  recorded baseline → ${BASELINE_PATH}\n`);
    return;
  }

  const ok = await compare(results, dataset);
  if (!ok) {
    console.error('  same rows, different numbers — a rule changed. Fix it or re-record.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
