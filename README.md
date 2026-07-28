# openroles

An internship & new-grad job board built to the **Ledger** design system
(`internship-tracker-design-system.md`, v1). A scanning surface used daily under
time pressure: the subject isn't "jobs," it's *windows closing*. So **age is the
primary visual variable, and it's the only thing in the interface that gets
color** — the decay rail on each card's leading edge.

The app ingests the two live SimplifyJobs aggregator feeds, normalizes them into
one canonical taxonomy, and renders the board as a Server Component with all
filter state in the URL.

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

## How it maps to the design doc

| Design doc | Where it lives |
|---|---|
| §1 finding 1 — filter `active && is_visible` at parse time | `lib/ingest.ts` |
| §1 finding 4 — aggregator is primary, ATS is the freshness layer | `lib/ingest.ts`, host buckets in `lib/canonical.ts` |
| §1 finding 5 — internship classifier only, never a new-grad one | `lib/classify.ts` (type comes from repo-of-origin here) |
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
