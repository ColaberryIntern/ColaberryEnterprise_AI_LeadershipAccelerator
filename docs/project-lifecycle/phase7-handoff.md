# Phase 7 handoff — hardening, replay testing, legacy assessment and the controlled pilot

Packets T0 through T8. Merged to `main` as **`78ba814b`** on 2026-10-17 via
[PR #3142](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3142).
**Deployed to production inside `e4ce4bb9`**, which is the merge of PR #3149 (AF8.3, a different
workstream) and carries `78ba814b` as an ancestor.

> **Corrected 2026-10-17.** This header originally read "merged as `e4ce4bb9` via PR #3142",
> conflating Phase 7's merge commit with the release SHA that happened to be deployed.
> `git diff --name-only e4ce4bb9^1 e4ce4bb9` is three files, none of them Phase 7's.

**Read this first, because it is the whole shape of the phase.** Phase 7 fixed three real
production defects, answered a measurement open since Phase 2, and built a guard, a legacy
assessment and a pilot report. **Almost none of it is reachable in production**, and that is not
a deferral — it is the honest boundary. `executeStage` has no production caller. So does
`legacyGapAssessment`. So does `pilotReport`. What Phase 7 can claim is that the three defects
are fixed in code that *does* run, and that the rest is built, tested and inert.

---

## Boundary report

| | |
|---|---|
| **What merged** | 6 production modules changed or added; 46 files, +6,238 lines including tests and docs |
| **What of PHASE 7 runs in production** | The three defect fixes only. The guard, the legacy assessment and the pilot renderer have no caller |
| **What else is in the same container** | **An authorization change that is not Phase 7's.** `e4ce4bb9` adds three `PATH_SECTION` rows in `middlewares/mgmtSectionGate.ts`, one of which moves `/api/admin/agent-domains-mine` from the `program` section to `dashboard`. It is AF8.3's work, it looks deliberate and is tested, and it is live in the same image as Phase 7. **Added 2026-10-17** after an independent verifier found the boundary report described Phase 7's contribution as though it described the release |
| **What is proven** | Three defects reproduced by test before being fixed; Risk R5 measured and answered |
| **What is NOT proven** | Anything that needs a database in CI. CI provisions no Postgres, so all seven replay-case and assessor suites self-skip on merge |

### The flag correction, which the plan got wrong

The Phase 7 plan recorded `ENABLE_PROJECT_LIFECYCLE` as absent in production and its deploy task
asserted that **both** lifecycle flags are absent. **That criterion cannot pass as written.**
Measured on the production host on 2026-10-17: `ENABLE_PROJECT_LIFECYCLE` is **`true`**, set on
2026-10-13 under DRI authorization — **though the date is unverified and may be 2026-10-14**: the run's `deployment-log.md` dates activation 10-14 and names a backup file whose own name carries `20261014`. The **value** is measured three independent ways (`printenv` by name, an anchored count in `/proc/1/environ`, and the shipped `featureFlags.js`); the **date** is not, and the host env file was deliberately not read because it holds secrets. `ENABLE_SBP_SOURCE_OVERFLOW_BLOCK` is genuinely absent.

So the new authorization guard is **not** held dark by a flag. What holds it inert is that
**`executeStage` has no non-test caller anywhere in `backend/src`** — the only non-test mention of
that module is a comment. The correction is written into `lifecycleExecution.ts:167-172` so the
next reader finds it at the code rather than here. A safety argument that rests on a flag which
is actually on is worse than no safety argument, because it reads as if someone checked.

---

## Production state, measured 2026-10-17 after the release landed

**This session did not run the deploy.** While preparing it, the deploy lock on the production
host read `HELD_BY_ANOTHER_DEPLOY` — another session had started one at 14:45:10Z for the same
merged commit, with a host build already running and 348 MB of free memory on a box with 344 OOM
kills in its kernel journal. Starting a second concurrent build would have been the exact failure
this programme has already paid for six times. So I waited for it, then verified the result, which
is the honest division: **another session deployed `e4ce4bb9`; this session proved what is in it.**

| Check | Result |
|---|---|
| Checkout on the host | `e4ce4bb9` |
| Container replaced | `3f3ed0e0` → `3fec0a9c`, created 14:51:18Z |
| **Phase 7 code present** | **Yes.** `FabricatedEvidenceError` found in `dist/services/lifecycle/legacyGapAssessment.js` |
| Backend up and routing | Yes — **`GET /health` returns 200** with a live timestamp, both in-container and through the public hostname. **Corrected 2026-10-17:** this row originally cited `/api/health` answering **401** as the proof, which it is not — an arbitrary nonexistent `/api` path returns the identical 401 body, so that 401 is an unscoped catch-all rather than a health answer |
| `ENABLE_PROJECT_LIFECYCLE` | **`true`** (confirms the plan's record was wrong) |
| `ENABLE_SBP_SOURCE_OVERFLOW_BLOCK` | **absent** (genuinely dark) |
| Lifecycle/sbp/factory errors in the logs | None |

**The marker was validated in both directions**, which is the only way its presence means
anything. Before the deploy: 0 hits, with a clean `grep` exit 1 and empty stderr, and a positive
control (`sourceBlocks`) returning 9 hits to prove the instrument worked inside that container.
After: **2 files** (`legacyGapAssessment.js` and its `.d.ts`), control 10. **Those are FILE counts** -- the instrument was `grep -rlF`, which lists files, not lines; by line the symbol appears 5 times in the module. Reported as bare "hits", the number is not reproducible by a reader who reaches for `grep -c`. An absence that was never shown to be detectable is not evidence.

**The ordering fix was verified on the shipped artifact, not the source**: in the running
container's `dist/db/ensureSbpSchema.js`, `CREATE TABLE IF NOT EXISTS build_plans` is at line 126
and `ALTER TABLE build_plans ADD COLUMN IF NOT EXISTS truth_revision` is at line 158. The ALTER
now follows the CREATE in the code that actually boots.

### Two instrument errors worth recording, because both would have been reported as facts

**A health check that could not have succeeded.** My first post-deploy probe curled
`127.0.0.1:3001/api/health` from the host and got `000` on all three paths. The container
publishes `3001/tcp` as *exposed*, not mapped to the host, so that request could never connect
regardless of application health. A `000` reported as "the backend is not answering" would have been a false outage.

**And the replacement evidence was also weak, which is the worse half of this.** I substituted "`/api/health` returns 401 from inside the container", reasoning that reaching auth middleware proves the app is routing. An independent verifier's control killed it: an arbitrary nonexistent `/api` path returns the **identical** 401 body. The valid probe is `GET /health`, which returns **200** with a live timestamp. A previous verification cycle had already established exactly this, and the correction was not carried forward — so this run shipped the same invalid probe twice after being told once.

**A false caller.** Grepping the shipped `dist` for `executeStage` returned
`growthJourney/execution/runExecutor.js`, which appeared to refute the inertness claim this whole
phase rests on. It does not: `runExecutor.ts:203` defines its **own module-private**
`executeStage(programs, asOf, flags, …)`, an unrelated function that shares a name. The only
non-test mention of `lifecycleExecution` in all of `backend/src` is a comment at
`blueprintGeneration.ts:11`. The robust form of the claim is **"no module importer"**, not "the
string appears nowhere" — a bare-name grep cannot tell a caller from a coincidence.

---

## What is now true that was not before

### Three production defects, each fixed with a test that reproduced it first

**1. A first-boot outage.** `ensureSbpSchema` ran `ALTER TABLE build_plans ADD COLUMN IF NOT
EXISTS truth_revision` *before* the `CREATE TABLE build_plans` it depends on. On a pristine
database the ALTER hit a table that did not exist yet, the column never landed, and every plan
save threw — the exact 2026-09-11 outage the statement's own comment says it exists to prevent.
The ALTER now runs after the CREATE, pinned by `__tests__/ensureSbpSchemaOrder.test.ts`, a source
scan that fails when any ALTER precedes the CREATE of a locally-created table, with a positive
control and a case proving tables owned by other modules are not flagged.

**This defect was concealed by my own test evidence.** `providerFailure.integration` passed
because I reused a container that already had the column. On a pristine database it fails 3 of 3.
A reused container is not a test environment, it is a test environment's conclusion.

**2. A non-atomic approval.** In `factoryApproval.ts`, `create` and the supersede of the prior
version were separate commits. A failure between them left **two live heads for one track**. Both
now run in one `sequelize.transaction`.

**3. A false recovery message.** `sbpOrchestrator` told responders to look for a plan that was
"drafted" when it had already been published — sending the on-call to the wrong state.

### Risk R5, open since Phase 2, is answered

**Under a true race, `factoryApproval`'s compare-and-swap cannot refuse anybody.** Both callers
read the same version, both pass `checkExpectedVersion`, and both write. The unique index is the
sole backstop. Proven by a positive control that observes **two rows** when the index is dropped,
which is the only way to show the index is what is doing the work rather than the CAS.

### Built and inert

- **An authorization guard on `executeStage`** (`lifecycleExecution.ts`). `StageAuthorization` is
  a required field, so a caller cannot omit it; authorization is checked **before any store
  read**; a refusal is a distinct `'refused'` outcome rather than a retry or a dead-letter; and
  the module throws `ContractViolation` at runtime when authorization is absent regardless of the
  flag. 28 tests, including a non-disclosure test that scans every refusal message against the
  full stage list and asserts no other stage name and no gap kind leaks.
- **A read-only legacy assessment** (`legacyGapAssessment.ts`). Enumerates projects with no
  lifecycle row, and previews a migration that **writes nothing**. `FABRICABLE` holds exactly one
  entry; everything else is `NEVER_FABRICABLE` with a written reason, and `assertNoFabrication`
  fails closed on anything it has not been told about — including the empty string.
- **A pilot report renderer** (`pilot/pilotReport.ts`) and `pilot-results.md`, with a check that
  refuses comparison percentages.

---

## What Phase 7 does NOT do

- **It does not make the lifecycle gate turn.** No project moved a stage.
- **It does not give stage failures anywhere to go.** No production `ExecutionStore` exists, so
  the dead-letter path cannot record anything in production even once a caller exists.
- **It does not enforce a role at approval time.** `approved_by_role` is written and read by
  nobody. LC-10 stays PARTIAL for this reason.
- **It does not fix the prompt-injection vector it found.** A decision is owed; see below.
- **It does not measure the document half of source overflow.** `document` is not a
  `build_intake` column, so `MAX_DOCUMENT_CHARS` has no source to measure and needs instrumenting
  at the request boundary.

---

## Carried forward to Phase 8, with the reason each one was not fixed here

### 1. A DECISION IS OWED: `delimited()` interpolates untrusted bodies raw

In **both** prompt builders, a body containing its own `</TAG>` closes the block early, and
everything after it sits outside any delimiter — the position the SAFE-002 instruction explicitly
does not cover. Every pre-existing delimiter assertion still passes against such a prompt,
because a forged close tag **adds** a delimiter rather than removing the real one.

Measured at **0 of 48** stored briefs on the path that could be measured. The honest statement is
"latent in the measured half of one of the two affected call paths": the factory half takes its
bodies from OOXML and proposal extraction, where a stray angle bracket is *more* likely, not less.
A one-line neutralisation is written out and measured at 0 of 48 briefs rendering differently.
Not applied, because changing prompt construction on a live student path is the DRI's call, and
because the current behaviour is pinned by tests — applying the fix makes 2 tests fail by design,
which is the tripwire that proves the pin is real.

### 2. The all-workspace detector — NOT DONE, for the second phase running

Phase 6 asked for *either* a check that detects the all-workspace answer *or* a written reason it
cannot be detected. `plan-phase7.md` promised it as a corpus case and it did not ship.
`grep -rn "all-workspace\|allWorkspace\|all_workspace" backend/src` returns nothing. **Neither
half was delivered** — not the check, and not the written reason. Recorded as undone rather than
let drift a third time.

### 3. `github_connections` has no idempotent DDL anywhere

`grep -rn "CREATE TABLE IF NOT EXISTS github_connections" backend/src` returns nothing. The table
exists only as a Sequelize model, and `sequelize.sync` is gated behind `DB_BOOT_SYNC`, off by
default. On a genuinely pristine database the table is never created and `assertSbpSchema` reports
`github_connections.webhook_secret` missing forever. **Moving an ALTER cannot fix this** — it is
missing DDL, not an ordering bug. Found while fixing the ordering bug beside it.

### 4. The build re-entry guard has no expiry

`sbpOrchestrator.ts:195-199` refuses a second start while `status === 'generating'`, and the only
thing that clears that status is `recoverStrandedBuilds`, which runs **once at boot**. There is no
age filter, lease, deadline or heartbeat column. A build whose generation dies without the process
dying stays `generating` indefinitely and every retry is refused **until somebody deploys**.

This is fail-closed, which is the right direction, and it is deliberate — the orchestrator calls
the sweep "the recovery, not a retry". But the recovery path for one stuck student is a service
restart. Pinned by a test that backdates a row 30 days and asserts against `information_schema`
that no deadline-shaped column exists.

### 5. The factory prompt drops source blocks silently

`factoryDecomposePrompt.ts:122-126` slices to `MAX_BLOCKS` and `MAX_BLOCK_CHARS` with no label,
while `coversRequirementBlocks` returns true anyway because it checks the ids named in the
instruction line, which sits outside every `delimited()` call. `plan-phase7.md` assigned this to
T1.3 and said "both need the same answer"; T1.3 changed only the SBP path.

### 6. Source overflow is built, measured, and OFF

Measured on production 2026-10-16 with the **shipped `buildBriefText`** over the stored
`build_intake` rows rather than a SQL approximation: 48 rows (the entire corpus), p50 5,737,
**p90 27,772**, max 41,679, and **11 of 48 over the 20,000 cap**. p90 sits above the cap, so this
is not a tail event — roughly a quarter of real student briefs are clipped today and the largest
is more than double the budget. The blocking gate exists behind
`ENABLE_SBP_SOURCE_OVERFLOW_BLOCK`, inside `sourceBlocks()` so both **SBP** generation stages reach it. **Clarified 2026-10-17:** "both generation stages" meant both SBP stages. The factory path has its own ungated slicing at `factoryDecomposePrompt.ts` and no gated `sourceBlocks`, which is carried item 5 — a reader who did not already know that would read "both" as covering the factory half too.
**Turning it on refuses 11 of 48 builds that succeed today** — a real change on a live student
path, and the DRI's call.

### 7. Six locks are "covered" only by asserting their SQL contains `FOR UPDATE`

`resource_leases` — the closest structural analogue to what `lifecycleExecution` lacks — has no
race test at all. The others: the execution-run claim, the room outbox, the scheduler claim, the
enrollment row lock, the telemetry anchor. A test that asserts the text of a query is not a test
that two callers cannot both win.

### 8. CI provisions no Postgres, so Phase 7's integration tier never runs on merge

`.github/workflows/ci.yml` sets no `DATABASE_URL` and starts no service container, so every
database-backed suite self-skips — including all seven replay-case and assessor suites. These are
**visible** skips that print their reason, so this is not the hidden-skipped-test the phase exit
forbids; it is the structural version. **A future merge cannot regress any of it.** "All required
checks green" is a statement about the unit tier only.

As part of T6, three pre-existing suites that skipped in **silence** were given skip notices. A
suite that skips silently is indistinguishable from one that passed.

### 9. One line would arm the story-authorization gate

`decomposeService.ts:141` reads `if (opts.projectId)`, and **none of the three non-test
`decomposeBuild` call sites passes one.** `sbpOrchestrator.ts` is the sharp case: it has
`input.projectId` in scope at lines 195-202 and still calls `decomposeBuild({ brief, document,
targets, correlationId })` at line 286 without it. The gate is armed and unreachable. **And it must not be done yet.** 62 production student projects predate the registration hook and hold no lifecycle row, so arming the gate refuses **every legacy student build** on the next deploy — `storyAuthorization.ts` warns about exactly this in its own header, and the run's `deployment-log.md` records it. Arming it needs either an approved blueprint through the product first or the same `LIVE_SINCE` cutoff treatment the registration check already uses. “One line” describes the edit, not the change. This is
Phase 8's P8-T4 and is already recorded in `phase8-handoff.md`; it is repeated here because the
acceptance matrix's LC-01 row reads `✅ Authorization enforced` on the strength of that gate.

### 10. The deploy script's own bar for registry mode was met and never acted on

`scripts/deploy-prod.sh` records a DRI decision of 2026-09-10 keeping `DEPLOY_MODE=registry`
opt-in, with a checkable bar: flip the default "once that log shows at least 5 successful registry
deploys spanning at least 14 days", six counting its own deliberate exclusion. Measured
2026-10-17: `/var/log/colaberry-registry-deploys.log` holds **130 entries spanning 2026-09-16 to
2026-10-16**, about 30 days. **The bar is met roughly twenty times over and the default is still
`build`.** This matters because building on the production host is the largest recurring memory
spike on a box that also runs five Postgres instances, with 344 OOM kills in the kernel journal.
Flipping a deploy default is infrastructure and therefore the DRI's call, not mine — recorded
rather than done.

---

## A correction the final matrix must carry

**Do not write "16 of 18".** `acceptance-evidence.md` holds rows for exactly four IDs — LC-01,
LC-08, LC-09, LC-14 — of which one is recorded met and three partial, and it says in its own words
that the other fourteen "are not written here". The figure originated as shorthand for *two IDs
are carried open* and was written into the Phase 7 session log three times as though it meant
*sixteen are evidenced*. Phase 5 refused exactly this: *"Sixteen of the eighteen are not evidenced
by Phase 5. That is the honest number."*

---

## How Phase 7 was verified

```bash
# Full backend gate, on the reviewed head.
# 32,925 passed · 3 failed · 1,995 of 2,026 suites · 447s
npx jest --config backend/jest.config.js

# The 3 failures are the pre-existing environmental baseline, identical in
# composition to the independently-measured one: adm-zip, pdfkit, and a Windows
# CRLF byte-identity test. None in the lifecycle, sbp or factory trees.

# Typecheck. Not `npx tsc` -- that resolves a stale 4.9.5 in this tree.
# Backend: 4 errors, all TS2307 'playwright', the pre-existing local baseline.
# Frontend: CLEAN.

# Required status checks, measured from the API rather than counted off a PR page.
gh api repos/:owner/:repo/branches/main/protection \
  --jq '.required_status_checks.contexts'
# Exactly five: Backend typecheck · Backend unit tests ·
# Secret scan + route-auth lint · Frontend build · Frontend typecheck
```

`execution-contract.md` recorded **four** required checks and listed `Frontend build` as
non-required. Both were wrong and are corrected in place, with the command recorded so the next
reader re-runs it rather than believing the sentence. Counting green ticks on a PR page conflates
check *runs* with required *contexts*, which is how an earlier cycle arrived at nine.

Every packet was graded by an independent verifier: T1.1, T1.2, T1.3, T2, T3, T4 and T5 all
passed, two of them after failing first. **No packet graded its own work.**

---

## What the owner has to do

Nothing is required to keep production working. These are the decisions Phase 7 surfaced and
could not make.

1. **Decide the prompt-injection fix** (carried item 1). The one-line neutralisation is written
   and measured; applying it is a change to prompt construction on a live student path.
2. **Decide whether to turn on `ENABLE_SBP_SOURCE_OVERFLOW_BLOCK`** (carried item 6). It refuses
   11 of 48 builds that succeed today. The alternative is that roughly a quarter of student briefs
   keep being silently clipped.
3. **Decide whether to flip `DEPLOY_MODE`'s default to `registry`** (carried item 10). The bar
   written into the script has been met about twenty times over.

### If you want to see the concurrency refusal yourself

The compare-and-swap refusal is reachable over HTTP and returns **409** with the current version,
so a UI can refresh rather than retry blind:

```
POST /api/admin/factory/contract/<deliveryProjectId>/approve
body: { "trackType": "...", "expectedVersion": 1, "level": "documented",
        "enrichmentStatus": "pending" }
```

Send it twice with the same `expectedVersion`. The second returns `409` and the real
`currentVersion`.

**This is not a tokenless paste.** The route is behind `requireSection('program')`, so it needs an
admin session — the practical way is to log into the admin portal and copy the bearer token from
the browser's network tab. If that is more friction than it is worth, the same refusal is covered
by the replay suite, and the R5 positive control is the stronger evidence anyway: it observes two
rows appearing when the unique index is dropped.
