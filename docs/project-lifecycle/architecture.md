# Unified AI Project Lifecycle — architecture decision record

**Status:** proposed (Phase 1 deliverable; no code written against it yet)
**Date:** 2026-10-01 · **Session:** CC-20261001-q7m4 · **Base commit:** `004cdff5`
**Decision owner:** DRI (Ali Muwwakkil). This ADR records decisions and the evidence behind them; it does not grant itself approval.

Written for the engineer who will implement Phases 2-8 and for the reviewer who has to judge whether this is safe. It assumes you know the repo but not this subsystem.

---

## 1. What problem this solves

Every new project in this system can today reach an authorized implementation plan — published tasks, a repo write, a student's task list — without anyone having approved what the project *is*. There are **14 distinct creation paths** across two identity tables (see `entry-point-matrix.md`), several of them services or background jobs rather than HTTP routes. There is no single place to stand.

The goal is one governed lifecycle every new project passes through, so that no project reaches authorized planning without an approved, versioned operating blueprint — and so that the approval is bound to an exact revision, an authorized human, and a tenant.

## 2. The central decision: a coordinator over existing engines

**Decision.** Introduce a lifecycle **coordinator** that sits above the existing engines and owns only stage state, prerequisites, and the blueprint manifest. It does not generate, decompose, design, or publish anything itself.

**Rejected alternative:** a unified engine replacing Factory and SBP. Rejected because the two are genuinely different domain models serving different customers — Factory models a *contract* with proposal and solution-build tracks and a RACI/evidence vocabulary; SBP models a *student build* optimized for never waiting on a human. The request also forbids collapsing their tables, and the repo's own test suite (~211 cases across 22 Factory files alone) encodes behavior a rewrite would silently lose.

```
                    ┌─────────────────────────────┐
                    │   Lifecycle Coordinator     │
                    │  stage state · prerequisites│
                    │  OperatingBlueprintManifest │
                    └──────┬───────────────┬──────┘
                  adapter  │               │  adapter
              ┌────────────▼──┐        ┌───▼───────────┐
              │   Factory     │        │     SBP       │
              │ contract_*    │        │ build_*       │
              │ proposal +    │        │ plan contract │
              │ solution_build│        │ gate · repair │
              └───────────────┘        └───────────────┘
                 (tables untouched)       (tables untouched)
```

Adapters are explicit, tested, and one-directional: the coordinator reads domain records and writes **only** manifest rows plus its own stage table. No coordinator column is added to `contract_*` or `build_*` tables.

## 3. Lifecycle stages

Thirteen stages, persisted, with server-evaluated transitions:

```
discovery → requirements_ready → process_ready → allocation_ready → design_ready
   → awaiting_blueprint_approval → blueprint_approved → planning → plan_ready
   → building → release_review → launch_ready → operating
```

**Conditions are orthogonal to stage.** `blocked`, `failed`, `awaiting_input` and `needs_reapproval` are **not** stages — they are conditions recorded alongside the stage, so the stage to resume from is never lost. A project is `(stage, condition?)`. This is what makes recovery possible: a provider failure at `process_ready` leaves `(process_ready, failed)`, not `failed`.

**Transitions are commands, not setters.** Each transition is a server command evaluated against typed prerequisites **and** actor permission. The client never writes a stage. Invalid jumps are refused, not corrected.

**Prerequisite examples (typed, each machine-checkable):**

| Target stage | Prerequisites |
|---|---|
| `requirements_ready` | ≥1 requirement with provenance; every requirement-kind source block cited |
| `allocation_ready` | every business task has an execution class **and** a resolvable accountable human role |
| `design_ready` | every task maps to a workspace/action or an explicit headless operation; selected design variant recorded |
| `awaiting_blueprint_approval` | manifest content hash computed; no unknown allocation; effort coverage disclosed |
| `blueprint_approved` | an immutable approval bound to tenant + project + revision + authorized actor, approver ≠ proposer |
| `planning` | **re-checked** `blueprint_approved` at the moment of authorization, not merely once |

**Draft and preview are allowed; authorization is not.** Previews and draft scenarios may exist at any stage. What they can never do is mark themselves authorized for build. No preview branch publishes implementation tasks.

## 4. Where enforcement attaches (LC-01)

The 14 creation paths converge on **three** chokepoints. Instrumenting these covers every path:

1. **`projectService.createProjectForEnrollment()` / `createNewProjectForEnrollment()`** — highest fan-in (portal, enrollment side effects ×3, internship authoring, backfill script).
2. **`sbpOrchestrator.startBuild()`** — SBP route, internship build, Flotation intake, delivery intake, repo import (the last four reach it transitively).
3. **`DeliveryProject.create()`** — lead conversion and seeds. **This is the one place with no service seam today**; an additive `createDeliveryProject()` helper must be introduced and the 5 direct call sites routed through it.

**Enforcement is a refusal, and the refusal already has a precedent in this repo.** `routes/admin/factoryRoutes.ts` refuses to create an unqualified government project with `409 { qualificationRequired: true }`, enforced server-side and documented as "defense in depth, not just the UI". The lifecycle generalizes that shape; it does not invent one.

**The LC-01 test must enumerate all 14 paths, not the 3 chokepoints.** A test that checks only the chokepoints proves the chokepoints work, not that nothing bypasses them — and this repo has already been bitten by a check that passed because it was scanning nothing. Scripts and seeds (2 groups) get an **explicit, labelled** bypass; a silent one is forbidden.

## 5. Two design tensions, resolved explicitly

These are recorded because implementing the request literally would regress protections the team already fought for. Both were found in code comments that explain *why* the current behavior exists.

### 5.1 "Nothing waits on a human" vs. blueprint approval

`sbpOrchestrator.ts:18-27` records a real past failure: the publish step had "exactly one caller — an HTTP route nothing in the product called", so every gate-clean plan came to rest in `build_plans.status = 'draft'` and never reached the student. The fix was auto-publish, and the principle written down was *"Nothing waits on a human."* Separately, the student-side approval gate was **deliberately removed** by product decision — students get no say in the build.

**Resolution.** The blueprint approval wait lives on the **owner/admin path only**. The student delivery path keeps auto-publish and never acquires a human wait. These are compatible because they govern different questions: the owner approves *what gets built*; the student receives *what was approved*. Concretely: the coordinator gates **authorization of planning**, and SBP's `startBuild` consults an already-decided stage rather than blocking on a human mid-build.

**Do not** reintroduce a student-facing approval step, and do not make `startBuild` wait.

### 5.2 Agent scoping order

Request packet P3-T4 asks for runtime agents to be scoped **before** story generation. SBP deliberately scopes **after** the gate (`sbpOrchestrator.ts:315-321`): *"a scoping failure must never cost them a publishable build — scopeAgents returns the plan untouched when anything goes wrong."*

**Resolution.** Require pre-story agent scoping in the **blueprint** path, where approval rather than delivery speed is the governing concern, and leave SBP's post-gate scoping intact for the student path. This satisfies P3-T4's intent — agents resolved before stories are *authorized* — without making a scoping failure able to cost a publishable build. Inverting SBP's order would regress a documented protection.

### 5.3 Design variants (recorded for Phase 4)

`appPrototypeService.ts:145-147` rejected three concept variants: *"a prospect wants to see their own thing as a page they could navigate, not three variations on an internal dashboard."* The request mandates 2-4 variants per meaningful design decision.

**Resolution.** Variants belong to the **owner's design-decision surface** during blueprint review. The prospect-facing prototype stays one design at two widths. Different audience, different question. Phase 4 must not re-introduce variants into the prospect path.

## 6. Naming

`Blueprint` is already taken and consumed: `BuildBlueprint` (`services/delivery/buildBlueprint.ts:117`, consumed by `blueprintProposals.ts` and `projectScopeService.ts`), `GeneratedBlueprint` (`structureGenerationService.ts:108`), and the whole `services/agentBlueprint/` tree.

**Decision:** the new artifact is `OperatingBlueprintManifest`, stored in `operating_blueprint_manifests`. Never `Blueprint` or `BuildBlueprint`. Reusing the bare name would make every future grep ambiguous.

## 7. Stable source-item identity

Source items need identity that survives wording corrections, because a typo fix must not read as a new requirement — and identical text must not read as the same item.

**Decision.** A source item's ID is minted once at first capture and carried through revisions. It is **not** a hash of its text. Wording corrections produce a new *revision* of the same item ID; genuinely new items get new IDs. The existing `factoryId(kind, parts)` helper (`factoryIds.ts:38`) is the precedent for deterministic ID derivation, and it deliberately joins parts with a NUL separator so `("task", ["a","b"])` and `("task", ["a|b"])` cannot collide.

Legacy items whose provenance was never recorded keep their citation and are annotated as missing provenance. **Provenance is never invented to fill the field.**

## 8. Migration and persistence

Additive only, following the repo's 81-file `ensure*Schema` convention:

- `ensureProjectLifecycleSchema()` — `CREATE TABLE IF NOT EXISTS` only; no existing table altered; any `ADD COLUMN` is `IF NOT EXISTS` with no default so existing rows are untouched.
- Paired `assertProjectLifecycleSchema()` using the **aggregate single-row form** (`SELECT bool_or(table_name='X') AS t0, …`), because this app's `sequelize.query` returns single-column selects as raw arrays rather than `{col}` objects — a naive membership check falsely reports every table missing (documented at `ensureContractTrackSchema.ts:158-165`).
- Registered in `server.ts` boot order after the tables it references.
- Migration DDL is warn-only by convention, which means **a failed migration leaves the schema wrong without crashing boot**. The paired assert is therefore not optional — it is the only thing that makes the failure visible.

Existing rows must remain readable with no backfill required. Legacy projects are addressed in §10.

## 9. Tenancy and authorization

All coordinator reads and writes pass through `modules/tenancy/tenantAccessGuards.ts`'s audited guards (`requireTenantAccessAudited`, `requirePermissionAudited`). Row-level checks run **after** the audited guard, never instead of it.

**Gap this closes:** `factoryApproval.contentHash()` covers only `revisionId + doc_json` — **no tenant binding, and the approving actor is not covered by the hash.** The manifest hash binds **tenant + project + revision**, and the approval record separately binds the authorized actor and role. The request requires that "all citations must resolve within the correct project/tenant and revision"; today they could resolve cross-tenant.

Personas map onto the existing 13 `DELIVERY_ROLES` (`modules/delivery/deliveryRoles.ts:55`), which already include `DESIGN_REVIEWER` with `design.approve`, plus `release.approve`, `story.review`, `evidence.verify` and a read-only `OBSERVER`. **No new roles are created and no new login is introduced.**

## 10. Legacy policy

- Existing approved plans remain **pinned and executable** under their current behavior. No historical replanning.
- Missing historical blueprint provenance is annotated honestly, not fabricated.
- Migration is **opt-in with a preview**, showing what would change before anything does.
- Existing projects run in a compatibility mode where lifecycle enforcement applies to **new** projects; an existing project is not retroactively blocked.
- `ensureProjectApprovalSchema.ts` already exists and is the owner/admin approval surface — **not** a student gate. It is not resurrected as one.

## 11. Rollout and rollback

Enforcement ships behind a narrowly scoped flag, default **OFF** until Phase 8 activation, reusing the `SBP_AUTO_PUBLISH` env-flag precedent rather than inventing a flag mechanism. A disabled state is **explicit**, never a generic successful fallback.

**Rollback constraint (LC-18).** Once enforcement is active, rollback must either retain the lifecycle checks or **pause new-project authorization with a visible explanation**. A rollback that silently re-opens ungoverned project creation is forbidden — that would turn an incident response into a governance regression. Additive migrations are not blindly reversed when new data exists; forward-fix instead, documented.

## 12. Consequences

**Positive.** One place to stand for governance. Existing engines, tests and vocabularies are preserved. Approval gains tenant binding, separation of duty and idempotency it does not have today. Three of the request's hardest requirements (LC-05/LC-06 human accountability, LC-07 honest unknowns, LC-14 source-injection defense) are extensions of machinery that already exists rather than new inventions.

**Negative / accepted costs.** A new table family and a new module tree to maintain. Two deliberate inconsistencies are preserved on purpose (SBP scopes agents late; the prospect prototype shows one design). An additive seam must be introduced in front of `DeliveryProject.create()`, touching 5 call sites. The coordinator is a new dependency in the boot order.

**Risks.** Recorded as R1-R12 in the run's plan, with the two highest being the non-transactional CAS in `factoryApproval` (load-bearing for LC-13, which was a real incident) and the allocation gap being schema+prompt+derivation work rather than a prompt edit.

## 13. Open questions for Phase 2

1. Does `uq_contract_proc_doc_version` actually backstop `factoryApproval`'s non-transactional read-then-compare under true concurrency? **Must be proven by a concurrent test, not reasoned about.**
2. Where exactly is the generation-enablement flag read (`factoryGenerateIfEnabled`), and is its storage reusable for the lifecycle flag?
3. Is there any generic outbox table, or is idempotency strictly per-domain? Discovery suggests per-domain; the lifecycle follows that convention rather than adding a global outbox, which would be a new architectural layer and therefore ESCALATE-tier.

---

## Related documents

- `entry-point-matrix.md` — the 14 creation paths and 3 chokepoints
- `blueprint-contract.md` — the manifest's fields and invariants
- `approval-and-change-policy.md` — approval binding, invalidation, impact sets
- `acceptance-evidence.md` — LC-01…LC-18 evidence table (populated as phases land)
