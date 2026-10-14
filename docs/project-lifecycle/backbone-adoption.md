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

### B2 — Decide the four legacy delivery projects 🗂️

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

### B3 — Prove a Factory domain can MOVE 🏭

**Why:** all ten domains are registered and all ten are stuck at `discovery`. Registration is
proven; the stage machine is not.

**Pass condition.** One agent domain advances `discovery` → `requirements_ready` through the real
transition path, with the four discovery prerequisites genuinely assessed rather than waived, and
the stage change visible on the admin surface. **This is also the only way LC-10's approval
evidence gets exercised**, because the approval path sits six stages in.

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

### B6 — Record both consumers against LC-01 ✅

**Why:** LC-01 is the acceptance ID that says a new-project path cannot bypass plan
authorization. Today it is satisfied by the student path alone.

**Pass condition.** `acceptance-evidence.md` carries an LC-01 row naming **both** consumers, with
the production evidence for each, and states plainly which paths are proven versus merely wired.

---

## How to read this register

A row moves to ✅ only on evidence that was produced and pasted, never on a reading of the code.
That standard is not pedantry: every failure in this programme's eight phases was a claim that
did not survive measurement, and not one was a broken behaviour the tests passed over.

**Current score: 3 of 6.** B4 and B5 passed on 2026-10-14. Outstanding: B1 (gov registration has
never fired), B2 (the four legacy delivery projects need a decision), B3 (no domain has moved off
`discovery`), B6 (LC-01 row naming both consumers).

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
