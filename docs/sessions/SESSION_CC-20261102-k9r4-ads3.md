# Session CC-20261102-k9r4 (continued) — ADS-3 UTM-to-lead attribution hardening

**Date:** 2026-11-03
**Branch:** `workstream/ads3-attribution-handoff` (cut from `origin/main`)
**Ticket:** ADS-3 https://app.basecamp.com/3945211/buckets/7463955/todos/10467338843
**Scope:** The four items ADS-3 names — three ways the UTM backfill silently yields
`utm_campaign = NULL`, and the two shapes of `utm_source` that split one campaign. Separate from
ADS-5 (PR #3614, closed ticket) and cut from `main` rather than stacked on it.

---

- [x] ADS-3: make the UTM hand-off survive, and give `utm_source` one shape where the report reads it
  - Date: 2026-11-03
  - Session: CC-20261102-k9r4
  - What changed: Added `backend/src/services/marketing/adSpend/utmSource.ts` (canonical
    `utm_source`, the placement map, and the group merge) and
    `backend/src/services/marketing/utmBackfill.ts` (which session to attribute to, which fields
    travel). Changed `profitability.ts` to group its per-source split on the canonical source,
    `spendLedger.ts` to merge the two shapes out of the spend-entry suggestions, and
    `trackingController.ts` to read the visitor's recent sessions instead of only the newest, copy
    all five UTM columns instead of three, and classify the failure instead of swallowing it.
  - Verification: `jest` over five suites — 115 tests, 5 passed, 0 failed. **31 of them are new**:
    18 in `src/services/marketing/__tests__/utmBackfill.test.ts` and 13 added to
    `src/services/marketing/adSpend/__tests__/adSpend.test.ts` (39 before, 52 after). The other
    three suites — `journeyTokenIdentify`, `attributionModels`, `visitorKpi` — are the neighbors
    that touch identify and attribution, run to show they are unchanged. Typecheck clean twice over:
    `tsc --noEmit -p tsconfig.json` (TypeScript 5.9.3, exit 0) and a `--strict` run with no
    `--allowJs` over both test files and all five changed modules, which is what the test-file gate
    checks and what `tsconfig.json` deliberately excludes.
  - Notes: No frontend change is needed or wanted — `sourceLabel` already renders `fb` as
    "Facebook", so canonicalizing in the backend fixes the card without a frontend deploy. Two of
    ADS-3's four items needed no code; see below.

## What the ticket asked for, and what each item actually needed

ADS-3 named three fragilities and one "also fix". The ADS-5 measurement the day before settled two
of them without code, which is why this is a smaller change than the ticket implies.

| ADS-3 item | State | What was done |
|---|---|---|
| Lead created NULL, patched by a racing `/api/t/identify` | Not fixable from this side | The fix is the signup sending its own tags instead of being patched. That is C104, merged, not yet in the deployed build. Recorded in `utmBackfill.ts` under "what this does not fix" rather than left implied. |
| Backfill reads only the NEWEST session | **Fixed** | Reads the recent sessions newest first and attributes to the newest that actually carries a campaign. |
| Gated on `ENABLE_VISITOR_TRACKING` and a non-NULL `site_slug` | Already confirmed | 1,480 ad clicks landed in `visitor_sessions` in the 30 days to 2026-11-03, which cannot happen with tracking off or the page untagged. Measurement, not code. |
| Two shapes of `utm_source` split one campaign | **Fixed** | Canonical on read, in one module, with the placement map beside it. |

## The split is narrower than it was written up, and worse in a different way

My own earlier note said deploying C104 "splits every campaign into two report rows". Reading
`profitability.ts` closely, that is not right, and the correction matters because it changes where
to look:

- `buildProfitability` groups cohorts by `normaliseRef(utmCampaign)` **only**. Source plays no part
  in the key, so the campaign row and every total on it are safe.
- The damage is one level down, in `bySource`. `fb` and `fb|paid` are different keys there, so one
  placement becomes two lines — and `PLACEMENT_FOR_SOURCE` is keyed on the bare source, so the
  `fb|paid` line misses the map, its placement spend resolves to `null` and its cost-per-signup
  renders blank.
- `AdProfitabilityCard` draws the breakdown only when a row has more than one source. So campaigns
  that show no breakdown today grow a two-line one listing Facebook twice, one line of it with no
  cost beside it, and `sourceLabel` falls back to printing the raw code, so it reads `fb|paid`.

Blank reads as "no data yet", not as a bug, which is why this was worth fixing before the deploy
rather than after the first report is read.

The second consumer is the worse one, and I nearly missed it: `knownCampaigns` feeds
`AdSpendForm`'s datalist, and `AdSpendForm.tsx:78` keys each option on `utmSource-utmCampaign`
while setting `value={k.utmCampaign}`. Two shapes therefore produce **two options holding the same
campaign id**, labeled `Facebook · 200 signups` and `fb|paid · 100 signups` — the campaign listed
twice, neither count its real total, and the second label printing the raw code. That is the form
spend is typed into, which makes it the worst place for one campaign to look like two: typing the
cost against one half while signups keep landing on the other is precisely how spend ends up
matched to nothing, which is the failure the suggestion list exists to prevent.

Worth recording how close that came to being missed: a `grep -rn 'knownCampaigns' frontend/src`
**exited 0 with no output** under disk contention, which reads exactly like "no consumer". The
Grep tool found `AdSpendForm` immediately. An empty search result is not evidence of absence
unless the search is known to have run.

## The break I introduced, and the bound that fixes it

Reaching past the newest session is the fix for item 2. Left unbounded it is also a new bug:
somebody who clicked an ad in March and later arrived through search would be credited to that ad
indefinitely — last-touch attribution quietly turned into first-touch.

So the reach is bounded twice: `UTM_SESSION_LOOKBACK = 20` sessions, because a long-lived visitor
accumulates them without limit and this read sits on a request already racing the page navigation;
and `UTM_ATTRIBUTION_WINDOW_DAYS = 30`, matching the report's own default window, so a signup can
only be attributed to a click the report would have spend for. Both are tested, including the edge
day and the day past it.

One deliberate asymmetry: a session whose `created_at` cannot be read is treated as **inside** the
window. Dropping an attribution because a field is missing is the exact failure this ticket is
about, and an unreadable timestamp is a schema problem rather than a stale click.

## The silent catch

`catch { /* non-blocking */ }` sat around the whole backfill. Non-blocking is right — attribution
rides on top of a lead that already exists, so losing it must not fail the identify call — but
silent is not: a broken backfill and a visitor with no ad click looked identical from outside. It
now logs one structured line with `event: utm_backfill_failed`, an `error_class` that is never the
bare `Error`, and the lead id. No email, no address, no token.

## Not established

- **Nothing here has run in production.** Every claim above is a unit test or a read of the code.
  The ticket's own "done when" — one real click producing a `leads` row that holds the campaign id,
  demonstrated by querying that row — was already satisfied by the ADS-5 measurement (410 of 411),
  but that was measured against the OLD backfill. The new one is unproven on live traffic until
  this deploys and a tagged click lands.
- **The `fb|paid` case has never occurred in production.** Zero leads carry a piped shape today, so
  the merge is tested against constructed rows, not observed ones. That is the point of landing it
  before C104's frontend, and it also means the first real proof comes after that deploy.
- **The single lost attribution in 411** is not proven to be the newest-session bug. It is the most
  likely cause and this change addresses that cause; the row itself was not traced.
- **`utm_content` and `utm_term` reaching the lead is not the same as creative-level reporting.**
  The columns will now be populated going forward. Nothing reads them yet, and the 450 existing
  leads stay empty — this writes no backfill for history.
- **Observed and deliberately not fixed:** one campaign that ran on both Facebook and Instagram
  still produces two datalist options sharing the same `value` (the campaign id), because the
  suggestion list is per placement by design. That is pre-existing, is not what ADS-3 asked for,
  and is arguably correct — the per-placement signup counts are useful. Flagged rather than
  changed, to keep this diff to the ticket.
- **No profitability number follows from any of this.** The spend ledger is still empty; that needs
  ADS-4 (the Meta token) and ADS-6 (the daily sync).

---

## Production verification, 2026-11-03, after PR #3622 merged

Merge `92d103b2` landed 14:15:47Z. Main's tip then moved to `e8756aa8` (#3625 and #3616 merged
behind it), and **another session deployed that tip at 18:35:20Z**, backend and nginx. So this
shipped without a deploy from me. Verified in the running container rather than assumed: the marker
`utm_backfill_failed` is present in `dist/controllers/trackingController.js`, both new modules
(`dist/services/marketing/utmBackfill.js`, `dist/services/marketing/adSpend/utmSource.js`) are built
at 18:31, and the containers read `Up 2 minutes`, so it was a real recreate and not a no-op.

### The utm_source merge is proven on live production rows

Called the deployed `knownCampaigns(LANDING_SOURCES)` read-only against production, beside the raw
SQL grouping it replaces. For the one live campaign, `52708443249234`:

- **Before**, the raw grouping handed the UI **four** rows: `fb` 297 signups, `ig` 114, `fb|paid` 3,
  `ig|paid` 4. The two piped rows missed `PLACEMENT_FOR_SOURCE`, so their spend rendered blank.
- **After**, the deployed code returns **two**: `fb` 300 and `ig` 118, each resolving a placement.

The signups sum exactly (297+3, 114+4), and `canonicalUtmSource` is idempotent on all four shapes
present in production. The report card's `bySource` now renders two lines rather than four.

### Two claims in the pre-deploy write-up above are wrong

1. **"Zero leads carry a piped shape today" is wrong.** `leads` holds 8 piped rows — one from
   2026-03-20 and seven from today. The split was **already live in production**, not pre-empted.
2. **"0 of 450 leads carry utm_content" was already wrong when written.** Seven leads carry it, the
   earliest at 05:50Z today. They did not come from the backfill: `visitor_sessions` holds **zero**
   piped `utm_source` rows while those leads have one, so the value can only have arrived in the
   signup payload. `freeSignupService.ts:225` writes `utm_content` at lead creation.

### A defect this verification found in the shipped change

`UTM_FIELDS` included `utm_medium`, and **`leads` has no such column.** It exists on
`visitor_sessions` only; the `Lead` model declares exactly `utm_source`, `utm_campaign`,
`utm_content`, `utm_term`. Sequelize drops a key that is not a model attribute, so no write ever
failed — the cost is that the success log could name a field it had not written. The old code's
`utm_medium` copy was landing nowhere either, so the real improvement is **two columns to four**,
not three to five as the docblock claimed. Fixed on `workstream/ads3-utm-medium`.

### ADS-3's stated acceptance test would not exercise this change

"Query one real tagged click's lead row" now passes **without the backfill running**. The frontend
sends the tags in the signup payload, so `utmBackfillUpdates` returns `{}` for those leads: nothing
is missing. Measured per hour, every tagged lead in the piped hours already carried campaign *and*
content on arrival.

What the backfill is worth, measured in production instead:

- **388 leads** created in the previous 30 days carry no `utm_content` while a session of the same
  visitor does.
- **17 visitors** in 30 days had a tagged click sitting behind an untagged newest session, which is
  exactly the case the newest-session fix addresses.

Still unproven on live traffic: the backfill actually firing. It fires only for a lead whose payload
lacks a tag its session has, now the uncommon path. Between the deploy and this check no leads and
no `/api/t/identify` traffic arrived at all, and the backend logs show zero `Backfilled UTM` lines
and zero `utm_backfill_failed` lines.
