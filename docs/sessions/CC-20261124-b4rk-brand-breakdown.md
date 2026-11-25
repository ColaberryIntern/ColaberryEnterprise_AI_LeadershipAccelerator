# Session CC-20261124-b4rk — R25 Phase 1: the Revenue Room, broken down by brand (backend)

## The ask

Ali, 2026-11-24, on the live Revenue Room:

> Everything in the revenue tab. Should be broken down by brand. We can default to Colaberry
> training but FDE hiring should be connected to hire.refactorerd.ai brand (create this brand)
> Enterprise site sales should be connected to it's brand etc...

## What discovery found, before any code

**The brand to "create" already exists.** `hire.refactored.ai` is recorded in production as a
**web domain of the existing `refactored` brand** (Refactored.ai), added 2026-11-14 alongside
`refactored.ai`, `www.refactored.ai` and `track.refactored.ai`. Nothing was created. The stream
points at the brand that owns the hostname, and a test asserts it points at a brand slug rather
than at a hostname, because pointing at `hire.refactored.ai` would leave the heading permanently
unresolved.

Production holds **eight** brands: `advisor`, `ai-flotation`, `colaberry-enterprise`,
`colaberry-training`, `cpn`, `refactored`, `trustbeforeintelligence`, `worldoftaxonomy`.

**No revenue row carries a brand.** 45 tables have a `brand_id`. Of the tables this board reads,
exactly one does:

| Table | brand_id |
|---|---|
| `campaigns` | yes |
| `subscriptions` | no |
| `enrollments` | no |
| `leads` | no (confirmed directly) |
| `enterprise_intakes` | no |
| `gov_qualifications` | no |

So brand cannot be derived per payment. Ali chose **"stream declares its brand"** over adding
`brand_id` to the revenue tables, which would have been the only way to split one stream across
two brands and would have needed a backfill that is guesswork today.

**The one place real brand data exists disagrees with the map.** All four campaigns in the
membership demand path are tagged `colaberry-enterprise` in `campaigns`, while the members they
reach are filed under `colaberry-training`. `DEMAND_BRAND_NOTE` renders that disagreement rather
than reconciling it; a test keeps the note alive.

## What changed

- [x] R25 Phase 1: brand on every stream, brand headings on the board
  - Date: 2026-11-24
  - Session: CC-20261124-b4rk
  - What changed: every stream now carries a `brandKey`, the board ships an ordered `brands`
    list and a `brandBasis` sentence, and the brand names are read from the `brands` table.
  - Verification: 14 revenueFlow suites / 329 tests pass, including 23 new in
    `streamBrands.test.ts` and 8 new in `revenueFlowService.test.ts`; mutation results below.
  - Notes: no frontend change in this phase, so the page looks identical until Phase 2.

| File | Change |
|---|---|
| `backend/src/services/revenueFlow/streamBrands.ts` | NEW. The map, the order, the fallbacks, the two honesty sentences, the grouping and its assertions. |
| `backend/src/services/revenueFlow/brandDirectoryService.ts` | NEW. The one query: brand names and URLs for the slugs in use. |
| `backend/src/services/revenueFlow/revenueFlowTypes.ts` | `BuiltStream` split out of `RevenueStream`; `StreamBrand`; `brands` and `brandBasis` on the board. |
| `backend/src/services/revenueFlow/revenueFlowService.ts` | Applies the map, builds the groups, degrades on failure. |
| `membershipFlow.ts`, `govBidFlow.ts`, `ideaFlow.ts`, `enterpriseFlow.ts` | Return `BuiltStream` instead of `RevenueStream`. No behaviour change. |

## Decisions worth recording

**The compiler enforces the seam.** A builder returns `BuiltStream`, which has no brand, and
only the assembly step can produce a `RevenueStream`. So there is no way to ship a stream to the
page without a brand, and no way for a builder to invent one. That is why four builder files
appear in the diff for a one-token change: it buys an invariant that would otherwise rely on
five files agreeing.

**The slug is declared, the name is read.** The mapping is a decision and lives in code. A
brand's name and URL are data: they live in `brands`, the Brands admin page renders them from
there, and hardcoding "Refactored.ai" beside a page that says otherwise is the duplicate source
of truth this repo keeps paying for. A failed read costs the WORDING, never the grouping, and
the heading then carries `resolved: false` so the page can say the name may be out of date.

**A brand heading carries no figure.** A total on a heading would be a second revenue number
derived differently from the stream headlines beneath it. Asserted, with a positive control
proving the detector sees money when it is present.

**An empty heading is omitted.** A brand with no streams on the board would read as a brand that
earned nothing, when the truth is that no stream was built for it.

**Bets stay unassigned.** `hypotheses` maps to `null`, rendered as "No brand yet". Filing it
under the default would claim the bets belong to the training business, which is not known and
mostly not true.

## Verification

**Local typecheck, and a correction to how it was measured.** The full `tsc -p tsconfig.json` in
this worktree is still a false clean: a planted control error was never reported, for the reason
recorded yesterday (TypeScript 4.9.5 against an `@types/d3-dispatch` using a TS 5 `const` type
parameter, so the parser aborts before repo source).

A **scoped** invocation does work, and the first attempt at it nearly recorded a false negative:
`tsc --noEmit --skipLibCheck --esModuleInterop --target es2020 --moduleResolution node --types
node <explicit files>` DID report the planted control, but the check looked for the variable
name `__control` while tsc prints `Type 'string' is not assignable to type 'number'`. Read
literally, the detector said "no control reported" while the error was in front of it. With the
right reading: control reported, then removed, then zero errors across all eight changed files.
That is a partial signal only, since it does not use the project's tsconfig; **CI remains the
type authority.**

**Tests:** 14 revenueFlow suites / 329 tests pass. The 8 new service tests were confirmed to
execute by name under `--verbose`, because this is the file that once passed 429 tests while
never exercising the feature it was meant to cover.
