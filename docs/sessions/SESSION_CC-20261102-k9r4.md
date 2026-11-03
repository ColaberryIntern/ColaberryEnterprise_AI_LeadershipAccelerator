# Session CC-20261102-k9r4

**Date:** 2026-11-02
**Branch:** `workstream/ad-spend-ledger` (cut from `origin/main`, then merged up to `6a827d3c`)
**Scope:** Recover the ad spend ledger and ad profitability report, which existed only as an
orphaned git patch, and land it through the real CI gates. Ticket ADS-1.

---

- [x] Ad spend ledger and ad profitability report
  - Date: 2026-11-02
  - Session: CC-20261102-k9r4
  - What changed: 35 files, +3,114/-2. Two new tables (`marketing_spend_facts`,
    `marketing_spend_syncs`); three ways to record spend (typed, Ads Manager CSV import with a
    dry-run preview, daily Meta Marketing API pull); a profitability report on Marketing →
    Performance giving spend, cost per signup, cost per payer, MRR, cash collected, return on
    spend, profit and payback months over a 30/90/180-day window. Recovered from
    `0003-Add-ad-spend-ledger-and-ad-profitability-report.patch` (session CC-20261031-rh7k),
    which had never been pushed, PR'd or merged.
  - Verification: Five of six required CI gates run locally and green — **Backend typecheck**
    (`tsc --noEmit`, 0 errors, tsc 5.9.3), **Frontend typecheck** (0 errors), **Frontend build**
    ("Compiled successfully", `main.0b934b84.js`, new page present in lazy chunk
    `2998.42c79106.chunk.js`), **Secret scan + route-auth lint** (7,741 files no secrets; all 145
    admin route files auth-guarded including the new `adSpendRoutes.ts`; copy lint 77 values and
    its 16-case self-test), **Test-file typecheck** (`checkTestTypecheck.js`: tsc completed in
    1698s at 8192MB heap, 400 errors across 141 files, "matched exactly, in both directions" —
    the five new test files add zero typecheck debt). The ad-spend suite itself is 39/39, and
    `writerPairTripwires` 11/11 after the fix below.
  - Notes: **Four hunks were dropped.** The patch is `[PATCH 3/3]` and patches 1-2 were never
    exported — absent from Downloads, from every ref and branch, from open and merged PRs, and
    from the local object store. Patch 3 modifies four files those patches created, which
    therefore do not exist on main: `landingRevenue.ts`, `revenueHealth/blockedMetrics.ts`,
    `BlockedMetricsCard.tsx`, `docs/sessions/CC-20261031-rh7k.md`. Nothing in the ad spend
    feature imports any of them — every relative import across all 35 applied files resolves —
    so dropping them costs the ledger nothing. `payingMembersSql.ts` is **not** among them: the
    patch creates it, and an early exclusion of it on my part was the one real mistake of the
    run, caught by an import scan rather than by a test. One conflict in `server.ts`, where
    main's `ensureLandingPageSnackbarSchema` and this patch's `ensureMarketingSpendSchema` add to
    the same two spots; both kept, as they touch different tables.

- [x] Pin `payingMembersSql.ts` in the paid-status tripwire
  - Date: 2026-11-02
  - Session: CC-20261102-k9r4
  - What changed: One entry added to `PAID_FILES` in `writerPairTripwires.test.ts`, as a READ
    with a determination. TRIPWIRE 1 pins every non-test file mentioning a paid-status literal
    and fails the build on a newcomer by design; `payingMembersSql.ts` is the 26th, because
    `COLLECTED_CTE` has a `paid_enrollment` fallback on `e.payment_status = 'paid'`.
  - Verification: `writerPairTripwires` 11/11 (was `Expected: 25, Received: 26`). TRIPWIRE 2 does
    not match the file and still pins 20.
  - Notes: Found by an A/B, not by the first test run — see below.

## The test run that proved nothing, and the one that did

The first full backend suite reported **25 failing suites / 34 failing tests**. That measurement
was worthless: it ran while two `tsc` processes and the 8GB-heap test-file ratchet were saturating
the same machine, and these suites carry a 5-second per-test timeout, so most failures were
`Exceeded timeout of 5000 ms`, not breaks.

Re-running the *same 25 suites* quietly, on this branch and on clean `origin/main`:

| | Failing |
|---|---|
| `origin/main` @ `3916a89b` | **17** of 25 |
| this branch, same 25, same quiet machine | **11** of 25 |

The branch failed *fewer* than main, and seven suites failed on main while passing here — the
signature of flakiness, not causation. Exactly one suite was a genuine difference:
`writerPairTripwires`, fixed above. On main it had been **masked**, timing out at 237s; run
quietly here it finished in 35s and produced the real assertion.

Two traps worth naming. A baseline run can be circular, so the script asserted the detached HEAD
really was `origin/main` **and** that `adSpend/` was absent before believing any number, and
restored the branch on exit. And `MetaAdSpendSync` appeared in two `agentRegistrySeed*` failures,
which looked causal — it was console output from the seed registering the new agent normally, and
both suites pass on this branch.

## Not verified

- **Backend unit tests** as a whole gate. 2,309 of 2,368 suites pass; the residual failures are
  pre-existing on main and overwhelmingly `SequelizeConnectionRefusedError` with no local Postgres
  (CI runs DB work in a separate "Integration tier (Postgres)" job). CI is the authority.
- The **test-file typecheck after the merge-up**. It was clean before merging `origin/main`
  (+18 commits, which brought six new test files of other people's); re-running costs ~28 minutes
  and CI runs it against exactly this merge.
- **Production.** Not deployed. The Meta sync ships dormant — it returns early without
  `META_ADS_ACCESS_TOKEN` / `META_AD_ACCOUNT_ID` and its agent row seeds `enabled: false` — so
  merging switches nothing on. The two new tables are additive.

- [x] ADS-1 ticket artifacts and close-out
  - Date: 2026-11-02
  - Session: CC-20261102-k9r4
  - What changed: Added `scripts/artifacts/tickets/ads1Data.js`, `ads1Render.js` and
    `buildAds1Artifacts.js`, following the committed per-ticket generator pattern. Both PDFs read
    the one data module, so a figure on the visual cannot drift from the same figure in the
    document. Committed rather than left in a scratchpad because the C2.6 generators were
    scratchpad one-offs and were lost, which is the reason this pipeline had to be rebuilt once
    already. The rendered PDFs are not committed: `docs/artifacts/` is gitignored.
  - Verification: `buildAds1Artifacts.js` renders the visual at 1 page (the renderer counts
    `/Type /Page` in the output bytes and throws over the limit) and the document at 3. The
    visual was also screenshotted and **looked at** - the first render measured 539px of content
    in 794px of landscape with 9px body text, so it was scaled up to 700px before posting; a page
    that merely fits is not a page that reads. Both PDFs posted to the ticket with the attach
    script reporting `preview OK`, which re-reads the stored comment to confirm Basecamp expanded
    the attachment rather than leaving a broken glyph.
  - Notes: Created Docs & Files folder "Marketing Ad Attribution - Artifacts" (10469067334),
    since the Marketing list was new and `attachArtifactToTicket.js` resolves a folder by title
    and throws otherwise - and it defaults to the Agent Factory vault, so `PARENT_VAULT` and
    `LIST` were passed explicitly. The ticket title's "(currently unmerged)" was corrected by
    read-modify-write before closing, so a false statement was not frozen into a closed record;
    the todo PUT is a full replace, so description, due date and assignee were re-sent from the
    live record and verified preserved. Closing threw `Unexpected end of JSON input` exactly as
    expected - the endpoint answers 204 with no body - and the close was confirmed by re-reading
    `completed`, not by retrying.
