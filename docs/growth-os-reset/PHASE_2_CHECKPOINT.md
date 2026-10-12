# Phase 2 Checkpoint — Canonical Free AI Entry and a Person 360 That Can Be Trusted

**Session** `CC-20261005-r6h2` · recorded 2026-10-11, §F updated 2026-10-12 post-deploy (Central) · **Phase 2 of 6**
**Branch** `workstream/growth-os-reset-phase2` · **MERGED 2026-10-12 and DEPLOYED** — running commit `12c1e5fc`; see §F.

> Every number in this document was pasted from a command's output. Where a figure could not
> be produced by a command, the document says it is unknown rather than estimating it.

---

## Ali's five questions, answered

| # | Question | Answer |
|---|---|---|
| 1 | Can a Free AI account still exist without an Explorer Growth profile? | **No for new accounts. YES for 86 existing ones** — measured, see §F |
| 2 | Can an unpaid Explorer still be mistaken for converted? | **No — live in production** |
| 3 | Can I look at one person and see the website journey that led to their signup? | **Yes.** |
| 4 | Can I see what they have done since registering? | **Yes, with named gaps.** |
| 5 | Is Person 360 trustworthy enough to be the Sales Readiness Score's input in Phase 3? | **Not yet** — three reasons left, down from four |

**The answers are not yes/yes/no/no/no, and they are also not five clean yeses.** Two carry real
qualifications and the fifth is a no. In detail:

**1 — No for new accounts. YES for 86 existing ones, and that number is now measured.** Both
public signup implementations establish the Explorer identity *at registration*:
`freeAccountRegistration` writes both semantic columns together
(`freeAccountRegistration.test.ts` → *"learner gets BOTH columns"*) and
`explorerProfileAtRegistration` creates the profile row keyed on the enrollment, including when no
lead matches, in which case it reports the person as unresolved rather than skipping them. A
registration-time write failure is logged by error class and recovered by the nightly repair, so a
transient failure leaves a gap **until the next night** rather than forever.

For accounts that already existed, the pre-deploy version of this document said the answer was
unknown. **It is no longer.** §F records the measurement: **86 active `standard` + `guest` rows
are invisible to Explorer Growth**, because the running population filter is
`enrollment_type: 'explorer'` AND `status: 'active'` and never consults `tier`. The backfill's dry
run can prove free-signup provenance for **37** of them; the other **49** it cannot prove either
way and reports for human decision rather than guessing. **The backfill has still not been run for
real** — that is a decision, not an oversight.

**2 — No. Live in production as of 2026-10-12.** Conversion now derives from authoritative paid and
subscription state in one place (`adminOs/conversionState.ts`), and both stage derivations import
the same constant. Before this, `WHEN e.email IS NOT NULL THEN 'enrolled_student'` meant the mere
existence of an enrollments row staged a person as converted — and worse, suppressed their intent
and temperature as post-conversion noise, for exactly the population whose intent matters most.
Proved by `conversionState.test.ts` → *"does not treat an unpaid Explorer as converted"*, paired
with *"does treat a paid learner as converted"* so the fix did not disable the feature, plus
comp-seat tests. **Deployed 2026-10-12 and verified in the running container** by the deploy's
marker check against the compiled SQL, so this is now true of production and not only of the
branch.

**3 — Yes.** Pre-registration `page_events` are keyed to the stitched lead and ordered by time
descending in the statement the service issues. Mutation-proved: removing the `lead_id` stitch key
kills named tests (T211 mutant **M8**, the stitch key); commenting out the `ORDER BY`, or flipping `DESC` to `ASC`,
kills named tests (M7, and a DESC-to-ASC variant). Cross-brand history follows the stitch with **no brand filter
applied** — filtering by brand would hide the very history the criterion exists to surface — and
an unstitched person gets nothing, which is the control.

**4 — Yes, with named gaps.** The timeline, the Explorer E/I/F snapshot, the GHL contact id and
the existing panels all render on one screen (§D). The gaps are real and listed in §H: of roughly
twenty evidence groups the spec names, several have no test, and **there is no registry test that
would fail if a group silently lost its evidence.**

**5 — Not yet, though one of the four reasons is now gone.** It is deployed and
production-verified, which was reason (a). Three remain: (b) several evidence groups have no
test, and no guard detects a group losing its evidence; (c) `trustPanel`'s `matchMethod` has a
surviving mutant, pre-existing and inherited by a verbatim move; (d) two suites pass in
isolation and fail under heavy parallel load, which will keep producing false reds in the gate
that is supposed to protect this. **(b) and (d) are what Phase 3 should require before trusting
this input.** A fourth item is now visible that was not before: the 86 incoherent rows in §F
are exactly the population an SRS would score, and they are invisible to the engine today.

---

## A · What this phase was supposed to accomplish

Make the canonical Free AI entry work without breaking authentication, entitlement, cohort, login,
reporting or existing paid users — so that **it is impossible for a legitimate Free AI account to
exist while being invisible to Explorer Growth merely because it came through the other signup
implementation.** Then fix Person 360 before expanding it, and only then build the canonical
evidence package. Origin brand, originating website, source, entry point, campaign, UTM, page URL
and visitor linkage all had to be preserved separately, because **origin brand is not journey
ownership.**

---

## B · What actually shipped, with every verifier score

| Task | What it did | Verifier |
|---|---|---|
| T201–T206 | One canonical free-account service; both public paths write both semantic columns; the Explorer profile at registration | PASS (T207 cycle); T205/T206 each needed 3 attempts |
| T207 | `backfillFreeAccountCoherence` — a pure predicate plus a dry-run CLI | **PASS 12/12** (after FAIL 8/12) |
| T208 | `identifierPrecedence` — one subject-key builder, pure, importing nothing | **PASS** |
| T209 + T210 | The `explorer` lifecycle stage; conversion derived from paid state | **PASS 12/12** (after FAIL 10/12) |
| T211 | Person 360 evidence package, one declared canonical view | **FAIL 8/12 → FAIL 10/12**; attempt 3 mutation-proved but **unverified by a grader** |
| T212 | The operator "Who is this?" read view | FAIL 7/12 → FAIL 9/12 → **PASS 11/12** |
| T213 | The fifteen acceptance scenarios as a reconstructible set | **FAIL 10/12 → FAIL 10/12 → FAIL 9/12**, graded DISCLOSABLE; two findings closed afterwards and **unverified by a grader** |
| T214 | GHL discovery, configurable owner, fail-closed routing | **PASS 12/12** |

**THREE OF THE EIGHT TASKS FAILED INDEPENDENT VERIFICATION. T212 now PASSES at
11/12 after three attempts; T213 does NOT.** T213's last grade is FAIL 9/12, ruled
DISCLOSABLE rather than blocking, with two findings closed afterwards that no
grader has re-scored. Nothing here claims T213 passed.

**T212 scored ZERO on criterion 6 for a false claim of mine**, and that is the
most important thing in this document about how to read the rest of it. I wrote
that the duplicated lifecycle stage map was fixed "on the profile AND the
roster". `PeoplePage.tsx` was untouched and still carried its own nine-key copy
with no `explorer` key, so **the roster was still rendering the raw lowercase
enum for the one stage this phase exists to make visible** — while the module I
had just written carried a docblock headed "WHY THIS IS ONE FILE AND NOT TWO
COPIES". Fixed by doing the work; now asserted by a test rather than described in
prose.

**Two T212 tests could not fail.** One was named *"introduces no permission path
of its own"* and asserted only that a scored panel renders its numbers — so a
real `localStorage` role gate inserted into the component passed it. The other
asserted `textContent.toContain('0')` for a 0/0/0 score, and the rendered date
"1 Oct 2026" already contains a `0`, so suppressing a genuine zero passed too.
Both now assert the behaviour they are named for.

**T213 was graded three times and failed three times** — 10/12, 10/12, 9/12 — and
its last grade is the one recorded above. Across those rounds verifiers found:
three of fifteen scenarios pinned to a control or boundary instead of the proof;
six wrong provenance labels, including three citing a task whose mutation cannot
reach the test; a registry that certified a *skipped* test as coverage; and then,
after I fixed that, the **`xdescribe` alias taking the same six tests dark again**
because my fix matched one spelling of the hole. All are now closed and
mutation-proved, **but the last two fixes landed after the final grade and no
grader has re-scored them.** The third grader ruled the residue DISCLOSABLE
rather than blocking: zero production surface, and "all fifteen pass"
independently reproduced at 38/38 and 242/242.

**T213's known-open items are listed in §H**, not resolved: nine of fifteen
entries name no specific mutation (an unmet part of the acceptance), S1 pins the
canonical decision point rather than the route wiring, S13 is proved by nothing
in this phase, S14's live-write half is uncited, and two block-disabling shapes
remain undetectable.

**T211 failed twice, and both verdicts were right.** Attempt 1 asserted source text, and five of
eight mutants survived. Attempt 2 was rewritten behaviourally and still failed, for a subtler
reason: the acceptance criterion *"the same person resolves to the same identity through all three
views"* was tested by asserting that three **ID builders** agree — while **none of the three views
called any of them.** The assertion sat beside the views instead of running through them.

Attempt 3 fixed the code rather than the test: `personChainService` and `personJourneyService` now
build their `subject_ref` from T208's shared builder. **The fix immediately found a fifth copy of
the spelling** that nothing had caught: `personJourneyService` built `` `lead:${leadId}` `` inline,
and mutating it to a different identity for the same person left **every suite in the repo green**,
because `acceptance.phase6.test.ts` drives that view but never looks at `subject_ref`. The journey
view could have renamed every person in the system silently.

One correction to the verifier's finding, which does not rescue the verdict: its surviving mutant
M16 *was* caught by an assertion that already pins the ref —
`backend/src/services/growthJourney/__tests__/personChainService.test.ts:212` → "hops).outcomes).toMatchObject"
— so it read as a survivor only because the verifier's safety scope excluded that suite. **That is
a fault in my evidence set, not in the code**: T211 declared three suites and omitted the one that
owns one of its three views. The evidence set now names all five.

---

## C · Architecture changes

- **One conversion definition.** `adminOs/conversionState.ts` exports the SQL facts, the join, the
  `IS_CONVERTED_SQL` predicate and the stage CASE. The roster and the profile import the same
  constant, because two copies of that CASE drifting apart surfaces as a row an operator can see
  but cannot open. It carries a deliberate-asymmetry note on `past_due`.
- **One subject-key builder.** `identity/identifierPrecedence.ts` is pure and imports nothing. As
  of attempt 3 the three person views build their refs from it; a tripwire forbids any view from
  spelling one itself.
- **One declared canonical person view.** `personProfileService` declares `'canonical'`; the two
  growthJourney views declare `'answers'` and say which different question they answer. A checker
  asserts exactly one claims canonical, with positive controls for all three failure modes.
- **A new lifecycle stage.** `explorer` sits between `applicant` and `enrolled_student`, forced
  into `lead_ingestion` and `revenue` by the contiguity test. Labelled **"Explorer ($0 to start)"**.
- **Fail-closed GHL routing, at both levels.** An unreadable routes map withholds; as of this
  phase's last fix, so does a map with any present-but-unusable entry.

---

## D · Screens and UI

One screen changed: the admin person profile (`/admin/people/:ref`).

- **Explorer score tab** — Engagement / Intent / Fit, the primary state, overlays, and the
  snapshot's own date so a stale score cannot read as current. Absent evidence renders as a
  sentence; the test asserts **no digit appears at all** when the panel is null, because three
  zeroes are a real score and an unscored person shown as zeroes is indistinguishable from one. A
  genuine zero still renders as zero.
- **GoHighLevel contact** on the acquisition panel, with "Not linked to GoHighLevel" when absent
  rather than the generic "Not recorded".
- **The `explorer` stage now has a name.** It had none: `STAGE_LABEL` carried nine keys and no
  `explorer`, so the one stage this phase exists to make visible rendered through the `?? stage`
  fallback as the raw lowercase enum — on the profile **and** the roster. The map was duplicated
  across two pages, which is why neither was updated.
- **The page was split**, because CLAUDE.md requires the next change to an oversize file to split
  it first: 1,076 lines → **470** (hard ceiling 500), with eight panels extracted and the tab
  registry moved to a pure, unit-testable function. The component function is still ~300 lines
  against a 100-line ceiling, which is disclosed in the file itself rather than left implied.

**Not verified in a browser, and that is now the only thing missing from §D.** No screenshots were
taken. Both of the reasons the pre-deploy version gave have since been disproved: it IS deployed,
and the CRA production build runs locally **without Docker** — a verifier confirmed
`CI=true react-scripts build` compiling successfully, twice. So the absence of screenshots is a gap
I did not close, not a constraint that prevented it.

---

## E · Data and behaviour verification

```
backend CI, full:        7 failed, 8 skipped, 1890 passed, 1897 of 1905 suites
                         7 failed, 162 skipped, 30879 passed, 31048 tests
T211 evidence set:       Test Suites: 5 passed, 5 total    Tests: 110 passed, 110 total
adminOs+growthJourney+identity:  80 suites, 1866 tests, EXIT=0
T213 acceptance registry:        21 passed, 21 total
frontend (new suites):   Test Suites: 2 passed, 2 total    Tests: 26 passed, 26 total
backend typecheck:       tsc 5.9.3, EXIT=0, 0 bytes of output
frontend typecheck:      EXIT=0
```

**Mutation results, all with two witnesses required per kill** (a named failing test AND a non-zero
failed count):

| Sweep | Mutants | Result |
|---|---|---|
| T211 attempt 3 | 3 | all killed; chain view, journey view, and the dropped import |
| T212 | 8 | all killed |
| T213 | 1 | killed — renaming a covering test fails by the scenario's own name |
| T214 follow-up | 1 | killed by 2 named tests |

**The 7 remaining backend failures are not from this phase, and that was tested rather than
asserted.** An import-closure walk from each failing suite — with a control suite that correctly
shows reachability — proves **four cannot reach any file this phase changed** (closures of 3, 3, 28
and 5 files, zero of mine). The other three do reach my files, so closure alone cannot clear them
and each was read instead: two are 5000 ms jest timeouts on harnesses booting **818-** and
**1070-file** import closures on this Windows box, and the third compares a file **absent from my
diff** against LF-authored literals after `split('\n')` when that file is CRLF (38 CR / 38 LF).
`main`'s own CI is green at this branch's merge parent. Reachability does not prove causation, but
unreachability disproves it, and that is the only direction the argument needs.

**The fifteen acceptance scenarios** are enumerated in
`backend/src/__tests__/acceptanceScenarios.phase2.test.ts`, each bound to the real test that proves
it and to the task and mutation that showed that test can fail. The registry fails if a covering
test is renamed, moved, duplicated or deleted — which is what stops "all fifteen pass" from naming
a population nobody can reconstruct.

---

## F · Production state — DEPLOYED AND VERIFIED 2026-10-12

**Merged, deployed, and read. This section replaces the pre-deploy version, which said
"NOTHING IS DEPLOYED. NOTHING HAS BEEN READ FROM PRODUCTION."**

- PR [#3062](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3062)
  merged `2026-10-12T14:18:52Z`, merge commit `0ba1eaf1`. All nine CI jobs passed — **including
  Backend unit tests**, which independently confirms the 7 local failures were Windows-only.
- Deployed via `DEPLOY_MODE=registry bash scripts/deploy-prod.sh` **on the prod host** (the script
  needs `flock` to serialise deploys, which Git Bash on Windows does not have).
- **The deployed commit is `12c1e5fc`, not `0ba1eaf1`.** `main` advanced while the deploy was
  running — PR #3065 (cb-daily-tick) merged in between — and the script pulls `origin/main`.
  `12c1e5fc` contains this phase's merge, verified with `git merge-base --is-ancestor`, so Phase 2
  shipped together with that unrelated change.
- **The first deploy attempt correctly REFUSED.** Registry mode compares the digest behind `:main`
  against `sha-<HEAD>` and found no image for `12c1e5fc`, because CI published it at
  `14:43:09Z` — after the attempt began. The guard exists so that pulling a moving `:main` tag
  cannot silently deploy an older build while every other check passes.
- **Marker proof, which is the only thing that shows the RUNNING container carries the change:**

```
[deploy] marker 'has_paid_subscription' present in backend:/app/dist/services/adminOs/conversionState.js
[deploy] backend answering after 5s
```

  `has_paid_subscription` is a string literal inside T210's conversion SQL and did not exist in
  `main` before this merge, so it cannot be satisfied by an older image.

### The two flag values that were UNKNOWN are now observed

```
$ docker exec accelerator-backend printenv CONTENT_PAID_GATE_ENABLED EXPLORER_WEEK0_ONLY
  true
  true
$ ... GROWTH_JOURNEY_EXECUTION_ENABLED   -> unset
```

So the paid-content gate is ON and Explorers are confined to Week 0 **in production**, which is
the entitlement consequence the pre-deploy checkpoint could only assert from `.env.example`.
`GROWTH_JOURNEY_EXECUTION_ENABLED` is unset: **nothing sends, confirmed in production** and not
only in tests. It was confirmed independently in tests too: a verifier built a syscall-level
tripwire patching `net.connect`, `tls.connect` and `dns.lookup`, with controls proving it blocks,
and recorded **zero vendor-host contact attempts across all 31,042 tests** — still zero with the
withholding logic mutated out, so the stub rather than the business logic is what enforces it.

### The row counts that were UNKNOWN are now measured

One `GROUP BY` over `enrollments`, no PII:

| programme | access | status | count |
|---|---|---|---|
| explorer | member | active | 270 |
| standard | member | active | 211 |
| standard | guest | active | 86 |
| standard | member | withdrawn | 43 |
| explorer | member | withdrawn | 20 |

**There are ZERO `explorer` + `guest` rows**, and that pair is what DECISION 1 defines a Free AI
learner to be. Both incoherent shapes are real, and the backfill's own dry run names them:

```
after:  shape_a(explorer+non-guest)=290  shape_b(standard+guest)=86
        coherent(explorer+guest)=0       total=630
```

- **86 active `standard` + `guest`** carry the wrong `enrollment_type`. The running container's
  population filter is `enrollment_type: 'explorer'` AND `status: 'active'` and never consults
  `tier` — verified by grep inside the container — so **these 86 are invisible to Explorer
  Growth today.**
- **290 `explorer` + `member`** carry the wrong `tier`. They ARE visible to Explorer Growth, but
  their access level says member.

### What the backfill would do, from its own dry run (NOT run for real)

```
== 56 write(s) planned ==
  37  enrollment_type   standard -> explorer
  19  tier              member   -> guest
DRY RUN — nothing written. Re-run with --confirm-production to commit.

DISCLOSURE: 37 row(s) would join the Explorer programme with explorer_entered_at still
NULL. This script writes exactly two columns by design, and NO TASK CURRENTLY OWNS
backfilling that column.
```

It plans **56 writes out of 376 incoherent rows**, because it requires POSITIVE free-signup
provenance and excludes org members, AI Flotation prospect accounts, staff by the union of all
three disagreeing predicates, agent identities, paid rows and anything undeclared. The rest it
**reports for human decision rather than guessing** — which is the behaviour the task was
written for, now shown against real data.

**So the honest answer to question 1, for EXISTING accounts, is measured rather than unknown:
yes, Free AI accounts exist today that Explorer Growth cannot see — 86 of them — and 37 have
provable free-signup provenance. The remaining 49 cannot be proven either way from the data.**

### Still not done

- **The backfill has NOT been run for real.** Only the dry run. That is Ali's decision, and the
  numbers above are what it should be made on.
- `explorer_entered_at` would be left NULL for all 37 joiners, and **no task owns that column.**
- Whether Open-House deposit rows exist is still **unknown**; nothing in this phase measured it.
- No browser verification and no screenshots.

---

## G · Behaviour changes a person could notice — derived, not remembered

Taken from T202's committed enumeration by command
(`grep -cE '\*\*CHANGES\*\*' docs/growth-os-reset/FREE_ACCOUNT_CONSUMERS.md` → **16**), not from
memory, because a remembered list is always short:

1. `controllers/v1EnrollmentLookupController.ts` — the partner-app lookup reports free Explorers
   as not-enrolled.
2. `services/access/contentEntitlement.ts` — the Week-0 gate for existing portal accounts.
3. `services/cape/capeTodayPlanService.ts` — the CAPE Today plan.
4. `services/enrollmentPick.ts` — which enrollment is picked.
5. `services/explorerGrowth/explorerIdentityBridge.ts` — the nightly bridge's population.
6. `services/explorerRosterService.ts` — the Explorer population expands into the nightly scoring
   run.
7. `services/subscriptionRosterService.ts` — the subscription roster.
8. `services/subscriptionService.ts` — `needs_subscription`.
9. `services/subscriptionAnalyticsService.ts` — the analytics buckets.
10. `services/paymentReconciliationService.ts` — reconciliation's view of these rows.
11. `services/personHistoryService.ts` — the person-history title.
12. `services/timeline/feedControlService.ts` — the feed.
13. `services/reese/reeseWelcomeService.ts` — **Reese's first message changes for `/enroll`
    Explorers.**
14. `services/cohortService.ts` — **`totalEnrollments` and `pendingInvoice` on the admin dashboard
    drop** by the number of portal free accounts; `paidEnrollments` does not move.
15. `services/freeSignupService.ts` — the signup path itself.
16. `services/adminOs/conversionState.ts` — the conversion definition.

**Plus one the enumeration misfiled, disclosed anyway:** `services/portalSettingsService.ts` is
classified REPORTING, but lines 253–254 return `tier` and `enrollment_type` straight to the portal,
so **an Explorer's Settings page will read `explorer` / `guest`** where it used to read
`standard` / `member`. This is the same misfile class the enumeration already flags in bold for
`paymentSyncService`. It is listed here by judgement rather than by the scan, and the scan's
classification is left alone rather than quietly edited.

---

## H · Known gaps

1. **No registry test fails if an evidence group loses its evidence.** Named by a verifier in
   attempt 1 and still true.
2. **Several evidence groups have no test:** appointments, community, Rooms, Open House,
   affinities, visitor identity, clicks/forms, builds/projects, "current decision and next action".
3. **`trustPanel`'s `matchMethod` has a surviving mutant** — pre-existing, inherited by a verbatim
   move; the existing test exercises only the `'none'` branch.
4. **Nothing typechecks test files.** `tsc -p tsconfig.json` excludes `**/*.test.ts` and ts-jest
   runs `isolatedModules`, so a type error in a test file passes every gate.
5. **Two suites fail only under heavy parallel load** (`personViewRoles`, `evidencePackage`, and in
   the final run `responsePrivacy.phase6`) and pass in isolation. A real flake in the gate.
6. **`PersonProfilePage`'s component function is ~300 lines** against a 100-line ceiling.
7. **The `'delegates'` predicate is defeatable** by a dead literal or a type-only import. No view
   claims it today.
8. **`reconcileAppPayments` is ~213 lines** over the function ceiling, untouched by this phase.
9. **The backfill has never run.** The legacy incoherent population is unmeasured.
10. **T213's acceptance registry has named limits**, written into the file rather than left to be
    found: nine of fifteen entries name no specific mutation, which is an unmet part of the
    acceptance; S1 pins the canonical decision point rather than the `/enroll` route wiring (the
    "immediately" half is S4's); **S13 is proved by no Phase 2 task at all** — its covering test
    and production module both pre-date the phase; S14's live-write half is uncited; and an
    emptied test body, a nested indented disabled block, and a block disabled by expression are
    all undetectable by a registry.
11. **T212's guard covers person surfaces only.** A verifier's role gate in `PersonProfilePage`
    was invisible to **every required CI check** — that is a gap in the gate, not only in my
    test. A repo-wide lint for frontend authority reads would close it; this phase did not build
    one.

---

## I · Decisions needed before Phase 3

1. **Merge.** The PR needs Ali's click; nothing deploys without it.
2. **An open TWC breach on the surface this phase calls first priority, which I did not fix.**
   The repo's own banned-word gate records
   `controllers/enrollmentController.ts: [4, 'ADVERTISING: two signup-response messages say "your
   free account"']`. Lines 196–197 return *"Your free account is ready…"* and *"You already have a
   free account…"* **to a person**, and line 191 logs a **raw email address**. Both breach standing
   constraints. I left it alone because the file is not in this phase's diff, the gate assigns it
   to another component, and it is concurrently modified in another working tree — so editing it
   risks a conflict on a protected path. **This is a decision, not an oversight: say the word and
   it is a two-line copy change plus a redaction.**
3. **Whether to run the backfill**, and on what population. It is dry-run by default and reports
   rows it cannot prove either way for human decision rather than guessing.
4. **Phase 3 should not accept Person 360 as the SRS input until gaps 1, 2 and 5 are closed** —
   see question 5.

---

## J · Exact next-phase proposal

Phase 2 is **code-complete and unverified in production**. The remaining Phase 2 work, in order:

1. Open the PR (draft until green), get Ali's review and **merge click**.
2. Deploy via `DEPLOY_MODE=registry EXPECT_MARKER=… EXPECT_IN=… bash scripts/deploy-prod.sh` —
   never `--build nginx`.
3. **T216 production verification, read-only**: confirm the running release carries the commit;
   measure the real row counts by tier and type; observe the two flag values that are currently
   unknown; confirm an Explorer appears in the roster with a stage label rather than a raw enum.
4. Update §F of this checkpoint with what was observed, and `handoff.md` with numbered steps.

Only then Phase 3, which should open by closing gaps 1, 2 and 5 rather than by building the Sales
Readiness Score on an input that cannot yet be trusted.
