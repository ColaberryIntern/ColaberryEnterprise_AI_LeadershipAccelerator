# Backbone adoption — the register that says who is actually on the lifecycle

**Why this file exists.** Two builds were paused waiting for this one: the government contracts
pipeline and the Project Factory's ten agent domains. The owner's question on 2026-10-14 was the
right one — *can I be sure what I am building in those two projects is connected to this process?*
— and the honest answer was **"one yes, one not yet proven"**. That is not something to hold in
anybody's head. It is a register with measurable exits.

**The rule this encodes:** the lifecycle is the backbone. A project-creating path that does not
register a lifecycle row is a bypass, not an exception. This programme's acceptance ID **LC-01**
says a new-project path "cannot bypass plan authorization", and these tasks are how that gets
proven for each consumer rather than assumed.

---

> **This register was written twice, in parallel, and reconciled on 2026-10-15.** The gov
> verification ran in its own tab and created this file on `main`; the lifecycle build created it
> on `workstream/project-lifecycle-phase7`. Git saw an add/add conflict. Neither copy was a
> superset — one held a production proof of B1 and the delivery-half commands, the other held B2,
> B3, B4, B5's student half and B6 — so both were merged rather than one chosen. Nothing was
> dropped; where the two disagreed, the later measurement wins and says so.

## Where each consumer stands, measured 2026-10-14

| Consumer | Wired? | Proven in production? | Evidence |
|---|---|---|---|
| 🏭 **Project Factory** (10 agent domains) | ✅ | ✅ | All ten domains hold exactly one `project_lifecycle_states` row each, stage `discovery`, created 2026-10-13 14:03Z. 0 duplicates, 0 orphans, 0 tenant mismatches |
| 🏛️ **Gov contracts** (delivery projects) | ✅ | ✅ **proven 2026-10-14** | The delivery hook fired in production for the first time. A sandbox project created through the real `DeliveryProject` model — the exact hook-carrying path `govDeliveryProject.ts:134` uses — left **exactly one** `project_lifecycle_states` row: stage `discovery`, `tenant_id` matching, `entry_point` `delivery_project.afterCreate`. Created, verified, then removed; baseline restored to 4 projects / 0 delivery lifecycle rows. Full query + output in **B1** below |
| Legacy delivery projects | — | n/a | 4 rows, 2 of them `government_public_sector`, created 2026-09-21 → 2026-09-28. All predate the hook (2026-10-09). None has a lifecycle row. **Measured 2026-10-14: all four are at delivery status `building`, not `discovery`** — see **B2** |
| Legacy student projects | — | n/a | 62 rows predating the student hook (2026-10-12). None has a lifecycle row. Covered by `legacy_compatibility` in the story gate |

**The difference that matters:** "wired" means the code path exists. "Proven" means it ran in
production and left evidence. The Factory is both. Gov is only the first.

---

## The tasks. This project is not complete until every one of these passes.

### B1 — Prove a NEW gov delivery project registers 🏛️  ✅ PASS (2026-10-14)

**Why:** the delivery hook had never fired in production. A hook that has never run is a claim.

**Pass condition.** A delivery project created through the real gov path
(`govDeliveryProject.ts`, not a test double) holds **exactly one** `project_lifecycle_states` row
with `delivery_project_id` set, `tenant_id` matching the project, and stage `discovery` — verified
by a read-only query naming the project id, with the query and its output recorded.

**What was done.** `govDeliveryProject.ts` registers nothing itself — it relies entirely on the
`afterCreate` hook on the `DeliveryProject` model (`DeliveryProject.ts:174`). So the honest test
drives that same model, inside a transaction, exactly as `ensureGovTwoTrackProject` does at
`govDeliveryProject.ts:134`. Per the instruction, a **clearly-labelled `sandbox` project** was
used rather than a fabricated government one (two existing rows already use `project_class`
`sandbox`). No test double, no stubbed hook: the production model ran against the production
database (`docker exec accelerator-db psql -U accelerator -d accelerator_prod`).

**Verbatim result — create + verify (ran through the compiled model in `accelerator-backend`):**

```
{"timestamp":"2026-10-14T14:14:13.506Z","level":"info","service":"backend","event":"project_lifecycle_registered","outcome":"success","delivery_project_id":"b2aee34b-e47e-4ed5-8f7a-005a78fbd7a7","tenant_id":"a1ccf4d3-74a3-4b98-b4dd-ba0087efd924","entry_point":"delivery_project.afterCreate","created":true}
CREATED_DELIVERY_PROJECT_ID=b2aee34b-e47e-4ed5-8f7a-005a78fbd7a7
SANDBOX_SLUG=lifecycle-verify-b1-1791987253420
---
QUERY: SELECT id, tenant_id, delivery_project_id, stage, entry_point, created_at
       FROM project_lifecycle_states WHERE delivery_project_id = 'b2aee34b-e47e-4ed5-8f7a-005a78fbd7a7';
---
ROW_COUNT=1
[
  {
    "id": "04a6052b-abcf-4e73-b16c-e0b3c39ab98d",
    "tenant_id": "a1ccf4d3-74a3-4b98-b4dd-ba0087efd924",
    "delivery_project_id": "b2aee34b-e47e-4ed5-8f7a-005a78fbd7a7",
    "stage": "discovery",
    "entry_point": "delivery_project.afterCreate",
    "created_at": "2026-10-14T14:14:13.490Z"
  }
]
---CHECKS---
exactly_one_row: true
delivery_project_id_matches: true
tenant_id_matches: true
stage_is_discovery: true
```

**Verbatim result — cleanup (the test rows removed, baseline restored):**

```
=== CLEANUP: delete the B1 test lifecycle row, then the test project ===
DELETE 1
DELETE 1

=== PROOF test project is gone (expect 0 rows) ===
 id | slug
----+------
(0 rows)

 id
----
(0 rows)

=== PROOF baseline restored (expect 4 delivery projects, 0 delivery-side lifecycle rows) ===
 delivery_projects
-------------------
                 4
 delivery_lifecycle_rows
-------------------------
                       0
```

**Verdict:** PASS. The hook fired, created exactly one correctly-shaped lifecycle row, emitted its
`project_lifecycle_registered` success event, and the test artifact was removed with the tree left
at its pre-test baseline.

---

### B2 — Decide the four legacy delivery projects 🗂️  ✅ **CLOSED 2026-10-14**

> **How this closed.** The Gov tab measured the four projects and recommended option (b) —
> legacy, out of scope — adding the fact that all four sit at delivery status `building`
> rather than `discovery`, so backfilling them at `discovery` would have **contradicted
> their own delivery state**. The DRI decided on that recommendation. The control that makes
> the decision safe is below.

**Why:** two of them are `government_public_sector`. Today they are invisible to the lifecycle,
and nobody has decided whether that is correct.

**Pass condition.** A recorded DRI decision, one of:
(a) backfill them with lifecycle rows at the stage they are genuinely at, or
(b) declare them legacy and out of scope, with the same reasoning used for the 62 legacy student
projects — in which case the delivery side needs its own compatibility treatment, because the
story gate's `legacy_compatibility` branch covers STUDENT projects only.

**The trap to avoid:** backfilling them at `discovery` would state that work already done has not
started. If they are backfilled, the stage must be the one they are actually at.

---

### B3 — Prove a Factory domain can MOVE 🏭  🟡 **UNBLOCKED 2026-10-15, still open**

**Why:** all ten domains are registered and all ten are stuck at `discovery`. Registration is
proven; the stage machine is not.

**Pass condition.** One agent domain advances `discovery` → `requirements_ready` through the real
transition path, with the four discovery prerequisites genuinely assessed rather than waived, and
the stage change visible on the admin surface. **This is also the only way LC-10's approval
evidence gets exercised**, because the approval path sits six stages in.

#### What B3 found: the gate was not slow, it was shut

Attempting B3 surfaced a defect, not a missing step. `requirements_ready` needs four things, and
**two of them had no measurement function at all** — `requirementCount` and
`uncitedRequirementSourceBlocks` were absent from `EVIDENCE_MEASUREMENTS`, which held seven of
roughly twenty-five fields. `blockingGaps` filters only `ADVISORY_RULES` and no gap *kind* is
advisory, so an unassessed prerequisite blocks. **No project could ever leave `discovery`.** The
lifecycle was built, deployed and activated in that state.

The code said why, and the reasoning was sound: `SourceRef` is documented as "a requirement OR
OTHER CAPTURED STATEMENT", so `sources.length` would publish a count meaning something other than
its name, and it is "cheaper to leave the field unassessed — where it BLOCKS — than to measure it
approximately." True, and it still shipped a closed system. *Unassessed because honest* is only
the right answer while something is on its way to measuring it.

#### What is now closed

Both fields are measured, **exactly rather than approximately**:

| Field | How it is measured now |
|---|---|
| `requirementCount` | `refs.sources` filtered on `SourceRef.source` ∈ `REQUIREMENT_SOURCE_COLLECTIONS`. The superset was a property of the *type's intent*, not of the data — both shipped adapters map `input.requirements` and nothing else, and `source` records which collection each pointer came from. All-or-nothing: one unclassified collection and the field reports unmeasured rather than counting a subset |
| `uncitedRequirementSourceBlocks` | measured at **composition**, where the data is, and carried on `ManifestRefs.coverage`. Neither half of the question is in a ref set — `sources` holds requirement pointers rather than the process document's source blocks, and `businessTasks` is `PinnedRef[]` with no `source_evidence`. The rule is `factoryValidate`'s shipped `SOURCE_COVERAGE`, moved rather than reimplemented |

**Verification:** 16 new tests, 9 mutations each driving the suite RED (superset count 1,
never-measured 6, unmeasured-reads-as-clean 3, readable-subset 1, absent-blocks-clean 1,
kind-filter 4, citation-test 3, uncited-task-skipped 1, sbp-blocks-every-student 2), the three
source files restored byte-identically at sha256 `3a706af4`. Lifecycle tree 1094 passed, 0 failed.
tsc at its unchanged 4-error playwright baseline.

#### Two limitations, said out loud

**1. This gate does no work for a student project.** SBP has no source-block layer and no
business-task layer, so zero blocks are classified `requirement` and `[]` is the literal answer to
the question asked. The adapter records `[]` rather than `null` deliberately: `null` would read as
"nobody measured" and block every student project at stage one forever, which is the defect being
fixed. What protects a student build instead is `requirementsWithoutProvenance` at this same stage
and `mustHaveRequirementsWithoutStory` at `plan_ready`, which is where an SBP requirement's trace
into the build actually lives. A reader should not believe the citation rule is guarding a student
project.

**2. The gate opens ONE stage, not thirteen.** Eighteen fields are still unmeasured and every one
is read by `process_ready` or later, so stages 3 onward still refuse with `not_assessed` —
correctly, because nobody has looked. The still-unmeasured set is pinned by a test
(`lifecycleEvidence.fieldGuards.test.ts`) so this boundary cannot quietly move.

#### The second defect B3 found: nothing wrote a manifest at all

Measured by grep over `services/`, `routes/`, `controllers/` and `scripts/` on 2026-10-14. Three
producers formed a chain with **no consumer**:

| Producer | Production callers | Consequence |
|---|---|---|
| `POST /api/admin/project-lifecycle/:id/compose` | is itself the entry point | validated a blueprint and returned refusals — **persisted nothing** |
| `writeBlueprintManifest` | **zero** | the only production `INSERT` into the manifest table; reached from tests only |
| `factoryToManifestRefs` / `sbpToManifestRefs` | **zero** | reached from tests only |

So `refs` was `null` for every real project and **every** refs-derived measurement reported
unmeasured regardless of the two fixed above. Corroborated by `manifestWriter.ts`'s own header,
which names this as the dependency Phase 4 closed with: *"Production never CREATES an
`operating_blueprint_manifests` row — it only reads and updates one."* `blueprintApproval` could
only approve a manifest that nothing created.

**CLOSED 2026-10-15.** `services/lifecycle/blueprintPersistence.ts` gives the writer and both
adapters their first production caller, and `/compose` now files the blueprint it just validated.
Composition runs first and only a blueprint with zero refusals is persisted — the order is not
interchangeable, because persisting first would file refused work and burn a revision on each.

| Decision | What shipped, and why |
|---|---|
| Which adapter per kind | **The kind picks it.** The compose body is `FactoryProject`-shaped for *both* kinds, so running the factory adapter for everything typechecks — and writes a wrong pointer. A student project's requirements live in `build_plans`, not `contract_requirements`; mislabelling them makes every pointer in a student manifest dangle, which is worse than no manifest because it looks resolvable |
| Where the tenant comes from | the authorized lifecycle row, never the request |
| Authorization | `loadAndAuthorize(..., 'write')`, the same guard as every sibling service, **before** the write. `/compose` regained the `TenantAccessError` branch it had removed as unreachable — it is reachable now, and tested |
| Idempotency | inherited from `writeBlueprintManifest`'s `(tenant, project, sha256(refs))` key, so re-submitting an unchanged blueprint returns the first row with `created: false` rather than minting a revision per click |
| What is declined | a project with **no lifecycle row** (the legacy case — composes fine, nowhere to file) and a blueprint with **no requirements** (a measured zero; writing it would let an empty row take the refs key while a real blueprint takes the next revision). Both come back as `{ persisted: false, reason }` on the 200, never as a bare success |

**A latent defect fixed on the way.** The handler's id-mismatch guard read `project.id` alone, and
`FactoryProject` has no `id` — its identity column is `delivery_project_id` — so the check was
**dead for every realistic body**. Harmless while compose persisted nothing. Not harmless once the
manifest is filed against the URL's project id under that project's tenant.

**Verification:** 18 new service tests, 7 new route tests, **13 mutations each driving the suite
RED**, both files restored byte-identically at sha256 `2bcbe0a7`. Lifecycle + route regression
**1,206 passed, 0 failed**. tsc at its unchanged 4-error playwright baseline.

#### What still blocks B3

**Only a real blueprint.** The machinery is complete and proven end to end in test: the refs this
service persists, fed through the real evidence measurements, produce zero blocking gaps at
`requirements_ready`. What has not happened is a human composing an actual blueprint for one of
the ten agent domains in production and taking the transition.

That is deliberately not done here. It would mean inventing requirement content for a real agent
domain and writing it to the production database, and fabricated evidence in a governance record
is the one thing this whole programme is built to refuse. B3 closes when a real blueprint is
composed — a work session, not a code change.

---

### B4 — Give the bypass detectors a caller ⚠️  ✅ **PASSED 2026-10-14**

**Why, measured:** `unregisteredDeliveryProjectsSince` and `unregisteredStudentProjectsSince` are
called from **tests only**. There is no production caller. A detector nobody runs cannot detect
anything, and this programme has already shipped one control that proved nothing until it was
itself tested.

**Pass condition.** Both detectors are invoked by something that runs on its own — a scheduled
job, a health surface, or the ops digest — and a non-empty result is surfaced where a human will
see it. Proven by a deliberately unregistered row appearing in that output, then removed.

---

### B5 — Prove NO creation path bypasses the hook 🔍  ✅ **PASSED 2026-10-14**

**Why:** the chokepoint inventory for this programme was wrong within a week once already —
`govDeliveryProject.ts` landed three days after the inventory was taken and was live in
production, creating projects with no lifecycle. That is exactly why the hook was moved onto the
model. This task proves the move worked.

**Pass condition.** An enumerating command — printed with its output, not summarised — that lists
every call site creating a `projects` or `delivery_projects` row, and shows each one goes through
a model carrying the registration hook. Any raw-SQL insert is a finding. The command must be
re-runnable by someone else and must name what it searched, so a future path cannot quietly join
without the sweep noticing.

---

### B6 — Record both consumers against LC-01 ✅  ✅ **PASSED 2026-10-14**

**Why:** LC-01 is the acceptance ID that says a new-project path cannot bypass plan
authorization. Today it is satisfied by the student path alone.

**Pass condition.** `acceptance-evidence.md` carries an LC-01 row naming **both** consumers, with
the production evidence for each, and states plainly which paths are proven versus merely wired.

**Met.** The row is in `acceptance-evidence.md`, marked **Partial with the partial half named**,
and it separates three things the old wording ran together:

| | Factory (10 domains) | Gov contracts |
|---|---|---|
| Registration wired | ✅ | ✅ |
| Registration **proven in production** | ✅ ten rows, 2026-10-13 14:03Z | ❌ never fired |
| Authorization **enforced** | ✅ `storyAuthorization.ts` | ❌ no delivery-side gate exists |

**The bottom-right cell is what this row bought.** A delivery project registers and then nothing
consults the registration — there is no delivery-side equivalent of `storyAuthorizationFor`. That
was true before B6 and was not written down anywhere, which is the only reason LC-01 looked
satisfied. The row also records what it does *not* claim: not that the gate turns, not that the
fourteen entry points in `entry-point-matrix.md` are each exercised, and not that the 66 legacy
rows are governed.

Evidence carried into the row is all measurement, none of it new work: the derived creation-site
sweep (`lifecycleRegistrationCoverage.test.ts`, which reads files because plain `grep -r` skips
three NUL-byte `.ts` files as binary), B5's nine enumerated sites, the four tripwires for what a
model hook cannot see, B4's production caller, and B2's cutoff tests.

---

## How to read this register

A row moves to ✅ only on evidence that was produced and pasted, never on a reading of the code.
That standard is not pedantry: every failure in this programme's eight phases was a claim that
did not survive measurement, and not one was a broken behaviour the tests passed over.

**Current score: 5 of 6. B3 is the only task still open.**

| | Task | State |
|---|---|---|
| **B1** | a NEW gov delivery project registers | ✅ **proven in production 2026-10-14** by the Gov tab — the hook fired, left exactly one correctly-shaped row, and the test artifact was removed with the baseline restored |
| **B2** | decide the four legacy delivery projects | ✅ closed by the DRI on the Gov tab's recommendation; the default that makes it safe is now a tested control |
| **B3** | a Factory domain MOVES | ⬜ **open.** Two real defects found and fixed on the way — two prerequisites with no measurement, and a manifest nothing wrote — and the chain is proven end to end in test. No domain has moved |
| **B4** | the bypass detectors have a caller | ✅ on `/health/full`, 5 mutations |
| **B5** | no creation path bypasses the hook | ✅ both halves: 4 student + 5 delivery sites, zero raw-SQL inserts |
| **B6** | LC-01 names both consumers | ✅ split into wired / proven / enforced |

**B3 stays open, and the distinction is the point.** Its pass condition is that a domain
*actually moves*, and none has. Scoring it closed would record working machinery as a movement —
the same category error as recording registration as enforcement. It closes when somebody
composes a real blueprint, which is a work session rather than a code change.

**Both consumers are now proven on the backbone.** The Factory was already. Gov is as of
2026-10-14, through a chokepoint shown to have no bypass.

---

### B2 decision and evidence

**DRI decision, 2026-10-14: DO NOT BACKFILL.** The four legacy delivery projects (two
`government_public_sector`, created 2026-09-21 to 2026-09-28) are declared legacy and out of
scope, as are the 62 legacy student projects.

**Verified to cost nothing today.** Every caller of `loadAndAuthorize` is a lifecycle ADMIN
operation — read status, transition, approve, change-request. There is NO delivery-side
equivalent of `storyAuthorizationFor`, so nothing in the gov build path refuses work because a
lifecycle row is missing. The four are invisible to the lifecycle surface, which is the correct
treatment for ungoverned legacy work, rather than being refused by it.

**What the decision was actually resting on, and now is not.** The only thing keeping those 66
rows out of the bypass reports is the DEFAULT `since` on the two detectors. The pre-existing
test asserted `LIVE_SINCE instanceof Date` — a TYPE check that a constant pointing at 1970
would have passed. Had that default moved, all 66 would have been reported as LC-01 violations
on B4's new `/health/full` check, sending someone to investigate a breach that never happened.

`registrationCutoff.test.ts` now pins both dates to literals, asserts each is bound as a lower
bound, asserts the anti-join, and asserts an explicit argument overrides the default (without
which a function ignoring its argument would pass everything else). Six tests; five mutations
each RED — default-to-epoch on both sides, the constant moved, the lower bound dropped, the
anti-join dropped — file restored byte-identically, sha256 `6041323633c79fa5`.

**FORWARD OBLIGATION.** When a delivery-side enforcement gate is built — the gov equivalent of
the story gate — it MUST carry this same cutoff, or it will refuse these four. That is exactly
the trap the student side hit, which is why `legacy_compatibility` exists there.

### B5 evidence — the sweep, with its commands

```
grep -rn "Project\.create(\|Project\.bulkCreate(\|Project\.findOrCreate(" services routes jobs scripts models --include=*.ts | grep -vE "__tests__|DeliveryProject|LifecycleState|AgentDomainProject"
  -> agentDomain/agentDomainProvisioner.ts:209   Project.findOrCreate
  -> businessProcessSeedService.ts:135           Project.findOrCreate
  -> ops/bcSyncService.ts:288                    OpsBcProject.create  (table ops_bc_projects - NOT a project row)
  -> projectService.ts:67                        Project.create

grep -rn "DeliveryProject\.create(\|DeliveryProject\.bulkCreate(\|DeliveryProject\.findOrCreate(" services routes jobs scripts --include=*.ts
  -> delivery/leadConversion.ts:175              factory/govDeliveryProject.ts:134
  -> scripts/seedDevClientReviewer.ts:183        scripts/seedFactoryDemoContract.ts:31
  -> scripts/seedOrdinaryProjectDemo.ts:27

grep -rniE "insert into (public\.)?(projects|delivery_projects)" services routes jobs scripts db --include=*.ts
  -> NO HITS. No raw-SQL bypass.

grep -rn "tableName: 'projects'|tableName: 'delivery_projects'" models/*.ts
  -> exactly ONE model per table: Project.ts:321, DeliveryProject.ts:163
  -> BOTH declare afterCreate with the lifecycle hook (Project.ts:339, DeliveryProject.ts:175)
```

No `bulkCreate` anywhere, which matters: it does not fire per-row `afterCreate` hooks.

#### The delivery half, as the Gov tab ran it

Recorded because it is **re-runnable by someone else and names exactly what it searched**, which
the sweep above summarises rather than prints. Both halves now pass; this is the delivery one.

**Command (re-runnable; names exactly what it searched) — the `delivery_projects` half:**

```bash
# (1) every model-based create of a delivery project
grep -rnE "DeliveryProject\.(create|bulkCreate|upsert|findOrCreate|build)\b" \
  backend/src --include=*.ts | grep -v "__tests__"
# (2) any RAW SQL insert into delivery_projects (ANY hit is a FINDING)
grep -rniE "insert[[:space:]]+into[[:space:]]+delivery_projects" \
  backend/src/services backend/src/scripts backend/src/db backend/src/seeds | grep -v "__tests__"
# (3) any hook-bypassing form (bulkCreate / upsert / hooks:false) on DeliveryProject
grep -rnE "DeliveryProject\.(bulkCreate|upsert)|hooks:\s*false" \
  backend/src --include=*.ts | grep -v "__tests__"
```

**Verbatim output:**

```
--- (1) Model-based creation sites ---
backend/src/scripts/seedDevClientReviewer.ts:183:    project = await DeliveryProject.create({
backend/src/scripts/seedFactoryDemoContract.ts:31:    project = await DeliveryProject.create({
backend/src/scripts/seedOrdinaryProjectDemo.ts:27:    project = await DeliveryProject.create({
backend/src/services/delivery/leadConversion.ts:175:  const project = found.project ?? await DeliveryProject.create({
backend/src/services/factory/govDeliveryProject.ts:134:      project = await DeliveryProject.create({
(line 9 of the grep — projectLifecycleRegistration.ts:99 — is a comment, not a call site)

--- (2) RAW SQL inserts into delivery_projects (ANY hit here is a FINDING) ---
NONE — no raw-SQL insert into delivery_projects in backend/src (excluding tests)

--- (3) bulkCreate / upsert / hooks:false on DeliveryProject ---
(no DeliveryProject.bulkCreate/upsert and no hooks:false; the only grep hits are an unrelated
 `webhooks: false` in providerCapabilities.ts and comment text in projectLifecycleRegistration.ts)
```

**Verdict (delivery half):** exactly five call sites create a `delivery_projects` row, every one
through `DeliveryProject.create` — the model carrying `afterCreate: deliveryProjectLifecycleHook`.
The gov path (`govDeliveryProject.ts:134`) is in the set. Zero raw-SQL inserts, zero
hook-bypassing forms. B1 then proves that hook actually fires.

---

### B4 evidence

`checkLifecycleRegistration` now runs inside `runFullSystemHealthCheck`, so both detectors are
called every time anyone opens `/health/full`. Six tests, five mutations, all RED:
bypass-reported-as-ok fails 2, ids-dropped 1, failure-reads-as-pass 1, **unwired-from-report 1**,
student-side-skipped 4. File restored byte-identically, sha256 `c46350d3a2518c41`.

**One mutation initially gave a FALSE NEGATIVE and the fix is a rule.** The first
bypass-reported-as-ok run came back all-green, because its anchor `severity: 'warning',` occurs
**14 times** in that file and the replacement hit a different check. A mutation anchor must be
asserted UNIQUE, not merely present - the re-run asserted exactly one match and killed 2 tests.
A mutation that lands on the wrong line is indistinguishable from a robust test.
