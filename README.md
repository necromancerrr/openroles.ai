# openroles

An internship & new-grad job board built to the **Ledger** design system
(`internship-tracker-design-system.md`, v1). A scanning surface used daily under
time pressure: the subject isn't "jobs," it's *windows closing*. So **age is the
primary visual variable, and it's the only thing in the interface that gets
color** — the decay rail on each card's leading edge.

The app ingests three live aggregator feeds, normalizes them into one canonical
taxonomy, dedups by canonical URL, and renders the board as a Server Component
with all filter state in the URL.

| Source | Type | Active | Inserted after dedup |
|---|---|---|---|
| `SimplifyJobs/Summer2026-Internships` | internship | 1,406 | 1,406 |
| `SimplifyJobs/New-Grad-Positions` | new grad | 2,842 | 2,841 |
| `vanshb03/Summer2026-Internships` | internship | 235 | 208 |

The third feed was added because it measurably differs rather than duplicates:
210 of its 235 active rows aren't in the SimplifyJobs internship feed, and 40%
of those were posted inside 7 days against 9% for SimplifyJobs — a freshness gain
at the head of the board, which is the thing this surface exists to show. It also
has a staler tail (19% older than 6 months vs 7%), which the decay rail handles
on its own: those rows sort to the bottom and read as unrailed.

Its two schema gaps are surfaced rather than papered over. Rows carry no
`category`, so they normalize to `Other` and can't be category-filtered. And
`season` is bare — `"Summer"`, `"Fall"`, no year — which isn't inferable from the
repo name either, since these repos carry off-season rows (§2.2), so those rows
read `Unspecified` instead of being assigned a term nobody stated.

`/status` reports fetched / active / inserted per source, so a feed going quiet is
visible rather than silently missing.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

The first request downloads both `listings.json` files (~23 MB), filters to
`active && is_visible` at parse time, and caches for an hour. If the network is
unavailable it falls back to a bundled sample fixture and the SystemBanner says
so. `/status` shows the fetch runs and host breakdown.

Regenerate the verified-boards artifact from where the live postings actually
are (§7):

```bash
npm run ingest:sources   # writes sources.verified.json
```

## Company logos

Every card leads with a company mark. By default that's a **monogram** derived
from the name (`Jane Street` → `JS`, `TikTok` → `TT`, `IMC Trading` → `IMC`) —
no network, nothing to lay out twice, works offline.

To paint real logos over the monograms, point `LOGO_URL_TEMPLATE` at a logo host
with a `{domain}` placeholder:

```bash
LOGO_URL_TEMPLATE='https://logo.example.com/{domain}' npm run dev
```

The employer domain is derived from the apply URL at ingest time
(`lib/logo.ts`) — exact for company-owned hosts (`jobs.apple.com` → `apple.com`),
a slug guess for ATS hosts (`jobs.lever.co/imc/…` → `imc.com`), and skipped for
hosts that identify the ATS rather than the employer. Roughly 90% of companies
resolve to a candidate domain. A logo that 404s or is blocked paints nothing and
the monogram stays — the fallback is a CSS background layer, not client JS.

## Eval harness — how much of the board can be typed from a title?

The two feeds are free labeled ground truth: repo of origin *is* the correct
answer for 4,248 active rows. That makes the central question measurable rather
than arguable — so it's measured, and the number is recorded.

```bash
npm run eval:classifier                          # full feed, exact
npm run eval:classifier -- --sample=300 --seed=7 # held-out sample, reproducible
npm run eval:classifier -- --update              # re-record the baseline
```

Two rule designs, both scored on the same rows. `typed` is given the correct type
from the title alone; `miswritten` is given the *other* type; `hidden` is
`unknown`, which lands the row in the Unclassified tab:

| rule | internship typed | new-grad typed | board hidden | miswritten |
|---|---|---|---|---|
| `keyword-strict` — positive evidence only (what ships) | 82.2% | 11.9% | 64.6% | 0.2% |
| `keyword-broad` — absence of seniority counts as new-grad | 82.2% | 93.3% | 4.6% | 5.8% |

Read those two rows together and the case for reading the **description** rather
than the title writes itself. Strict hides two-thirds of the board. Broad buys
that back by guessing, and pays for it by labelling **17.5% of internships as
new-grad** — 246 postings sent to the wrong tab. One error costs a reader a
glance; the other costs an application. Neither rule is good enough, and no
title-only rule will be, because the eligibility signal isn't in the title.

A 300-row stratified sample lands within ~4pp of the full-feed figure, which is
the useful fact for a classifier that bills per row: 300 rows is enough to decide
with. The full feed is the default only because a regex costs nothing to run
4,248 times.

`eval/type-classifier.json` holds the recorded numbers and a re-run compares
against it (±2pp, wide enough to absorb daily feed churn, narrow enough to catch
a rule regression). Adding a model-backed classifier means adding one entry to
`CLASSIFIERS` in `scripts/eval-classifier.ts`, not rewriting the harness.

Two honest caveats. Simplify's labels are themselves imperfect. And **the design
doc's 29.5% new-grad figure did not reproduce**: a strict positive-evidence rule
measures 11.9%, and no keyword set gets near 29.5% without switching to
negative evidence, which scores 93.3% by guessing. The doc's *conclusion* —
internship classifier only, surface `unknown` — is what the numbers support;
its percentage isn't one this harness can confirm.

## How it maps to the design doc

| Design doc | Where it lives |
|---|---|
| §1 finding 1 — filter `active && is_visible` at parse time | `lib/ingest.ts` |
| §1 finding 4 — aggregator is primary, ATS is the freshness layer | `lib/ingest.ts`, host buckets in `lib/canonical.ts` |
| §1 finding 5 — internship classifier only, never a new-grad one | `lib/classify.ts` (type comes from repo-of-origin here) |
| addendum §5 — eval harness on the labeled feeds, recorded and re-runnable | `scripts/eval-classifier.ts`, `eval/type-classifier.json` |
| §2.1 — normalize `category`, **fail loudly** on unseen values | `lib/taxonomy.ts` (`unseenCategories`) |
| §2.2 — `terms` filter, the repo isn't summer-only | `lib/taxonomy.ts`, FilterBar term row |
| §2.3 — drop `sponsorship`/`degrees` from the UI | not surfaced |
| §2.4 — adopt Simplify's location vocabulary; chips + type-ahead | `components/FilterBar.tsx`, `LocationTypeahead.tsx` |
| §2.5 — canonical enums | `lib/types.ts` |
| §3 — URL canonicalization by **allowlist**, not blocklist | `lib/canonical.ts` |
| §4.2 — the token set, verbatim | `app/globals.css` |
| §5.1 — JobCard: decay rail + redundant age text + one link/tab stop | `components/JobCard.tsx`, `lib/age.ts` |
| §5.1 — company mark: monogram, logo layered over it when configured | `components/CompanyMark.tsx`, `lib/logo.ts` |
| §5.1 — grid depth: 120-card window, `?n=` grows it, `content-visibility` below the fold | `app/page.tsx`, `lib/url.ts`, `app/globals.css` |
| §5.2 — Chip with mandatory server-side counts, zero-count disabled | `components/Chip.tsx`, `lib/filter.ts` |
| §5.3 — SystemBanner (stale / partial / empty), not dismissible | `components/SystemBanner.tsx` |
| §5.4 — FilterBar, narrowest-to-widest, state in URL params | `components/FilterBar.tsx`, `lib/url.ts` |
| §5.4 — search as a plain GET form (no client island), Remote-only chip, density control | `components/SearchBox.tsx`, `components/FilterBar.tsx`, `app/page.tsx` |
| §5.1 — skeleton shown only when the feed is cold, never on a warm 30ms render | `components/BoardSkeleton.tsx`, `lib/ingest.ts` (`isFeedFresh`) |
| §5.5 — EmptyState names the specific filters | `components/EmptyState.tsx` |
| §5.6 — StatusPage reads fetch runs | `app/status/page.tsx` |

## Decisions taken from §8's open questions

- **Active-only ingestion** (Q1). We don't store the ~90% dead rows; history
  accrues from the first fetch forward.
- **Unclassified tab is present but empty in v1** (Q2). Both feeds carry a
  trustworthy `type` from their repo of origin, so nothing is `unknown` yet. The
  tab, the classifier (`lib/classify.ts`), and the dashed-rail card variant are
  all wired up for when the ATS freshness layer lands — that's where `unknown`
  rows appear, surfaced rather than hidden.
- **`--age-4` is visually identical to `--rule`** (Q3), by design: a two-week-old
  posting has no signal left, so old cards read as unrailed.

## Stack

Next.js 15 (App Router, Server Components) · React 19 · TypeScript. No client
state beyond the location type-ahead island; filters are URL search params, so
links are shareable and back/forward just works.
