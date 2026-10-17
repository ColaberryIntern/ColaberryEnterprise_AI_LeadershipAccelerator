# Acceptance evidence: LC-01 … LC-18

**Created:** 2026-10-06 by Phase 4 (P4-T6) · **Session:** CC-20261001-q7m4
**Phase 8 owns the completed table. Each phase appends its own rows as it finishes.**

## Why this file exists now rather than in Phase 8

`execution-contract.md:103` requires all eighteen LC acceptance IDs to be evidenced here, and no
task owned the file. `architecture.md` recorded it as *"NOT YET CREATED; Phase 8 owns it"* — a
committed decision, not an oversight, and creating the file silently would have contradicted it.

The reconciliation, rather than overriding one source with the other: **Phase 8 still owns the
completed table; each phase appends its own rows as it finishes.** Phase 8 assembling eight
phases of evidence at the end would mean reconstructing it from memory, which is precisely the
stale-record failure that has cost this run verifier points more than once. So Phase 4 creates
the file, writes only its own two rows, and `architecture.md` is updated to say so.

**The rows owed by Phases 1–3 are a known gap, recorded in `carried-forward-obligations.md`
rather than backfilled here.** Writing them now would mean inventing evidence from a plan that
did not measure them, which is the opposite of what this table is for.

## What counts as evidence in this table

A command that was run, with its result, or a file:line that can be opened. Not a claim that
something was done. Where a row is partial, it says which half is missing — an honest partial row
is useful and a confident whole one that is half true is not.

---

## Rows written by Phase 4

### LC-08 — Every task maps to a justified human surface/action or explicit background operation

| | |
|---|---|
| **Status** | **Met, with a stated limit** |
| **Implementation** | `backend/src/services/lifecycle/generation/workspaceMapping.ts` (`validateTaskSurfaces`), vocabulary in `workspaceBindingTypes.ts`, checks in `workspaceBindingChecks.ts` |
| **Mechanism** | A business task resolves to EXACTLY ONE of `{ kind: 'workspace', ref }` or `{ kind: 'headless', reason }`. No default and no third state: a default would mean an unconsidered task acquires a position nobody chose. `headless` takes one of five enumerated reasons, never free text. |
| **"Justified" is enforced, not asked for** | A proposed screen carries a primary human job, intended roles, records, supported decisions, `whyNotExisting`, requirement/task links, audience, permission views, a deep link, and `preservesNavigationState`. Each is a named refusal. |
| **Evidence** | `__tests__/workspaceMapping.test.ts`, run with `node ../node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/services/lifecycle/generation/__tests__/workspaceMapping.test.ts` from `backend/`. Every refusal code is paired with a passing counterpart, and a seeded generator over a keyspace **derived from the source files** asserts no `JSON.parse`-producible value throws in any claimed position, with a **per-position** reach control that NAMES any position it cannot reach. |
| **Mutation-proven** | Each refusal code was deleted individually and the named failing test recorded; source restored from a byte-compared backup each time. |
| **Honest limit** | A workspace binding proves a human *interacts* somewhere. It does **not** prove the task produces user-visible output chained to the rest of the workflow — an ingestion task bound to an "Imports" admin screen satisfies it. Stronger than the regex this replaced, weaker than "proves a workflow". The stronger guarantee needs Phase 6's release-level view and is in the register as such. |
| **Not established** | That the running surface enforces the permission views it declares. That is a route-authorisation question for the phase that builds the routes. |

### LC-09 — Interactive design and human controls exist before authorized implementation planning

| | |
|---|---|
| **Status** | **Partially met — the gate is real; "interactive" is DECLARED, not rendered** |
| **Design alternatives** | `designAlternatives.ts` projects the process graph and LC-08's bindings onto the three patterns §4.5 names, with **no model call**. The comparator is structural: the fingerprint reads task ids and navigation depth and deliberately not workspace ids, slot ids or titles, so renaming every label does not make two options "genuinely different". |
| **Selection** | `designSelection.ts` records the chosen variant and the visual-contract revision as `<alternativeId>@vc<revision>`, because §4.5 requires the approval to reference both and a ref carrying only the variant would let the contract move underneath an approval. |
| **The gate** | `selectedDesignRef` is what clears `design_variant_not_selected` in `lifecyclePrerequisites.ts`, which **blocks** (it is not in `ADVISORY_RULES`). `selectDesign` returns `selected: null` whenever any issue is raised, so a caller cannot read a ref out of a refused selection. |
| **Human controls** | `controlSpecification.ts` makes "we have a policy" and "the policy is enforced" two separately checkable claims. An `enforced` claim with no named call site is refused; a control with no enforcement point is `unavailable` and cannot be shown as working. |
| **Surface states** | `workspaceStateChecks.ts` requires an empty, a loading and an error state per workspace, each with a non-blank label from a contrast allow-list measured at WCAG AA, plus keyboard reachability of every declared action checked in both directions. |
| **Persistence** | `blueprint_design_decisions` and `blueprint_visual_contracts`, with Sequelize models, bound to the blueprint revision. Round-tripped through the models against a real Postgres 16; the partial `WHERE status = 'approved'` index, the revision index and **all three** CHECK constraints proven by writes that were refused, each assertion naming the constraint that fired — and **one isolating control per operand** of the two compound CHECKs, each mutation-proven on a fresh database. (This row first said "both", which was the miscount that concealed an untested compound guard.) |
| **Evidence** | `__tests__/designAlternatives.test.ts`, `designSelection.test.ts`, `controlSpecification.test.ts`, `workspaceStateChecks.test.ts` — 15 suites, 635 tests, serially. `designPersistence.test.ts` with `DATABASE_URL` set against a throwaway Postgres; it **skips visibly** without one. `node scripts/checkTokenContrast.js` for the contrast figures. |
| **Honest limit — the load-bearing one** | **A journey here is a DECLARED path over a structure, not a rendered interaction.** Nothing clicks anything, and there is no surface until Phase 5. §4.5 says itself that "a screenshot or matching domain vocabulary alone does not establish usability"; a declared journey does not either. What it does is make the claim checkable and name the gap instead of leaving "can be demonstrated" as an untested sentence. |
| **Not established** | That a human can actually operate any of it. Screenshots, real responsive behaviour and verified interactions need the surface Phase 5 builds, and are deferred with reasons in the register. |
| **Also not established** | That selecting or revising a design invalidates the right approvals. Deferred with its three parts named in the register, because nothing in production writes `manifest.refs_json` and no material-vs-cosmetic classifier exists — the dependency does not exist to build on. |

---


## Rows written by Phase 5

Phase 5 **strengthens LC-08** and evidences **LC-14 in part**. It claims nothing else. LC-10 and
LC-11 were withdrawn mid-phase and are recorded in `phase5-handoff.md` with what they would have
delivered; LC-12 and LC-15 were never Phase 5's.

Everything below is **LOCAL and on a PR**. Nothing is deployed and the feature is not activated —
`ENABLE_PROJECT_LIFECYCLE` stays unset and every route answers `409 { lifecycleDisabled: true }`.

### LC-08 — amended: the route-authorisation half Phase 4 deferred

Phase 4's row above closes with *"Not established: that the running surface enforces the
permission views it declares. That is a route-authorisation question for the phase that builds
the routes."* Phase 5 is that phase, and this row records only the part it actually closed.

| | |
|---|---|
| **Status** | **Strengthened. The surface exists and enforces per route; "proves a workflow" is still not claimed.** |
| **The surface** | `frontend/src/routes/lifecycleRoutes.tsx` mounted at `adminRoutes.tsx:303`, path `/admin/project-lifecycle/:projectId`. A test resolves the real route tree rather than asserting the file exists, because a component under `pages/` can sit unrouted and look finished — this repo has shipped that. |
| **Linked views** | `services/lifecycle/linkedViews.ts`. Six view kinds taken from the request's own sentence and asserted BOTH ways against the registry; every ref collection is bound to a view or listed as excluded with a reason, so a collection added later and bound to neither fails a test rather than becoming a record no screen can show. The keyspace comes from `diffableCollections()`, the same derived walk the revision diff uses, so the views and the diff cannot disagree about what collections exist. |
| **Enforcement is per ROUTE, not per file** | `projectLifecycleRoutes.test.ts` parses the route list out of the source of both route files and sweeps it: every route 409s with the flag off, guards balance per route, and every handler maps a tenancy denial to the guard's own status. A hand-written list of cases cannot fail for a route nobody added to it — the same blind spot `lint-route-auth` has one level up, where a single guard name anywhere in a file satisfies it. |
| **Visible actions agree with server permissions** | `readLifecycleStatus` serves `permittedActions`, computed from the caller's own role, and the page offers the change-request panel only when it appears there. Before this it was offered to every viewer and an observer's submit came back 403. A client-side copy of the role table would be a second definition of the grant table, and the drift is exactly that bug. |
| **Evidence** | 208 backend tests across 6 suites and 75 frontend tests across 4; commands and counts in `phase5-handoff.md`. 15 mutations on the traversal join predicate with zero survivors and the target restored byte-identical. |
| **Honest limit, unchanged** | A linked view proves the records a reviewer can reach. It still does **not** prove the task produces user-visible output chained through the workflow. Phase 4's limit stands. |
| **A limit Phase 5 ADDED, measured** | **Three of the six views can show nothing today.** `surfaces`, `policies` and `designDecisions` are written by neither adapter — proven by a test that runs both real adapters and asserts which collections come back populated. The empty state names that cause rather than implying the project has no records. |
| **Not established** | That a human has operated it. No screenshots and no visual narrow-width check; see the handoff's deferral index, items 5 and 6. |

### LC-14 — cross-tenant access, forged approvals, direct API bypass and worker bypass are refused

| | |
|---|---|
| **Status** | **PARTIAL — three of four clauses evidenced. The fourth has no path to test and carries a falsifiable tripwire instead.** |
| **Cross-tenant read refused** | Asserted per route over a source-derived route list: every handler maps a tenancy denial to the guard's own status, with one documented exception (`/compose` is pure and cannot raise it). The exception has a POSITIVE CONTROL asserting `/compose` IS flagged when it is removed, because the first version of that sweep could be satisfied by the handler's own COMMENT containing the string. |
| **Forged approval refused** | The approver comes from the authenticated session and `approveBody` declares no field for it, so a body carrying `approvedBy`/`approver`/`approvedByIdentityId` cannot reach the service. Asserted both behaviourally (the forged fields do not survive into the service call, and the recorded approver is the session's) and on the schema. |
| **Direct API bypass refused** | Every route, derived from source, answers `409 { lifecycleDisabled: true }` with the flag off before any validation runs; `requireSection` balances per route in both route files. |
| **Worker bypass — NOT EVIDENCED, and why** | **There is no worker path in this repo to bypass.** `approveLifecycleBlueprint` has exactly one caller, the HTTP route, and that route already runs `requireSection`, the flag check and `loadAndAuthorize(…, 'write')`. A test asserting a nonexistent job cannot reach approval is a test that cannot fail. |
| **The tripwire that stands in for it** | A test asserts the set of non-test modules referencing `approveLifecycleBlueprint` is EXACTLY the definition and the one route, derived by walking the tree rather than hand-listed — so **adding a worker path later fails this test** until its checks are written. **Proven to trip:** a synthetic worker importing the symbol was written into the tree, the tripwire failed by name, the file was removed, `git status` matched before and after, and the post-restore run was green. |
| **What the tripwire does NOT catch** | A computed access (`mod['approve' + 'LifecycleBlueprint']`), or a worker calling the route over HTTP. The second is not a bypass — that path runs the guard. So only deliberate concealment escapes. |
| **Owner of the missing clause** | **P6-T1** — *"entry-point matrix tests prove no alternate route/job publishes an authorized plan without the blueprint"*. |
| **Why this is recorded as partial rather than claimed whole** | An earlier plan cycle asserted three clauses and claimed the ID anyway; the next over-corrected by adding a worker-bypass acceptance item for a worker that does not exist. Both came from wanting the table to look complete. A partially evidenced ID recorded as partial is worth more than a fully claimed one resting on an unfalsifiable test. |

---

## Row written 2026-10-14 for backbone task B6

### LC-01 — No new-project path can bypass lifecycle registration or plan authorization

| | |
|---|---|
| **Status** | **Partial, and the partial half is named.** Registration cannot be bypassed on either consumer, and that is proven. *Enforcement* — something refusing work when the lifecycle says no — exists on the student path only. |
| **Why it is written now** | B6 in `backbone-adoption.md`. LC-01 was satisfied by the student path alone, and both of this programme's real consumers needed naming with their own evidence. Both builds were paused waiting on this one, so "which of my two pipelines is actually on the backbone" is a question the table has to answer rather than imply. |

#### The two consumers, and what is true of each

| Consumer | Registration wired | Registration **proven in production** | Authorization enforced |
|---|---|---|---|
| 🏭 **Project Factory** — 10 agent domains, student projects | ✅ `Project` model `afterCreate` | ✅ all ten hold exactly one `project_lifecycle_states` row, stage `discovery`, created 2026-10-13 14:03Z, 0 duplicates / 0 orphans / 0 tenant mismatches | ⚠️ **Armed, and unreachable.** `storyAuthorization.ts` does refuse story work, and `decomposeService.ts:141` consults it — but that call is guarded by `if (opts.projectId)` and **none of the three non-test `decomposeBuild` call sites passes one**. `sbpOrchestrator.ts` is the sharp case: it holds `input.projectId` in scope at lines 195-202 and omits it at line 286. **Amended by Phase 7, 2026-10-17.** This cell read ✅ while `phase8-handoff.md` recorded ❌ for the same gate; the cross was the correct one |
| 🏛️ **Gov contracts** — delivery projects | ✅ `models/DeliveryProject.ts:174` `afterCreate: deliveryProjectLifecycleHook`; `services/factory/govDeliveryProject.ts:134` creates through that model | ❌ **never fired.** Zero delivery projects created since the hook shipped 2026-10-09. The path is real and has no production evidence | ❌ **no delivery-side equivalent of `storyAuthorizationFor` exists.** Nothing in the gov build path refuses work because a lifecycle row is missing |

**That last cell is the honest cost of this row.** A delivery project registers and then nothing
consults the registration. The forward obligation is recorded in
`carried-forward-obligations.md`: when a delivery-side enforcement gate is built it must apply
`LIFECYCLE_REGISTRATION_LIVE_SINCE` the way `storyAuthorization.ts` applies
`STUDENT_REGISTRATION_LIVE_SINCE`, or its first deploy refuses all four legacy delivery projects,
two of which are live government work.

#### Evidence for the bypass claim

| Claim | How it is established |
|---|---|
| The creation-site set is **derived, not listed** | `__tests__/lifecycleRegistrationCoverage.test.ts` reads the source tree on every run and fails when a site appears that is not accounted for. It exists because a hand-written list *was* wrong within a week: the three "natural chokepoints" named in the discovery record covered 5 of 7 sites as enumerated, and the one they missed — `govDeliveryProject.ts` — landed three days after the inventory and was live in production creating ungoverned projects |
| It reads files rather than shelling out to grep | Three `.ts` files under `backend/src` carry deliberate, load-bearing NUL bytes, including `factory/factoryApproval.ts`. Plain `grep -r` reports them binary and **skips the matching lines**, so a sweep using it reports completeness it does not have |
| Every creation path goes through a hook-carrying model | Enumerating sweep, 2026-10-14 (B5): **4 student sites** (`agentDomainProvisioner.ts:209`, `businessProcessSeedService.ts:135`, `projectService.ts:67`, all via `Project`) and **5 delivery sites** (`delivery/leadConversion.ts:175`, `factory/govDeliveryProject.ts:134`, three seed scripts, all via `DeliveryProject`). `ops/bcSyncService.ts:288` looked like a fifth student site and is not — `OpsBcProject` maps to `ops_bc_projects`, a different table |
| The mechanisms a model hook **cannot** see are tripwired | Asserted across all of `backend/src`: no `bulkCreate` or `upsert` on either identity model (`bulkCreate` does not fire per-row `afterCreate`), no raw `INSERT` into either identity table, no `queryInterface.bulkInsert`, and no `hooks: false` anywhere — which would disable registration one site at a time |
| Exactly one model owns each table | Both declare the hook. Two models over one table would make the hook a convention rather than a chokepoint |
| The detector has a production caller | `systemHealthService.checkLifecycleRegistration`, registered in `runFullSystemHealthCheck`, so both bypass detectors run whenever anyone opens `/health/full`. Before 2026-10-14 they were called from **tests only** — a detector nobody runs cannot detect anything. 6 tests, 5 mutations each RED including an **unwired-from-the-orchestrator** mutation, which is the one that counts because being unwired is the defect it closes |
| The cutoff protecting the 66 legacy rows is itself tested | `__tests__/registrationCutoff.test.ts`, 6 tests, 5 mutations each RED. The pre-existing assertion was `LIVE_SINCE instanceof Date` — a **type** check that a constant pointing at 1970 would have passed. Both dates are now pinned to literals, asserted as lower bounds, and asserted overridable |

#### What this row deliberately does not claim

- **Not that the lifecycle gate turns.** Registration is not movement. Stage 2 of 13 became
  passable on 2026-10-14, and on 2026-10-15 `/compose` began writing the manifest its
  prerequisites read — so the machinery is complete and proven end to end in test. **No project
  has actually moved**, because that needs a real blueprint composed by a human rather than
  content invented to make a record look complete. See B3 in `backbone-adoption.md`.
- **Not that the 14 entry points in `entry-point-matrix.md` are each individually exercised.**
  The derived sweep covers the nine paths that *create a project row*. The matrix's fourteen are
  entry points that could *publish an authorized plan*, which is the clause LC-14's row records
  as owned by P6-T1.
- **Not that the legacy rows are governed.** 4 delivery and 62 student projects predate their
  hooks and hold no lifecycle row. The DRI decided on 2026-10-14 not to backfill them; they are
  legacy and out of scope, which is a decision recorded in B2, not a gap this row closes.

---

## Rows written by Phase 7

### None. Phase 7 claims no acceptance ID, and the reason is the finding.

Phase 7 fixed three production defects, answered Risk R5, and built an authorization guard, a
legacy assessment and a pilot report. **It evidences no new LC ID, because every enforcement
mechanism it built is unreachable in production.**

| What Phase 7 built | Why it evidences nothing here |
|---|---|
| Authorization guard on `executeStage` — refuses a foreign tenant, an illegal transition and unmet prerequisites before any store read; 28 tests | **No module importer.** The only non-test mention of `lifecycleExecution` in all of `backend/src` is a comment at `blueprintGeneration.ts:11`. A guard nothing calls refuses nothing |
| `legacyGapAssessment.ts` — read-only, previews a migration that writes nothing | No production caller. Its opt-in preview has no surface to opt in from |
| `pilot/pilotReport.ts` — the pilot renderer | No production caller. Compiled into `dist/` while its only consumer sits under `__tests__/`, which the build excludes, so in a container it is dead code by construction |

**Why this is a row and not an omission.** An earlier draft of the Phase 7 log recorded "16 of 18"
three times, as though sixteen IDs were evidenced. They are not: this table holds rows for four
IDs — LC-01, LC-08, LC-09 and LC-14 — one met and three partial. The figure began as shorthand
for *two IDs are carried open* and drifted into meaning its opposite. Phase 5 refused exactly this:
*"Sixteen of the eighteen are not evidenced by Phase 5. That is the honest number."*

**What Phase 7 adds to rows that already exist**, without changing their status:

- **LC-01** — the enforcement cell above is amended from ✅ to ⚠️. One line in
  `sbpOrchestrator.ts` would arm it; that line is Phase 8's P8-T4.
- **LC-10 stays unwritten, and now has a measured reason.** `approvedByRole` is written to a
  nullable column at `blueprintApproval.ts:238` and `git grep approved_by_role` outside tests
  returns only the DDL, the model, the input type and that one assignment. **Nothing reads it.**
  LC-10's "authorized human" limb is bound by *recording*, not by *enforcement*.
- **LC-14** — unchanged. The new guard refuses foreign tenants in code, and the clause is about
  production refusal. Writing it up on the strength of an uncalled module is precisely what this
  table exists to prevent.

---

## Rows owed by other phases

LC-01 … LC-07, LC-10 … LC-13 and LC-15 … LC-18 are not written here. **LC-01 to LC-07 and LC-13
are owed retroactively by Phases 1–3** and recorded as a gap in `carried-forward-obligations.md`;
the rest belong to the phases that have not run yet.

**Amended 2026-10-08 by Phase 5.** LC-14 now has a row above, marked PARTIAL: three of its four
clauses are evidenced and the fourth carries a falsifiable tripwire, with the clause itself owned
by P6-T1. LC-08's row is amended rather than replaced. **LC-10 and LC-11 are still not written
here, and that is now a withdrawal rather than a wait** — Phase 5 had claimed them and dropped
them when P5-T1.3's evidence failed five gradings. `phase5-handoff.md` records what they would
have delivered and what ships regardless. An empty row is the correct state for work that has
not happened, and filling one in from a plan rather than a measurement is how this table would
become the thing it exists to prevent.

**Amended 2026-10-17 by Phase 7.** Phase 7 writes no new row and says so above. It amends LC-01's
enforcement cell from ✅ to ⚠️ on a measurement, and records the reason LC-10 cannot be
written: no role is compared at approval time. A phase that built three modules and claims no
acceptance ID is the expected outcome when what it built has no caller — the alternative is a
table that credits code nothing runs.
