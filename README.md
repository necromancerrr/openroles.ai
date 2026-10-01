# openroles

An internship & new-grad job board built to the **Grove & Sky** design system
(`internship-tracker-design-system.md` §4, v2 — the data design in §1–3 is
unchanged from v1 "Ledger"). A scanning surface used daily under time pressure:
the subject isn't "jobs," it's *windows closing*. So **age is the primary visual
variable** — a baby-blue freshness rail on each card's leading edge that settles
into earth tones as a posting ages — and **every color has exactly one job**:
baby blue is *new*, tan is *pay*, rust is *caution*, olive is *taxonomy and good
news*, forest is ink, cream is paper. Liquid-glass chrome, solid cards, light
and dark themes, and motion that's all CSS but one small client island.

Live at **https://openroles-ai.vercel.app**. It merges five public job feeds
into one board, normalizes them into one taxonomy, dedups across them, and
renders the board as a Server Component with every filter in the URL.

## What a reader gets

- **Newest first, age as color.** The rail runs vivid sky → baby blue → pale
  sky → olive mist → hairline as a posting ages; `NEW` marks the last 24 hours
  (§4.1, §5.1).
- **⌘K / Ctrl+K palette.** Search every role as you type (it reads
  `/api/jobs`), or jump to any view — a tab, the campus view, remote, visa,
  new since your last visit, density, theme, status, RSS for this view.
- **Light and dark.** Follows the system until you choose; the choice is stored
  in the browser and applied by a blocking inline script, so there's no flash
  (`lib/theme.ts`).
- **What's new since your last visit.** A returning reader sees one line — *"51
  new internship postings since your last visit, 20h ago"* — instead of the
  introduction, a rule across the grid where "new" ends, and a *Show only these*
  toggle (`?new=1`). One first-party cookie holds two timestamps; see
  `lib/visit.ts`.
- **Opened memory.** Cards you've opened are marked like read mail, with *Hide
  opened* to clear them away. Stored in the browser only (localStorage), keyed by
  canonical URL so it survives feed refreshes (`components/BoardMemory.tsx`).
- **Pay and visa sponsorship on the card**, when a source states them — pay on
  ~1,300 postings, sponsorship on ~330. *I need sponsorship* (`?visa=1`) hides
  postings that say they won't sponsor or require US citizenship; postings that
  don't say stay, because silence isn't a "no".
- **UW launchpad** (`?campus=1`): the Seattle corridor — anchored to WA, so
  Bellevue, NE and Kirkland, QC don't count — plus US-remote roles.
- **Keyboard:** `/` search, `j` / `k` move between cards, `Enter` opens.
- **Phone-first filters:** on a narrow screen the facet rows fold behind *More
  filters*, so the first job is one scroll away instead of three.
- **RSS for any view:** `/feed.xml` takes the board's own URL params, so
  "Seattle + remote Summer 2027 internships" is a feed you can put in a reader,
  Slack or Discord. **JSON for any view:** `/api/jobs` (same params, plus
  `limit` / `offset`).

## Sources

Declared in `lib/sources.ts`, one adapter per format. Measured 2026-09-29 —
the feeds turn over daily, so treat every count here as a snapshot:

| Source | Tier | Rows | Live | Added to board | Enriched |
|---|---|---|---|---|---|
| [`SimplifyJobs/Summer2027-Internships`](https://github.com/SimplifyJobs/Summer2027-Internships) | primary | 16,966 | 4,342 | 4,342 | — |
| [`SimplifyJobs/New-Grad-Positions`](https://github.com/SimplifyJobs/New-Grad-Positions) | primary | 19,669 | 2,994 | 2,993 | — |
| [`zshah101/…Tech-Internships`](https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships) (CSV) | secondary | 1,061 | 1,061 | 415 | 253 |
| [`WonOfAKind/New-Grad-And-Internships-2027`](https://github.com/WonOfAKind/New-Grad-And-Internships-2027) | secondary | 3,090 | 2,598 | 1,175 | 411 |
| [`vanshb03/Summer2027-Internships`](https://github.com/vanshb03/Summer2027-Internships) | secondary | 471 | 371 | *withheld* | — |

**8,925 postings** — 5,645 internships, 3,280 new grad. Simplify's repo was
renamed from `Summer2026-Internships`; the old URL still redirects, but the
canonical one is used so a future repo under the old name can't hijack it.

**Why these two were added.** Each was measured against Simplify before it went
in — a feed earns its place by what it adds, not what it repeats. zshah101
scrapes employer boards every 30 minutes and carries sponsorship, pay and exact
timestamps; WonOfAKind carries explicit new-grad/intern labels and ~1,000
mechanical, aerospace and manufacturing roles Simplify never lists (hence the
`engineering` category, *Other engineering* on screen). Together they add 25
postings from the last 24 hours to Simplify's 57, and 281 from the last week to
its 550. [ApplyGuy](https://github.com/ApplyGuy/2027-New-Grad-Jobs) was measured
and left out: its company names are derived from URL slugs
("Bristolmyerssquibb") and would read as broken on a card.

**Merging.** Declared order is priority: the first feed to list a posting owns
its fields, and a later feed listing it again can only fill gaps (pay,
sponsorship — the *Enriched* column). Primary rows dedup by canonical URL only.
Secondary rows also dedup on company + title + a shared place, because
scrapers reach the same posting through different URLs (a company's careers
page and its Greenhouse board). Canonical URLs now also collapse Lever
`/apply`, Ashby `/application`, Workday locale segments and requisition slugs,
and iCIMS / SmartRecruiters title slugs (`lib/canonical.ts`).

**Locations** from secondary feeds are mapped *into* Simplify's vocabulary
(§2.4): *"San Jose, California, United States of America"* → `San Jose, CA`,
*"USA LA Bossier City"* → `Bossier City, LA`, *"Remote (US)"* → `Remote in
USA`. 36% of their location strings matched Simplify's raw; 85.7% do after
`lib/location.ts`. The rest are correctly formatted towns Simplify doesn't list.

**Staleness.** A feed whose own newest update is more than three weeks old is
withheld: its "active" flags are no longer maintained, so it would be serving
closed postings. vanshb03 stopped updating on 2026-08-23 and is withheld today;
it comes back by itself the day it moves. `/status` shows every feed's last
update, newest posting, and the reason for anything withheld.

## How it serves

A request never waits on the network when there is anything to show:

1. **Build.** `prebuild` runs `npm run snapshot` — the same ingest code the
   server runs — and writes `.snapshot/feed.json` (~4.5 MB, gitignored).
   `next.config.mjs` traces it into every server function.
2. **Fresh instance.** Answers from the snapshot immediately (measured: 0.10s
   for the full board on a just-started server, vs. downloading ~45 MB first).
3. **Warm instance.** Answers from memory. Once the feed is an hour old, the
   next request is answered from it and the refresh runs *after* the response
   (`after()`), with every feed fetched in parallel under a 30s timeout.
4. **A feed fails.** Its postings from the last good run stay on the board, the
   banner says so, and the next attempt comes in 5 minutes instead of 60.

Only a process with no snapshot and no cache — `next dev` before any build —
blocks, behind the board skeleton.

## Run it

```bash
npm install
npm run snapshot   # optional: build .snapshot/feed.json so dev starts instantly
npm run dev        # http://localhost:3000

npm test           # node:test over lib/*.test.ts — ingest merge rules, dedup,
                   # locations, pay, visits, filters
npm run lint
npm run typecheck
```

If no feed is reachable the board falls back to a bundled sample fixture and
the SystemBanner says so in words.

Regenerate the verified-boards artifact from where the live postings actually
are (§7):

```bash
npm run ingest:sources   # writes sources.verified.json
```

## Deploying

Vercel project `openroles-ai`. `npm run build` runs `prebuild` first (snapshot,
then logos), so every deploy ships current data and artwork; neither step can
fail a deploy. The repository's default branch is the production branch.

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
artifact, depend on nobody at render time. It reads the postings from the board's
own snapshot — every source, already deduped, so logos follow the source list
without a copy of it (1,847 domains on 2026-09-29) — ranks domains by how many
postings ride on each — so a bounded run covers the most cards rather than an
arbitrary slice of the alphabet — fetches each company's own favicon, writes
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
| §1 finding 1 — filter `active && is_visible` at parse time | `lib/sources.ts` (each adapter keeps only what its feed calls live) |
| §1 finding 4 — aggregator is primary, scraped feeds are the freshness layer | `lib/sources.ts` (primary / secondary tiers), `lib/ingest.ts` (merge) |
| §1 finding 5 — internship classifier only, never a new-grad one | `lib/classify.ts` (type comes from repo-of-origin here) |
| addendum §5 — eval harness on the labeled feeds, recorded and re-runnable | `scripts/eval-classifier.ts`, `eval/type-classifier.json` |
| §7 pattern — work the mapping out once, check the table in | `lib/logo-overrides.ts`, `scripts/audit-logo-domains.ts` |
| §7 pattern — fetch logos once offline, serve them from our own origin | `scripts/fetch-logos.ts`, `lib/logo-manifest.ts` |
| §2.1 — normalize `category`, **fail loudly** on unseen values | `lib/taxonomy.ts` (`unseenCategories`) |
| §2.2 — `terms` parsed not table-mapped, ordered by start date, open terms first | `lib/taxonomy.ts` (`parseTerm`, `termChipOrder`, `primaryTerm`) |
| §2.3 — drop `sponsorship`/`degrees` from the UI | `degrees` still not surfaced; **sponsorship reinstated** now that feeds state it on ~330 rows — tag on the card, `?visa=1` filter |
| §2.4 — adopt Simplify's location vocabulary; chips + type-ahead | `lib/location.ts` maps other feeds into it; `components/FilterBar.tsx`, `LocationTypeahead.tsx` |
| §2.5 — canonical enums | `lib/types.ts` |
| §3 — URL canonicalization by **allowlist**, not blocklist; two-layer dedup | `lib/canonical.ts` (+ per-ATS path rules), `lib/ingest.ts` (company + title + place) |
| §4.2 — the token set, verbatim | `app/globals.css` |
| §5.1 — JobCard: decay rail + redundant age text + one link/tab stop | `components/JobCard.tsx`, `lib/age.ts` |
| §5.1 — company mark: monogram, logo layered over it when configured | `components/CompanyMark.tsx`, `lib/logo.ts` |
| §5.1 — grid depth: 120-card window, `?n=` grows it, `content-visibility` below the fold | `app/page.tsx`, `lib/url.ts`, `app/globals.css` |
| §5.2 — Chip with mandatory server-side counts, zero-count disabled | `components/Chip.tsx`, `lib/filter.ts` |
| §5.3 — SystemBanner (stale / partial / empty / sample), not dismissible | `components/SystemBanner.tsx` |
| §5.4 — FilterBar, narrowest-to-widest, state in URL params | `components/FilterBar.tsx`, `lib/url.ts` |
| §5.4 — search as a plain GET form (no client island), Remote-only chip, density control | `components/SearchBox.tsx`, `components/FilterBar.tsx`, `app/page.tsx` |
| §5.1 — skeleton only when there's truly nothing to show; build snapshot + refresh after response | `components/BoardSkeleton.tsx`, `lib/ingest.ts` (`hasFeed`, `getFeed`), `scripts/build-snapshot.ts` |
| §5.5 — EmptyState names the specific filters | `components/EmptyState.tsx` |
| §5.6 — StatusPage reads fetch runs, per-feed freshness, withheld feeds and why | `app/status/page.tsx` |
| §4.1 — "what's new since yesterday", per reader | `lib/visit.ts`, `app/page.tsx` (welcome line, grid rule), `components/BoardMemory.tsx` |

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

Next.js 16 (App Router, Server Components) · React 19 · TypeScript. Two small
client islands — the location type-ahead and `BoardMemory` (visit cookie,
opened memory, keyboard) — and nothing else; filters are URL search params, so
links are shareable and back/forward just works. Fonts are self-hosted
(`@fontsource-variable`); note the packages register their families with a
`Variable` suffix, which the tokens in `app/globals.css` must name.
