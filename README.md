# openroles

An internship & new-grad job board built to the **Ledger** design system
(`internship-tracker-design-system.md`, v1). A scanning surface used daily under
time pressure: the subject isn't "jobs," it's *windows closing*. So **age is the
primary visual variable, and it's the only thing in the interface that gets
color** — the decay rail on each card's leading edge.

The app ingests three live aggregator feeds, normalizes them into one canonical
taxonomy, dedups by canonical URL, and renders the board as a Server Component
with all filter state in the URL.

Measured 2026-08-03 — the feeds turn over daily, so treat every count in this
README as a snapshot, not a constant:

| Source | Type | Active | Inserted after dedup |
|---|---|---|---|
| `SimplifyJobs/Summer2026-Internships` | internship | 1,451 | 1,451 |
| `SimplifyJobs/New-Grad-Positions` | new grad | 2,492 | 2,492 |
| `vanshb03/Summer2026-Internships` | internship | 248 | 222 |

The third feed was added because it measurably differs rather than duplicates:
222 of its 248 active rows aren't in the SimplifyJobs internship feed, and 40%
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

The first request downloads all three `listings.json` files (~1.6 MB gzipped,
~23 MB decoded), filters to
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

There are two ways to get a real logo into that box, and the first needs no logo
provider at all.

### 1. Fetch once, serve them yourself (no provider)

```bash
npm run fetch:logos            # each company's own /favicon.ico
npm run fetch:logos -- --top=600
```

This is the §7 pattern applied to images: do the work ahead of time, keep the
artifact, depend on nobody at render time. It ranks domains by how many postings
ride on each — so a bounded run covers the most cards rather than an arbitrary
slice of the alphabet — fetches each company's own favicon, writes
`public/logos/<domain>.<ext>`, and regenerates `lib/logo-manifest.ts`. After that
the cards load logos from **this app's own origin**: no third-party request when a
card paints, nothing to rate-limit, nothing that can start returning a globe or
disappear next quarter.

It refuses three things that would otherwise end up on a card: non-images (an HTML
error page served with a 200), bodies under 100 bytes, and any image returned for
three or more different domains, which is a source's placeholder rather than
anyone's logo.

`--from='…{domain}…'` pulls from somewhere else instead — including a provider,
once — because the point isn't where the bytes come from, it's that they end up
as files you serve.

**On Vercel this runs itself.** `fetch:logos` is wired as npm's `prebuild`, so
`npm run build` — which is what Vercel runs — fetches the logos into `public/`
before Next builds, and they ship with the deployment. Every deploy gets current
artwork and the repo carries no binaries. Drop the `prebuild` line and commit
`public/logos/` instead if you'd rather pay that cost once.

The run is capped by `--budget=SECONDS` (300 in `prebuild`), because an
unreachable host costs a full timeout and a thousand of them add up to more than
a build should wait. Whatever has been fetched when the budget expires is what
gets written, so the cap trades tail coverage for a predictable build. If the log
says `budget of 300s reached`, later domains were skipped — raise it.

Either way the build cannot be taken down by this: a fetch that returns nothing
usable leaves the existing manifest alone rather than wiping it, and feeds it
can't read are a warning, not an error. Verified by building with outbound
network blocked — 399 of 400 fetches failed and the build still completed.

The repo ships with an empty manifest and no `public/logos/`, because these are
other companies' trademarks fetched from their own sites: that fetch belongs to
whoever deploys this, not to the repo.

### 2. Point at a logo provider

`{domain}` is required, `{size}` is filled in with 64 (the mark is a 28px box, so
64px covers a 2× screen):

```bash
LOGO_URL_TEMPLATE='https://logo.example.com/{domain}?size={size}' npm run dev
```

A locally stored logo always wins over the template, so the two can coexist: fetch
what you can, let a provider cover the rest.

A logo that 404s, is blocked, or never resolves paints nothing and the monogram
stays. That fallback is a CSS background layer rather than an `<img>`, which is
what makes it work with no client JS — a broken `<img>` draws the browser's
broken-image icon instead, and `<object>` fallback content proved unreliable.
Both were tested before settling on this.

**The limit on real logos is domain accuracy, not the provider.** The employer
domain is resolved at ingest (`lib/logo.ts`), override first, then derivation:

- **`lib/logo-overrides.ts`** — a checked-in table for the cases derivation
  cannot get right: careers sites that are their own brand (`lifeattiktok.com` is
  not TikTok's domain), ATS routing words that aren't a company (`.../embed/...`),
  and universities and national labs, which a `.com`-from-a-slug fallback can
  never reach (`psu.edu`, `anl.gov`, `llnl.gov`).
- **Derivation** handles the rest: company-owned hosts are exact
  (`jobs.careers.microsoft.com` → `microsoft.com`), ATS families are matched by
  suffix so regional variants work (`eu.lever.co`), locale and routing segments
  are skipped (`ats.rippling.com/en-GB/rippling/…` → `rippling.com`), and hosts
  that name the ATS rather than the employer resolve to nothing at all.

93.6% of postings resolve to a candidate domain. Which of them a given logo host
actually has is a different question, and a measurable one:

```bash
npm run audit:logos                     # ranking + coverage, no network

# measure a provider — --template beats LOGO_URL_TEMPLATE so two can be
# compared back to back without re-exporting anything
npm run audit:logos -- --probe --template='https://icons.duckduckgo.com/ip3/{domain}.ico'
npm run audit:logos -- --probe --template='https://img.logo.dev/{domain}?token=pk_…&size={size}'
```

`--probe` requests every distinct domain once and reports hit rate **weighted by
postings** — what a reader actually sees, not what a company list says — then
lists the biggest misses so the override table gets extended head-first.

It also hashes every response body, because the number that matters is not "did
it return 200". Some providers never 404: they answer with a **generic globe or
lettermark** for a domain they don't have, which paints on the card as a logo
that failed rather than a mark that was meant — strictly worse than the monogram
it covered up. An identical image returned for three or more different domains is
that provider's fallback, and the audit counts those as misses and says how many.

Two things to know when picking, both worth confirming with `--probe` rather than
taking on trust:

- **DuckDuckGo** (`icons.duckduckgo.com/ip3/{domain}.ico`) is free and keyless,
  which makes it the cheapest thing to try first. It serves favicons, so expect
  small, square, sometimes-cropped art rather than proper wordmarks.
- **Google's** `s2/favicons` endpoint returns a generic globe on a miss instead of
  a 404. That defeats the monogram fallback entirely — the placeholder detector
  above exists partly because of this shape of provider.
- **logo.dev** needs a publishable token and returns real logo artwork at a
  requested size; `{size}` is filled with 64.

## Eval harness — how much of the board can be typed from a title?

The two feeds are free labeled ground truth: repo of origin *is* the correct
answer for every active row — 3,943 of them on 2026-08-03. That makes the
central question measurable rather
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
| `keyword-strict` — positive evidence only (what ships) | 88.2% | 16.6% | 56.9% | 0.1% |
| `keyword-broad` — absence of seniority counts as new-grad | 88.2% | 94.1% | 3.9% | 4.3% |

Read those two rows together and the case for reading the **description** rather
than the title writes itself. Strict hides more than half the board. Broad buys
that back by guessing, and pays for it by labelling **11.6% of internships as
new-grad** — postings sent to the wrong tab. One error costs a reader a glance;
the other costs an application. Neither rule is good enough, and no title-only
rule will be, because the eligibility signal isn't in the title.

A 300-row stratified sample lands within ~4pp of the full-feed figure, which is
the useful fact for a classifier that bills per row: 300 rows is enough to decide
with. The full feed is the default only because a regex costs nothing to run
four thousand times.

`eval/type-classifier.json` holds the recorded numbers and a re-run compares
against it at ±2pp. The baseline also fingerprints the exact rows it scored,
because feed churn alone moved internship recall **+6pp in one week** with no
code change — so a re-run fails only when the rows are identical and the numbers
moved (a rule regression), and otherwise reports the movement as what it is. A
check that cries wolf on data drift is a check people learn to ignore. Adding a
model-backed classifier means adding one entry to `CLASSIFIERS` in
`scripts/eval-classifier.ts`, not rewriting the harness.

Two honest caveats. Simplify's labels are themselves imperfect. And **the design
doc's 29.5% new-grad figure did not reproduce**: a strict positive-evidence rule
measures 16.6%, and no keyword set gets near 29.5% without switching to negative
evidence, which scores 94.1% by guessing. The doc's *conclusion* — internship
classifier only, surface `unknown` — is what the numbers support; its percentage
isn't one this harness can confirm.

## How it maps to the design doc

| Design doc | Where it lives |
|---|---|
| §1 finding 1 — filter `active && is_visible` at parse time | `lib/ingest.ts` |
| §1 finding 4 — aggregator is primary, ATS is the freshness layer | `lib/ingest.ts`, host buckets in `lib/canonical.ts` |
| §1 finding 5 — internship classifier only, never a new-grad one | `lib/classify.ts` (type comes from repo-of-origin here) |
| addendum §5 — eval harness on the labeled feeds, recorded and re-runnable | `scripts/eval-classifier.ts`, `eval/type-classifier.json` |
| §7 pattern — work the mapping out once, check the table in | `lib/logo-overrides.ts`, `scripts/audit-logo-domains.ts` |
| §7 pattern — fetch logos once offline, serve them from our own origin | `scripts/fetch-logos.ts`, `lib/logo-manifest.ts` |
| §2.1 — normalize `category`, **fail loudly** on unseen values | `lib/taxonomy.ts` (`unseenCategories`) |
| §2.2 — `terms` parsed not table-mapped, ordered by start date, open terms first | `lib/taxonomy.ts` (`parseTerm`, `termChipOrder`, `primaryTerm`) |
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
