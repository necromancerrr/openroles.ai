# Internship Tracker — Design System v1 ("Ledger")

Companion to `internship-tracker-design.md` (v2). That doc reasoned about the data from
documentation. This one is built on **the actual data, downloaded and profiled**. Several
of v2's decisions turn out to be wrong, and they're corrected here in §6.

Two artifacts ship with this doc:
- `sources.verified.json` — 165 real, currently-publishing ATS boards with verified slugs
- this document — the data taxonomy, visual tokens, and component specs

---

## 1. Ground truth — the real source, profiled

Pulled live on 2026-07-22 from both SimplifyJobs repos:

```
https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json   → 11.1 MB, 14,859 rows
https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json       → 11.9 MB, 17,501 rows
```

| Measure | Internships | New-grad |
|---|---|---|
| Total rows | 14,859 | 17,501 |
| `active: true` | **1,505 (10.1%)** | **2,796 (16.0%)** |
| `active` + `is_visible` | 1,499 | 2,774 |
| Distinct companies (active) | 610 | 1,150 |
| Distinct locations (active) | 383 | 700 |
| `date_posted` range | 2025-11-25 → 2026-07-22 | 2025-11-25 → 2026-07-22 |

### The five findings that change the design

**1. 90% of the file is dead.** You are downloading 23MB to get ~4,300 live postings.
Filter on `active && is_visible` *at parse time*, before touching the database. If you
store the inactive rows too, that's ~28,000 rows of history you didn't ask for and that
Simplify already threw away once — note the `date_posted` floor of 2025-11-25, which means
**the repo itself only keeps ~8 months.** v2's claim that soft-delete preserves history is
only true going forward from your own first fetch, not retroactively.

**2. The real record has fields the documentation doesn't mention.** Live shape:

```json
{
  "source": "Simplify",
  "category": "AI/ML/Data",
  "company_name": "Veolia",
  "id": "a2dd8509-bdcc-4c2e-8776-96b2d35306a1",
  "title": "Engineering Instrumentation Intern",
  "active": false,
  "terms": ["Winter 2025"],
  "date_updated": 1764001968,
  "date_posted": 1764001968,
  "url": "https://jobs.smartrecruiters.com/VeoliaEnvironnementSA/744000095130105",
  "locations": ["Caddo Valley, AR"],
  "company_url": "https://simplify.jobs/c/Veolia",
  "is_visible": true,
  "sponsorship": "Other",
  "degrees": []
}
```

`category`, `sponsorship`, `degrees`, and `company_url` are all undocumented in
CONTRIBUTING.md and all present on 100% of rows. `terms` exists on the internship repo
and **not at all** on the new-grad repo.

**3. `locations` is an array, and v2's schema is wrong.** The v2 doc has a single
`location_raw text` column. Reality: 1,325 of 1,499 active internships have one location,
but 174 have more — **up to 51 on a single row.** A scalar column silently truncates.

**4. The three ATS adapters cover about a third of the market.** Host distribution across
active internships:

| Host | Count | Note |
|---|---|---|
| `job-boards.greenhouse.io` | 178 | **The current Greenhouse host** |
| `jobs.ashbyhq.com` | 158 | |
| `jobs.lever.co` | 88 | |
| `www.tesla.com` | 71 | own careers site |
| `jobs.smartrecruiters.com` | 62 | not in v2's plan |
| `lifeattiktok.com` + `jobs.bytedance.com` | 117 | own |
| `boards.greenhouse.io` | 42 | **legacy host, still in use** |
| `*.myworkdayjobs.com` | ~150 across tenants | not in v2's plan |

Greenhouse + Ashby + Lever = 466 of 1,499, or **31%**. Workday and SmartRecruiters
together are comparable in size and neither has a workable public feed. So the honest
framing is: *the aggregator repo is the primary source and the ATS feeds are the
freshness layer on top of it* — the reverse of how v2 ranked them.

Also note the host split: Greenhouse has migrated to `job-boards.greenhouse.io` and both
hosts are live. Any URL-matching you write must accept both, plus `job-boards.eu.greenhouse.io`.

**5. Title-based type classification does not work for new-grad.** Tested a keyword
classifier against ground truth (repo-of-origin = the label), on active rows:

| Repo | Correct | Unknown | Wrong |
|---|---|---|---|
| Internships | **80.1%** | 15.1% | 4.8% |
| New-grad | **29.5%** | 70.4% | 0.1% |

Internship titles announce themselves ("Intern", "Co-op", "Summer Analyst"). New-grad
titles are just *"Software Engineer"*, *"Firmware Engineer"*, *"Data Engineer"* — there is
nothing in the string to match on. v2's A3 decision (infer from title, bucket the rest as
`unknown`) would put **70% of ATS new-grad roles into `unknown`**, and `unknown` is
excluded from the default view, so they'd be invisible.

**Revised decision:** `type` is only trustworthy when it comes from the source.
- Aggregator rows → `type_conf = 'source'`, from repo of origin.
- ATS rows → run the internship classifier only. A hit gives `type = 'internship'`,
  `type_conf = 'inferred'`. **A miss gives `type = 'unknown'`, and unknown ATS rows are
  shown in a distinct "Unclassified" tab rather than hidden.** Hiding them loses most of
  the new-grad market. Do not attempt a new-grad classifier; it is not solvable from the
  title.

---

## 2. Data design system — canonical taxonomy

Before any pixels: the source data has the exact problem a design system audit looks for —
**the same concept under multiple names.** This is a naming-consistency audit of the feed.

### 2.1 `category` — five duplicate pairs in live data

| Canonical | Live variants found | Rows (intern / new-grad) |
|---|---|---|
| `software` | `Software`, `Software Engineering` | 4,497 / 173 · 4,921 / 154 |
| `ai_data` | `AI/ML/Data`, `Data Science, AI & Machine Learning` | 6,424 / 104 · 4,858 / 35 |
| `hardware` | `Hardware`, `Hardware Engineering` | 2,297 / 5 · 4,029 |
| `product` | `Product`, `Product Management` | 1,000 / 1 · 1,011 / 1 |
| `quant` | `Quant`, `Quantitative Finance` | 353 / 5 · 2,486 / 5 |
| `other` | `Other` | 1 |

The long forms are legacy rows the maintainers never migrated. Normalize on ingest with an
explicit map — and make the map **fail loudly on an unseen value** rather than defaulting
to `other`, so a new category shows up in your logs instead of vanishing into a bucket.

### 2.2 `terms` — the repo is not summer-only

| Term | Active internship rows |
|---|---|
| Summer 2026 | 9,408 |
| N/A | 1,436 |
| Fall 2026 | 1,322 |
| Spring 2026 | 1,203 |
| Summer 2026 + Fall 2026 | 219 |
| Summer 2027 | 208 |
| Winter 2026 / Winter 2025 | 228 |

Despite being called `Summer2026-Internships`, roughly a third of rows are off-season.
`terms` is an array. Store it as `text[]` and expose it as a filter — this is the single
most useful filter on the board and neither the v1 spec nor v2 has it.

### 2.3 Fields to drop

- **`sponsorship`** — 98.9% of rows say `"Other"`. Four distinct values total. It carries
  no information; do not build a filter for it. (Ironically the one thing an international
  student would most want to filter on.)
- **`degrees`** — empty on 30% of rows, and `Bachelor's` on nearly all the rest. Store it,
  don't surface it.

### 2.4 Location vocabulary — use Simplify's, don't invent one

v2 assumed location would be a free-text disaster requiring a text search box. The real
data is **already normalized by Simplify** into a compact vocabulary: `NYC`, `SF`,
`Seattle, WA`, `Remote in USA`, `London, UK`, `Toronto, ON, Canada`, `United States`.
383 distinct values across 1,499 active internships, with a long tail but a very dense head.

**Revised decision:** adopt Simplify's strings as the canonical location vocabulary and
map ATS raw locations *into* it, rather than storing everything raw and searching text.
Top 30 values cover most of the volume, so a chip row of the top locations plus a
type-ahead for the tail is achievable in v1 — better than v2's "text box only."

Note their abbreviations are non-obvious (`NYC` not `New York, NY`; `SF` not
`San Francisco, CA`) and `Remote in USA` is a location, not a boolean. Derive `is_remote`
from the string; don't replace it.

### 2.5 Canonical enums

```ts
type Category = 'software' | 'ai_data' | 'hardware' | 'product' | 'quant' | 'other';
type JobType  = 'internship' | 'new_grad' | 'unknown';
type TypeConf = 'source' | 'inferred';
type Term     = 'summer_2026' | 'fall_2026' | 'spring_2026' | 'winter_2026'
              | 'summer_2027' | 'unspecified';
```

---

## 3. URL canonicalization — v2's rule would corrupt data

v2 said: build `canonical_key` by stripping query params. **Do not do this.** In live data,
query params on active rows:

| Param | Occurrences | Meaning |
|---|---|---|
| `gh_jid` | **190** | **the Greenhouse job ID** — the entire identity of the posting |
| `mobile` / `needsRedirect` | 154 / 154 | noise |
| `embed` | 137 | noise |
| `ats` | 85 | noise |
| `token` | 39 | identity (Greenhouse embed) |
| `icims` | 25 | identity |
| `job`, `id`, `siteid` | 10 / 4 / 2 | identity |

Stripping blindly collapses every Greenhouse-on-own-domain posting at a company down to
one row — 190 postings would become a handful.

**Rule:** allowlist, don't blocklist.

```
canonical_key(url):
  lowercase host; strip 'www.'
  strip trailing slash and fragment
  KEEP query params in {gh_jid, token, jobId, job, id, icims, siteid, req, requisitionId}
  DROP everything else
  sort the kept params by key
```

Dedup is worth doing — even within one repo there are duplicate URLs (31 extra internship
rows, 72 extra new-grad rows across 22 URLs), and 8 postings appear in **both** repos with
different UUIDs. So v2's two-layer approach is right; only the normalization rule was wrong.

Slug extraction has its own traps found in the data:
- `boards.greenhouse.io/embed/job_app?token=…` — path segment 0 is `embed`, not a company.
  Blocklist `embed`, `agency`, `job_app`, `jobs`.
- Ashby slugs are **case-sensitive** (`Etched`, `AfterQuery`) and may contain dots (`rivianvw.tech`).
- Slug ≠ company (`drweng` = DRW, `plus-2` = PlusAI, `fiveringsllc` = Five Rings).

---

## 4. Visual system

### 4.1 Direction

The product is a **scanning surface used daily under time pressure**. Its subject matter
is not "jobs," it's *windows closing* — every row is a thing that was open and will stop
being open, and the only question the user asks in the first two seconds is "what's new
since yesterday." So: **age is the primary visual variable, and it is the only thing in
the interface that gets color.**

**Signature: the decay rail.** Every card carries a 3px vertical bar on its leading edge
whose chroma is a function of `first_seen_at`. Fresh postings are saturated; the color
drains as the posting ages until the rail is a hairline neutral. The grid then reads as a
column of signal without a single badge being parsed. Everything else in the UI —
type, chrome, chips, buttons — is neutral. One accessory, worn deliberately.

Green rather than an alert color, because a live posting is an *open* thing, not an urgent
one; the semantics of the decay run open → closing → gone. Amber appears in exactly one
place (the stale-data banner) and nowhere else, so it always means "the system is unwell,"
never "this job is old."

### 4.2 Tokens

```css
:root {
  /* Neutrals — cool paper, ink with a green undertone so it sits with the signal hue */
  --paper:        #F4F5F3;
  --surface:      #FFFFFF;
  --ink:          #101413;
  --ink-2:        #46504C;   /* secondary text */
  --ink-3:        #79837E;   /* tertiary / metadata */
  --rule:         #DDE1DE;
  --rule-strong:  #C3C9C5;

  /* Decay ramp — the only chromatic scale in the system */
  --age-0:        #0E6B57;   /* < 6h   */
  --age-1:        #2E7D6B;   /* 6–24h  */
  --age-2:        #5A8A80;   /* 1–3d   */
  --age-3:        #8A9994;   /* 3–7d   */
  --age-4:        #C3C9C5;   /* > 7d — indistinguishable from a rule */

  /* System state — used only by SystemBanner */
  --warn:         #8A5A12;
  --warn-bg:      #FBF3E2;

  /* Type */
  --font-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --font-ui:      'Instrument Sans', system-ui, sans-serif;
  --font-data:    'JetBrains Mono', ui-monospace, monospace;

  --t-display:    clamp(1.75rem, 1.2rem + 2vw, 2.5rem);  /* wordmark, page title */
  --t-title:      1.0625rem;   /* job title — the only 17px in the system */
  --t-body:       0.9375rem;
  --t-meta:       0.8125rem;   /* always --font-data */
  --t-micro:      0.6875rem;   /* eyebrow, uppercase, 0.08em tracking */

  /* Space — 4px base, only these steps */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px;

  /* Border + elevation */
  --r-sm: 3px; --r-md: 6px;
  --rail-w: 3px;
  --shadow-card: none;                 /* cards are separated by rules, not shadows */
  --shadow-pop:  0 2px 12px rgb(16 20 19 / 0.10);

  /* Motion */
  --dur-fast: 120ms; --dur-base: 200ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
@media (prefers-reduced-motion: reduce) { :root { --dur-fast: 0ms; --dur-base: 0ms; } }
```

**Typographic rule that carries the system:** anything that is a *measurement* — age,
counts, dates, term labels, run status — is set in `--font-data`. Anything a human wrote —
company, title, location — is set in `--font-ui`. That single split does most of the
hierarchy work and means the grid stays legible at density without extra weight or color.

**Contrast floor:** `--ink-3` on `--paper` is the lightest permitted text pairing and
clears 4.5:1. The decay ramp is **never** used for text — only for the rail and 1px
strokes, both non-informational on their own (§5.1 covers the redundant text encoding).

---

## 5. Components

### 5.1 JobCard

The primary unit. Everything else exists to support it.

**Anatomy** (leading edge → trailing):
```
│▌│ EYEBROW · category · term            │
│▌│ ▣  Company                           │
│▌│    Job Title, wrapping to 2 lines    │
│▌│ Seattle, WA  +2   ·   3h ago         │
└─rail  └─ company mark
```

**Company mark.** A 28px square at the head of the card, so the grid can be scanned by
shape as well as by text. It is a **monogram by default** — `--ink-2` on `--paper`, in
`--font-data`, following whatever break the name itself offers (`Jane Street` → `JS`,
`TikTok` → `TT`, `IMC Trading` → `IMC`, `Google` → `G`). The real logo, when a deployment
configures a logo host, paints over the monogram; if it fails to load the monogram is what
remains. Never colored by the app: a vendor's logo is the one chromatic thing allowed in,
and it earns no meaning in the system — age is still the only variable that gets color.

| Property | Type | Default | Description |
|---|---|---|---|
| `job` | `Job` | — | normalized record |
| `density` | `'comfortable' \| 'compact'` | `comfortable` | compact drops the eyebrow |
| `showType` | `boolean` | `false` | true only in the Unclassified tab |

**Variants**

| Variant | Use when |
|---|---|
| Default | active posting |
| Unclassified | `type === 'unknown'` — rail renders as a dashed hairline, eyebrow reads `UNCLASSIFIED` |
| Inactive | posting has closed; card is 60% opacity, rail is `--age-4`, apply affordance removed |

**States**

| State | Visual | Behavior |
|---|---|---|
| Default | `--surface`, 1px `--rule` bottom border | — |
| Hover | background lifts to `#FFF`, rail widens 3px → 5px over `--dur-fast` | cursor pointer |
| Focus-visible | 2px `--ink` outline, 2px offset | full card is one tab stop |
| Pressed | translateY(1px) | — |
| Loading | skeleton: three rules at 40%/70%/55% width, no shimmer | `aria-busy="true"` |

**Where the skeleton actually shows.** It's the Suspense fallback for the board, applied
*only* when the feed isn't already in memory — a cold request has ~23MB of source JSON to
download and would otherwise paint a blank tab, while a warm one answers in ~30ms and must
render in a single flush. React streams a fallback even when the child resolves in
milliseconds, so making the boundary unconditional would flash a skeleton on every filter
click. A loading state that appears when there is no wait is worse than none.

**Card separation.** Cards carry a 1px `--rule` border with the trailing edge pulled back
1px over the neighbour, so shared edges collapse to a single hairline. Don't reach for the
usual trick of a rule-colored grid background showing through 1px gaps: it also paints the
*empty* cells of the last row, so a result set of one renders a card beside a grey slab.

**Age encoding — and its redundancy requirement.** The rail is decorative reinforcement,
never the sole carrier. Age is *always* also present as text (`3h ago`) in `--font-data`,
and the `<time>` element carries a machine-readable `datetime`. A colorblind or
screen-reader user loses nothing.

| Age | Rail token | Text |
|---|---|---|
| < 6h | `--age-0` | `2h ago` + `NEW` micro-label |
| 6–24h | `--age-1` | `14h ago` + `NEW` |
| 1–3d | `--age-2` | `2d ago` |
| 3–7d | `--age-3` | `5d ago` |
| > 7d | `--age-4` | `Mar 3` (switches to absolute — relative time stops being useful past a week) |

The `NEW` label is suppressed for `is_backfill` rows (v2 §A1 — still correct).

**Multi-location display.** Since `locations` is an array (up to 51 — §1.3): render the
first location, then `+N` in `--ink-3`. The `+N` is not interactive on the card; the full
list lives on the detail page. Never render more than one location inline — a card showing
eight cities is unreadable and the outliers are almost always big-corp postings that would
dominate the grid.

**Accessibility**
- **Role:** the card is an `<a>` wrapping an `<article>`. One link, one tab stop. Never a `<div onClick>`.
- **Keyboard:** Tab to focus, Enter to open. No custom key handling.
- **Screen reader:** announced as *"{Title}, {Company}, {Location}, posted {relative time}, link."* The rail is `aria-hidden`.

| ✅ Do | ❌ Don't |
|---|---|
| Lead with company — it's what people filter on mentally | Put a description snippet on the card; every feed opens with boilerplate |
| Keep title to two lines with `line-clamp` | Let a 90-character title reflow the grid |
| Use `--font-data` for the age | Use color alone to signal freshness |
| Give the mark a fixed box so a late logo can't reflow the grid | Ship a logo `<img>` with no fallback — a broken one draws the browser's broken-image icon |

**Grid depth.** The board is 1.4k+ postings deep and the result set is a scanning surface,
not an archive: render a window of 120 cards and grow it in place via `?n=` (server-rendered,
in the URL, reset whenever a filter changes). Cards below the fold are
`content-visibility: auto` with the median card height reserved, so the browser skips their
layout and paint — and skips fetching their logos — until they scroll in.

### 5.2 Chip (filter control)

| Property | Type | Default |
|---|---|---|
| `label` | `string` | — |
| `count` | `number \| undefined` | — |
| `selected` | `boolean` | `false` |
| `disabled` | `boolean` | `false` (true when count is 0) |

Variants: `type`, `category`, `term`, `location`. All render identically — the grouping is
semantic, not visual, so the filter bar reads as one vocabulary.

| State | Visual |
|---|---|
| Default | 1px `--rule`, transparent fill, `--ink-2` |
| Hover | border → `--rule-strong` |
| Selected | fill `--ink`, text `--paper`, no border |
| Disabled | `--ink-3` at 50%, `cursor: not-allowed`, still announced |

**Counts are not optional.** Every chip shows its result count, computed server-side from
the current filter state. A chip that leads to zero results is disabled *before* the user
clicks it — that removes the most common dead end in filtered lists.

**Accessibility:** rendered as `<input type="checkbox">` + `<label>`, visually restyled.
Real checkbox semantics, real keyboard behavior, works with filters serialized to URL
search params. Group wrapped in `<fieldset>` with a visually-hidden `<legend>`.

### 5.3 SystemBanner

The component v2 identified as necessary but didn't specify. One instance, above the grid.

| Variant | Trigger | Copy |
|---|---|---|
| `stale` | newest `fetch_runs` row > 3h old | "Last checked {n} hours ago. New postings may be missing." |
| `partial` | any source in the last run has status `failed` or `skipped` | "Couldn't reach {n} of {m} sources. Showing everything else." |
| `empty` | zero rows in `jobs` | "No postings yet — the fetcher hasn't run." |

Tokens: `--warn-bg` fill, `--warn` text, no icon, no dismiss control. **Not dismissible on
purpose** — it's a statement of data quality, and a user who dismisses it is a user
looking at silently stale data. `role="status"`, `aria-live="polite"`.

Copy rule: state what happened and what it means for the data on screen. No apology, no
"Oops," no exclamation mark. The banner is the interface talking about itself.

### 5.4 FilterBar (pattern)

Filters live in URL search params (`/?type=internship&term=summer_2026&loc=seattle-wa`)
so the page stays a Server Component, links are shareable, and back/forward works.

Order, top to bottom — widest net first, then narrowest-to-widest by how often it's used:
0. **Search** — free text over company + title, every word required (AND)
1. **Type** — segmented: Internships · New grad · Unclassified
2. **Term** — chips, internships only (the new-grad repo has no `terms`, so this row disappears entirely for that tab rather than rendering disabled)
3. **Category** — chips, six canonical values
4. **Location** — a `Remote only` chip on the derived `isRemote` flag, then top ~12 location chips + type-ahead for the tail

Active filters render as removable chips in a summary row with one **Clear all**. That row
is also what the empty state points at, and the empty state quotes the query back.

**Search is a plain GET `<form action="/">`.** Submitting navigates to `/?q=…`, which keeps
search on exactly the same footing as every other filter — server-rendered, shareable, no
client island, no debounce to tune. Every other active param rides along as a hidden input.
It counts like a filter, too: a query narrows the facet counts, and chips it zeroes out go
disabled (§5.2) rather than lying.

**Density.** `comfortable | compact` is a two-item segmented control in the grid header, not
a filter — it changes presentation only, so it is the one control that does *not* reset the
`?n=` window a reader has scrolled open.

### 5.5 EmptyState

| Context | Copy | Action |
|---|---|---|
| Filters returned nothing | "No {type} postings match these filters." | Show the active filters inline, each individually removable, plus Clear all |
| Table is empty | "No postings yet. The fetcher hasn't completed a run." | Link to `/status` |
| Source down | Handled by SystemBanner, not here | — |

An empty screen is an invitation to act — always name the specific filters that caused it,
never a generic "no results found."

### 5.6 StatusPage (`/status`)

Not a nice-to-have. It's the only view that answers "is this thing working," which you'll
ask more than any other question after week one. Reads `fetch_runs` directly.

One row per source: name · last run · status · fetched / inserted / updated / deactivated ·
error. All numeric columns in `--font-data`, right-aligned. Status as a text word
(`ok` / `failed` / `skipped`), not a colored dot.

This is also the endpoint the GitHub Actions health check hits.

---

## 6. Corrections to design doc v2

| v2 said | Live data says | Fix |
|---|---|---|
| `location_raw text` (scalar) | `locations` is an array, up to 51 entries | `text[]`, or a `job_locations` join table |
| Location is a free-text disaster; ship a text box | Simplify already normalizes to ~383 values with a dense head | Adopt their vocabulary; chips + type-ahead |
| Strip query params for `canonical_key` | `gh_jid` (190 uses) *is* the job identity | Allowlist ID params, drop the rest |
| Infer `type` from title, hide `unknown` | New-grad classification is 29.5% accurate; 70% would be hidden | Internship classifier only; surface `unknown` in its own tab |
| Three ATS feeds are the primary source | They cover 31% of active postings | Aggregator repo is primary; ATS feeds are the freshness layer |
| Soft-delete preserves history | Source only retains ~8 months | True going forward only — say so |
| No mention of `terms` | A third of the "Summer 2026" repo is off-season | Add `terms text[]` + a filter |
| No mention of `category` | Present on 100% of rows, with 5 duplicate-name pairs | Normalize on ingest, fail loudly on unseen values |
| `boards.greenhouse.io` in examples | `job-boards.greenhouse.io` now dominates 4:1 | Accept both hosts + the `.eu` variant |
| Sponsorship not considered | 98.9% of rows say `"Other"` | Store, never filter on it |

Everything else in v2 stands — particularly the deactivation guards (§A2), the advisory
lock, `fetch_runs`, and RLS-with-read-only-policy.

---

## 7. `sources.verified.json`

165 boards, extracted from the apply-URL hostname of every active posting in both repos,
filtered to slugs appearing in ≥2 live postings. Each entry:

```json
{ "kind": "greenhouse", "slug": "janestreet", "company": "Jane Street",
  "active_intern": 11, "active_newgrad": 2 }
```

Highest-volume verified boards: `greenhouse:innodatainc` (64), `greenhouse:spacex` (45),
`lever:palantir` (34), `lever:weloglobal` (15), `lever:plus-2` (14), `greenhouse:imc` (13),
`greenhouse:janestreet` (13), `greenhouse:drweng` (13), `ashby:rivianvw.tech` (11).

**Regenerating it is ~20 lines of Python** against the two `listings.json` files, and this
is the answer to v2's open question A7 ("which companies?"). You don't hand-curate the
list — you derive it from where the live postings actually are, then trim.

For local context: 173 active postings currently touch Washington state (116 Seattle,
39 Redmond, 38 Bellevue, 4 Kirkland), plus 134 `Remote in USA`. That's a real board
without needing national coverage.

---

## 8. Open questions

1. **Do you store inactive rows at all?** Keeping them is 28,000 rows on day one for
   history the source can't back-fill anyway. Ingesting active-only is defensible and
   cheaper; you still accrue history from your own first run forward.
2. **Does the Unclassified tab earn its place, or should ATS ingestion be
   internship-only in v1?** Given the 29.5% number, internship-only is the honest scope
   and the tab is v1.1.
3. **`--age-4` is visually identical to `--rule`.** Deliberate — a two-week-old posting
   has no signal left. Confirm you agree before it ships, because it means old cards look
   unrailed.
4. **SmartRecruiters and Workday** are together comparable in volume to all three
   supported ATSes. SmartRecruiters has a public feed; Workday effectively doesn't. Worth
   a fourth adapter after v1.
