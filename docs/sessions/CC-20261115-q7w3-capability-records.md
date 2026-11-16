# CC-20261115-q7w3 — AF12.5: publish the capability records both detail routes already load

Basecamp: AF12.5, todo `10493692101` (Agent Factory list `10406233777`), P0, due 2026-11-12.

## What was wrong

Both domain-detail handlers called `loadDomainMatrix(key)`, used `accountable_human` and
`researched_at` from the result, and discarded `m.capabilities` — the whole record array. The
snapshot builder did the same: it takes `matrix` as input, derives `authority[]` from it, and never
published the records.

Meanwhile two files published the opposite promise. `agentDomainSnapshot.ts` told every Command
Center page that its capability source was `GET /api/admin/agent-domains/<key>`, and
`agentDomainCommandCenterStory.ts` told builders the snapshot "carries the data for all six
panels". Neither was true for panels 2 and 4.

Three builders reported the same gap independently: Mihret Netsereab (criterion 1, 10 Nov,
escalated on Aleem's instruction), Victoria Spencer-Auber (criterion 3), and Sarbjit Kaur (3 Nov).

Every claim in the ticket was re-verified against `origin/main` at `061d56ab8` before any code was
written; line numbers had moved since the ticket was filed, the facts had not.

## What changed

| File | Change |
|---|---|
| `backend/src/services/agentDomain/capabilityProjection.ts` | NEW. The one shared projection: a frozen allow-list, file order preserved, optional limit, no clock. |
| `backend/src/routes/admin/agentDomainRoutes.ts` | Both detail handlers return `capabilities`, `capabilities_returned`, `capability_total`. New `DetailQuery` with `capability_limit`. Still GET-only. |
| `backend/src/services/agentDomain/agentDomainSnapshot.ts` | Publishes `capabilities` (all of them, file order). `sources.capabilities` now names the `-mine` route instead of the one that 403s builders; `sources.capability_ladder` added. |
| `backend/src/services/agentDomain/__tests__/capabilityProjection.test.ts` | NEW, 39 tests. |
| `backend/src/services/agentDomain/__tests__/agentDomainSnapshotCapabilities.test.ts` | NEW, 13 tests. |
| `backend/src/routes/admin/__tests__/agentDomainDetailCapabilities.test.ts` | NEW, 11 tests. Its own file because `agentDomainRoutes.test.ts` is 529 lines, past the 500-line ceiling. |
| `backend/src/routes/admin/__tests__/agentDomainMineDetail.test.ts` | +8 tests, through a SCOPED builder token. |

## Decisions worth arguing with

**Allow-list, never a spread.** `CapabilityRecord` ends in `readonly [extra: string]: unknown`, so
a spread would publish whatever a researcher put in a JSON file. One extra is specifically
dangerous: `current_approved_autonomy` exists in two of the ten files and `coverageMatrix.ts`
exists in part to stop it being read as an approval.

**No default limit.** Panel 2 is "one row per capability", so a silent cap would make a builder's
own inventory wrong while looking complete. Measured: the largest whole-domain projection is
marketing at 61.5 KB over 64 capabilities, and the allow-list already drops 83–87% of the raw
file, so the unbounded case is bounded and known. `returned` beside `total` makes any cut visible.

**File order, which differs from `authority[]` on purpose.** Panel 2 requires record order;
`authority[]` has always sorted by `capability_id`. The two arrays do not line up positionally and
a page joining them by index would mis-attribute rows. Both orders are pinned by a test.

**Fixed a second defect found on the way.** `sources.capabilities` named a `requireSection('program')`
route while builders hold `dashboard` — the field claiming to be their source named the exact
endpoint that refused them. That is the 403 Kalkidan Bezabeh reported on 5 Nov.

## Measured, not assumed

- 444 capabilities across ten domains, 966 `release_behaviour[]` entries, every entry's three
  fields populated, no capability with an empty ladder. (The ticket said 443 and 964; one
  capability and two entries have been added since it was written.)
- `release_behaviour` appeared in **no** HTTP response anywhere in the platform before this change,
  so panel 4 had no source at all, authenticated or not.

## Verification

- `tsc --noEmit` exit 0. A control error was planted in each of the three changed sources first:
  exactly 3 errors, one per file, and all restores byte-identical.
- **12 of 12 mutations caught.** Mutations 5, 6 and 11 each failed exactly one test — the one
  written for it. Baseline 82 tests across the four suites; restore clean.
- Full backend CI suite: `Tests: 46034 passed, 443 skipped`.
- `node scripts/checkTestTypecheck.js` — baseline matched exactly in both directions; the three new
  test files add zero test-file type errors.
- `lint-route-auth` OK across 167 admin route files. `validate-app-boundaries` OK.
- `secret-scan-selftest` detected all 4 planted secrets, then `secret-scan` clean over 8,750 files.

## Not done, and a flake found

- **`src/services/inbox/watcher/__tests__/watcherRetirement.test.ts` is flaky**, measured at 1 full
  run in 3, with a varying failure count (2 then 1). It passes 27/27 in isolation and touches
  nothing this change edits; it uses `fs.mkdtempSync` so it is not an obvious cross-suite directory
  collision, which points at a timing or cleanup race inside the suite. Another session's file and
  a different ticket, so it is reported rather than fixed here. It will redden CI intermittently
  for everyone until it is fixed.
  - Worth recording how this was nearly misreported: one run with these three new suites removed
    came back clean, which looked like evidence the new tests were the trigger. At a 1-in-3 failure
    rate a single clean run is not evidence of anything. Three repeated full runs settled it.
- **No frontend.** Nothing consumes the new fields yet; the builders' pages are in their own
  repositories.
- **The snapshot only reaches a builder on a document sync.** The fields exist the moment this
  deploys; a given builder sees them when their repository next syncs.
