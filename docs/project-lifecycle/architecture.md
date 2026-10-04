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

### The legal transition table

Enumerated in full, in the `LEGAL: Record<Stage, Stage[]>` shape `factoryApproval.ts:31-41` already uses. Anything absent from this table is refused — the default is deny, not allow.

| From | May advance to | May return to | Rationale for the return edge |
|---|---|---|---|
| `discovery` | `requirements_ready` | — | nothing earlier exists |
| `requirements_ready` | `process_ready` | `discovery` | new evidence reopens discovery |
| `process_ready` | `allocation_ready` | `requirements_ready` | a process gap usually means a missing requirement |
| `allocation_ready` | `design_ready` | `process_ready` | an unallocatable task means the process is wrong |
| `design_ready` | `awaiting_blueprint_approval` | `allocation_ready` | a design that cannot be staffed is not a design |
| `awaiting_blueprint_approval` | `blueprint_approved` | `requirements_ready`, `process_ready`, `allocation_ready`, `design_ready` | request-changes returns to whichever stage owns the change |
| `blueprint_approved` | `planning` | `awaiting_blueprint_approval` | a material edit invalidates the approval |
| `planning` | `plan_ready` | `awaiting_blueprint_approval` | a material edit mid-planning must not publish against a superseded revision |
| `plan_ready` | `building` | `planning` | plan rejected at review |
| `building` | `release_review` | `plan_ready` | scope change during build |
| `release_review` | `launch_ready` | `building` | release rejected |
| `launch_ready` | `operating` | `release_review` | launch blocked |
| `operating` | — | `awaiting_blueprint_approval` | change after launch re-enters approval; `operating` is steady state, not terminal |

**Every return edge sets the `needs_reapproval` condition** when it crosses `blueprint_approved`, so the downstream work that depended on the old revision is blocked rather than silently carried forward.

### Typed prerequisites — all thirteen stages

Each predicate returns **structured reasons**, never a bare boolean, so the UI can state what is missing. Each is machine-checkable.

| Target stage | Prerequisites |
|---|---|
| `discovery` | project registered against a tenant; entry point recorded |
| `requirements_ready` | ≥1 requirement carrying provenance; every `requirement`-kind source block cited by ≥1 task (reuses the existing `SOURCE_COVERAGE` rule); no source block left `unresolved` |
| `process_ready` | every process has ≥1 task; the transition graph has a reachable start and end, no orphan task, no unbounded rework loop (reuses `START`/`END`/`REACHABILITY`/`LOOP`/`BRANCH_KIND`) |
| `allocation_ready` | every business task has an execution class **and** a resolvable accountable human role; every agent-performed task has a human accountable or approver that is not itself (reuses `PERFORMER`/`OVERSIGHT`) |
| `design_ready` | every business task maps to a workspace/action **or** an explicitly recorded headless operation; the selected design variant and its visual-contract revision are recorded; every proposed new screen carries a rationale |
| `awaiting_blueprint_approval` | manifest `content_sha256` computed over its pinned references; **no allocation left unknown**; effort coverage disclosed beside every percentage; `proposed_by` recorded |
| `blueprint_approved` | an immutable approval bound to tenant + project + revision + hash + authorized actor and role; **approver ≠ proposer**; the revision is not superseded |
| `planning` | `blueprint_approved` **re-checked at the moment of authorization**, not merely once (see §TOCTOU in `approval-and-change-policy.md`); actor authority re-checked |
| `plan_ready` | every must-have requirement covered by ≥1 story; every story carries its requirement, business-task, workspace/action and blueprint revision references; no story serves nothing |
| `building` | plan revision pinned; repo handoff target resolved; approved revision re-checked at handoff |
| `release_review` | each release demonstrates a business workflow in the approved workspaces, including its human decision |
| `launch_ready` | release approved by an authorized actor; controls that are not implemented are labelled unavailable rather than claimed |
| `operating` | runtime business actions re-check the approved revision and current authority at execution time |

**Draft and preview are allowed; authorization is not.** Previews and draft scenarios may exist at any stage. What they can never do is mark themselves authorized for build. No preview branch publishes implementation tasks.

## 4. Where enforcement attaches (LC-01)

The 14 creation paths converge on **three** chokepoints. Instrumenting these covers every path:

1. **`projectService.createProjectForEnrollment()` / `createNewProjectForEnrollment()`** — highest fan-in (portal, enrollment side effects ×3, internship authoring, backfill script).
2. **`sbpOrchestrator.startBuild()`** — SBP route, internship build, Flotation intake, delivery intake, repo import (the last four reach it transitively).
3. **`DeliveryProject.create()`** — lead conversion and seeds. **This is the one place with no service seam today**; an additive `createDeliveryProject()` helper must be introduced and the 4 direct call sites routed through it.

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

`Blueprint` is already taken and consumed: `BuildBlueprint` (`services/delivery/buildBlueprint.ts:117`, consumed by `blueprintProposals.ts`, `projectScopeService.ts`, `designBrief.ts` and `requirementsHandoff.ts`), `GeneratedBlueprint` (`structureGenerationService.ts:108`), and the whole `services/agentBlueprint/` tree.

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

**Negative / accepted costs.** A new table family and a new module tree to maintain. Two deliberate inconsistencies are preserved on purpose (SBP scopes agents late; the prospect prototype shows one design). An additive seam must be introduced in front of `DeliveryProject.create()`, touching 4 call sites. The coordinator is a new dependency in the boot order.

**Risks.** Recorded as R1-R12 in the run's plan, with the two highest being the non-transactional CAS in `factoryApproval` (load-bearing for LC-13, which was a real incident) and the allocation gap being schema+prompt+derivation work rather than a prompt edit.

## 13. Open questions for Phase 2

1. Does `uq_contract_proc_doc_version` actually backstop `factoryApproval`'s non-transactional read-then-compare under true concurrency? **Must be proven by a concurrent test, not reasoned about.**
2. Where exactly is the generation-enablement flag read (`factoryGenerateIfEnabled`), and is its storage reusable for the lifecycle flag?
3. Is there any generic outbox table, or is idempotency strictly per-domain? Discovery suggests per-domain; the lifecycle follows that convention rather than adding a global outbox, which would be a new architectural layer and therefore ESCALATE-tier.

---

## 5.1a Staff-initiated student builds: who approves

*Decided 2026-10-03. §5.1 draws the line as "the owner approves what gets built; the student
receives what was approved", which covers portal self-serve and client delivery but not a third
shape a peer session surfaced: **staff initiate, a student receives**. Rows 5 and 6 of the
entry-point matrix are both this shape.*

**The approver is the initiating staff member, and separation of duty is explicitly not claimed
for this path.** The initiating staff member and the programme owner are the same person. A
second-identity requirement would therefore be the same human clicking twice — ceremony that
reads as a control — and a `SelfApprovalError`-style refusal, as `govQualification` applies
elsewhere, would make the path unusable rather than safe. Saying so is better than implying a
separation that does not exist.

**The control that does work with one person is the hash-bound review hold.** The build rests at
`drafted`; the reviewer reads it; the approval carries the reviewed plan's hash, so "the plan I
read is the plan that shipped" is enforced by `publishPlan` rather than assumed. That separates
the two acts in **time and content** rather than in identity, which is the only separation
available here — and it catches the failure that can actually occur (the generator produced
something wrong and it reached the student unread) rather than the one that cannot (an improper
second party).

**This is already implemented on every staff-initiated path**, and more strongly than this
document previously described: `holdForReview: true` is hardcoded at `internshipProjectGeneration.ts` and at both flotation admin doors. `buildFromUnderstanding`
defaults the hold OFF for the public self-serve door, which is correct — a student's own build
should publish the moment it is good. The hold is a persisted column, so it survives a restart;
that is LC-13, and it was a real incident rather than a hypothetical.

**What Phase 6 owes this path is preservation, not addition.** Two specific obligations: the
lifecycle's `release_review` must not become a second, redundant gate over a path that already
holds — one human reading one plan once is the control, and a second prompt to the same person
teaches them to click past both. And the approving identity must be recorded as the staff
member, never as an AI identity and never as the student, since `PROJECT_APPROVAL_GATE`'s
removal already settled that students get no say in the build.

## Related documents

- `entry-point-matrix.md` — the 14 creation paths and 3 chokepoints
- `blueprint-contract.md` — the manifest's fields and invariants
- `approval-and-change-policy.md` — approval binding, invalidation, impact sets
- `reference-fixtures.md` — the fixtures every phase runs against, and the required corpus cases
- `owner-testing-guide.md` — the 6 non-developer tests, run by P1-T7 at Phase 8
- `carried-forward-obligations.md` — **read before starting Phase 6 or 7.** Decisions and measured
  findings from Phase 3 that bind later phases, including why an r0 keyword rule does not work and
  why a new r0 gate rule must ship advisory. Kept here because the run directory it was first
  written in is gitignored.
- `acceptance-evidence.md` — LC-01…LC-18 evidence table. **NOT YET CREATED**; Phase 8 owns it.
  Listed here since Phase 1 as a forward reference, which is why it reads as though it exists.
