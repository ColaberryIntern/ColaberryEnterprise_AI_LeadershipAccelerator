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

## Where each consumer stands, measured 2026-10-14

| Consumer | Wired? | Proven in production? | Evidence |
|---|---|---|---|
| 🏭 **Project Factory** (10 agent domains) | ✅ | ✅ | All ten domains hold exactly one `project_lifecycle_states` row each, stage `discovery`, created 2026-10-13 14:03Z. 0 duplicates, 0 orphans, 0 tenant mismatches |
| 🏛️ **Gov contracts** (delivery projects) | ✅ | ❌ **unexercised** | `DeliveryProject.ts:174` carries `afterCreate: deliveryProjectLifecycleHook`, and `govDeliveryProject.ts:134` creates through that model — so the wiring is real. But **zero** delivery projects have been created since the hook shipped on 2026-10-09, so it has never fired in production |
| Legacy delivery projects | — | n/a | 4 rows, 2 of them `government_public_sector`, created 2026-09-21 → 2026-09-28. All predate the hook. None has a lifecycle row |
| Legacy student projects | — | n/a | 62 rows predating the student hook (2026-10-12). None has a lifecycle row. Covered by `legacy_compatibility` in the story gate |

**The difference that matters:** "wired" means the code path exists. "Proven" means it ran in
production and left evidence. The Factory is both. Gov is only the first.

---

## The tasks. This project is not complete until every one of these passes.

### B1 — Prove a NEW gov delivery project registers 🏛️

**Why:** the delivery hook has never fired in production. A hook that has never run is a claim.

**Pass condition.** A delivery project created through the real gov path
(`govDeliveryProject.ts`, not a test double) holds **exactly one** `project_lifecycle_states` row
with `delivery_project_id` set, `tenant_id` matching the project, and stage `discovery` — verified
by a read-only query naming the project id, with the query and its output recorded.

**Fail-closed note:** if the gov path turns out to create through anything other than
`DeliveryProject.create`, that is the finding, and it is a defect rather than a surprise.

---

### B2 — Decide the four legacy delivery projects 🗂️  ✅ **CLOSED 2026-10-14**

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

### B3 — Prove a Factory domain can MOVE 🏭  🟡 **HALF CLOSED 2026-10-14**

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

#### What still blocks B3, and it is not a measurement

Nothing writes an `operating_blueprint_manifests` row in production, so `refs` is `null` for every
real project and **every** refs-derived measurement reports unmeasured regardless of the above.
Three producers form a chain with no consumer:

| Producer | Production callers | Consequence |
|---|---|---|
| `POST /api/admin/project-lifecycle/:id/compose` | is itself the entry point | validates a blueprint and returns refusals — **persists nothing** |
| `writeBlueprintManifest` | **zero** | the only production `INSERT` into the manifest table; reached from tests only |
| `factoryToManifestRefs` / `sbpToManifestRefs` | **zero** | reached from tests only |

Measured by grep over `services/`, `routes/`, `controllers/` and `scripts/` on 2026-10-14, and
corroborated by `manifestWriter.ts`'s own header, which names this as the dependency Phase 4
closed with: *"Production never CREATES an `operating_blueprint_manifests` row — it only reads and
updates one."* `blueprintApproval` can therefore only approve a manifest that nothing creates.

**Wiring `/compose` to persist carries one open design question**, which is why it is not done
here. The compose body's `project` is `FactoryProject`-shaped for **both** project kinds, but a
student project's requirements do not live in `contract_requirements`. Deciding which adapter
builds a student project's refs — and therefore what a manifest *means* for a student build versus
one of the ten Factory domains — changes a cross-module contract rather than adding a measurement.
That is CLAUDE.md's ESCALATE tier, and it needs the DRI.

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

**Current score: 5 of 6, with B3 half closed.** B2, B4, B5 and B6 all closed on 2026-10-14.
Outstanding: **B1** (gov registration has never fired, handed to the Gov tab) and **B3**.

**B3 stays open deliberately rather than being scored on the half that is done.** The gate it was
blocked on is now measurable and mutation-tested, which is a real defect closed — the first stage
of thirteen could not be passed by any project, and now it can. But B3's pass condition is that a
domain actually *moves*, and nothing writes the manifest those measurements read, so no domain has
moved. Scoring it 5 of 6 would record a measurement as a movement. The remaining half needs one
decision from the DRI, stated at the end of the B3 section above.

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
