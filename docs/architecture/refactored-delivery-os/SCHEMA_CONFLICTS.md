# Schema Conflicts

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

Every conflict below was verified against the model source on `origin/main`, not inferred
from documentation.

---

## C-01 — `Project` requires an enrollment and a program blueprint

**Severity: blocking for E2E scenario B (commercial client).**

```ts
// backend/src/models/Project.ts:98-109
enrollment_id: { type: DataTypes.UUID, allowNull: false },
program_id:    { type: DataTypes.UUID, allowNull: false,
                 references: { model: 'program_blueprints', key: 'id' } },
```

A commercial client project has no enrollment and no program blueprint.

**Blast radius:** 32 files touch `Project`. The ones that would need a null-guard on every
read if the columns were relaxed:

```
services/projectService.ts                    services/projects/projectReadService.ts
services/projects/projectWriteService.ts      services/projects/projectArchiveService.ts
services/projects/projectMentorService.ts     services/projectSetupService.ts
services/projectWorkflowService.ts            services/projectVariableService.ts
services/projectRequirementsContextService.ts services/portfolioGenerationService.ts
services/portfolioShareService.ts             services/portfolioEnhancementService.ts
services/showcaseArtifactService.ts           services/studentTaskService.ts
services/studentWorkspaceService.ts           services/architectBuildPollerService.ts
services/requirementsGenerationService.ts     services/buildArtifactService.ts
services/runtime/buildArtifactService.ts      services/mentorInterventionService.ts
services/executiveDeliverableService.ts       services/buildLogDraftService.ts
services/autonomousRequirementExpansionService.ts services/personHistoryService.ts
services/projectMentorService.ts              services/ops/bcSyncService.ts
routes/projectRoutes.ts                       routes/admin/projectOverviewRoutes.ts
routes/admin/previewStackRoutes.ts            routes/admin/productionCleanupRoute.ts
scripts/backfillProjectsForEnrollments.ts     services/__tests__/studentTaskService.test.ts
```

**Resolution — as the master plan specifies (§2.2), not a relaxation:**

```
DeliveryProject                     (new table, tenant/brand/org scoped, no enrollment)
  └── source_student_project_id     (nullable FK -> projects.id)
```

`Project` is left exactly as it is. A student project can be *linked into* a delivery
context; a client project simply never has a link. Nothing in the 32 files changes.

**Rejected alternative:** making the columns nullable. It converts a compile-time
guarantee into 32 runtime null-checks, and the first one anybody forgets is a crash on a
student's Projects page.

---

## C-02 — `Organization` requires an enrollment, and only one per enrollment

**Severity: blocking for E2E scenario B. Not identified in the master plan.**

```ts
// backend/src/models/Organization.ts:72-77
owner_enrollment_id: {
  type: DataTypes.UUID,
  allowNull: false,
  unique: true,        // one management account per manager enrollment
  references: { model: 'enrollments', key: 'id' },
}
```

Master plan §6 makes `Organization` the parent of `DeliveryEngagement`:

```
Tenant → Brand → Organization → DeliveryEngagement → DeliveryProject
```

But today's `Organization` is **a manager's management account**, not a client company.
It cannot exist without a student enrollment, and an enrollment can own at most one.

An AI Flotation client — a real external company with an acceptance owner who has never
enrolled in anything — cannot be represented.

**Three options, with a recommendation:**

| Option | Change | Cost | Risk |
|---|---|---|---|
| **A (recommended)** | Relax `owner_enrollment_id` to nullable + drop the unique constraint; add `organization_type` discrimination (column already exists) | 1 DDL module, audit of `orgService`/`adminOrgService` read paths for null-owner | Low — the column is already `declare owner_enrollment_id: string` with a real FK, so every existing row keeps its owner. New rows without one are additive |
| B | New `ClientOrganization` table parallel to `Organization` | No change to existing behaviour | Two org concepts, two isolation stories, two places to get tenant scoping wrong. This is how the platform ends up with two truths |
| C | Hang `DeliveryEngagement` off `Brand` and skip `Organization` | Smallest schema change | Loses the client-company grain the plan needs for scenario B and for government work |

**Recommendation was A.** Note that `organization_type` and `lead_id` columns already
exist on the model, which suggests the "org that is not a student's management account"
case was already anticipated.

> ✅ **DECIDED — Option A, approved by Ali 2026-08-23.** Gate 1 relaxes
> `owner_enrollment_id` to nullable and drops the unique constraint on the existing
> `organizations` table, with `organization_type` as the discriminator. Existing rows keep
> their owner and FK. Every read path assuming a non-null owner must be null-guarded in
> the same change. **Not cleanly reversible** once a client org exists.

This was a governance escalation — it changes the meaning of an existing production
table — and its decision is recorded in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) ESC-1.

---

## C-03 — `EvidenceRecord` requires an enrollment

**Severity: blocking for Gate 9.**

```ts
// backend/src/models/EvidenceRecord.ts
declare enrollment_id: string;   // NOT NULL
declare source_type: EvidenceSource;
declare idempotency_key: string;
```

`EvidenceSource` is a closed union of 9 student-oriented values:

```
'prompt_lab' | 'github_commit' | 'github_pr' | 'artifact' | 'peer_review'
| 'instructor_review' | 'deliverable' | 'implementation' | 'portfolio'
```

Gate 9 requires `test_run`, `browser_run`, `screenshot`, `visual_diff`, `security_scan`,
`accessibility_scan`, `AI_eval`, `architecture_review`, `design_approval`,
`client_acceptance`, `deployment_verification`, `operational_metric`. None exist, and no
row can be written without an enrollment anyway.

**Resolution:** a sibling `DeliveryEvidence` table keyed on `delivery_project_id`, reusing
`EvidenceRecord`'s proven `idempotency_key` pattern verbatim.

Master plan §2.5 says "do not create duplicate evidence for the same event." Honoured by
direction of flow: a **builder-credit** event may project from `DeliveryEvidence` into
`EvidenceRecord` when the builder holds an enrollment, keyed on the same idempotency key.
Delivery evidence never duplicates student evidence; it may *cause* one derived row, once.

---

## C-04 — No migration framework; 53 boot-time DDL modules

**Severity: constraint, not blocker.**

`backend/src/db/` holds 53 `ensure*Schema.ts` modules of idempotent raw DDL executed at
boot. Multi-tenancy Gate 0 D-02 records why: `sync({alter:true})` once produced ~50k
duplicate constraints and OOM-ed Postgres.

**Consequence:** every table this plan adds needs a hand-written module that is safe on
every boot, forever. Reference implementation: `db/ensureMultiTenantSchema.ts` — 69
statements, rehearsed against a structure-only dump of the real 373-table production
schema, zero errors, idempotent on the second run.

**Rule adopted:** one `ensureRefactoredDeliverySchema.ts`, additive only, zero drops, zero
renames, zero retypes, zero `NOT NULL` on any existing column — and rehearsed the same way
before it is armed.

---

## C-05 — `leads.id` is INTEGER while everything else is UUID

**Severity: informational.**

Inherited from multi-tenancy D-03. `DeliveryEngagement.source_lead_id` must be
INTEGER, not UUID. Called out because it will look like a typo in review.

---

## C-06 — Name collision check

| Proposed | Existing | Verdict |
|---|---|---|
| `DeliveryEngagement` | `models/EngagementEvent.ts` (tracking/activity event) | No collision. **A bare `Engagement` would collide** — keep the `Delivery*` prefix |
| `DeliveryProject` | `models/Project.ts` | No collision |
| `AgentDefinition` | `AgentRun`, `AgentTask`, `AgentCreationProposal`, `AgentPerformanceMetric`, `AgentAttachment`, `AgentWriteAudit` | No direct collision, but the `Agent*` namespace is crowded with the **ops** agent fleet. A delivery-scoped agent contract is a different thing from an ops agent. Recommend `DeliveryAgentDefinition` |
| `DeliveryDecision` | none | Clear |
| `DeliveryContract` | none | Clear |
| `ExecutionRun` | `AgentRun`, `QueueHistoryEntry` | Clear, but prefer `DeliveryExecutionRun` for symmetry |

---

## Summary

| ID | Conflict | Severity | Resolution |
|---|---|---|---|
| C-01 | `Project` needs enrollment + program | Blocking | New `DeliveryProject`, optional link. No change to `Project` |
| C-02 | `Organization` needs enrollment, unique | Blocking, **unflagged by the plan** | Relax to nullable (option A) — **escalation** |
| C-03 | `EvidenceRecord` needs enrollment, closed source union | Blocking | Sibling `DeliveryEvidence`, one-way projection |
| C-04 | No migration framework | Constraint | One additive, rehearsed `ensure*Schema` module |
| C-05 | `leads.id` INTEGER | Informational | Type `source_lead_id` as INTEGER |
| C-06 | `Agent*` namespace crowded | Informational | `Delivery*` prefix throughout |
