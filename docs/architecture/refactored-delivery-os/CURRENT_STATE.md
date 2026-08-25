# Refactored AI Delivery OS — Current State

**Session:** CC-20260823-r4k9
**Base SHA:** `d1d46d1e72ead44d6e4c04d2ca7c54966843d51e` (`origin/main`)
**Branch:** `workstream/refactored-delivery-os-gate0`
**Worktree:** `C:/Users/ali_m/refactored-os-wt` (external to OneDrive)
**Date:** 2026-08-23
**Gate:** 0 — Discovery. **No feature code was written.**

---

## D-00 — The checkout the plan was written against is not the codebase

The first thing Gate 0 established is that the tree this work was requested in is not
the source of truth.

| Measure | Value |
|---|---|
| OneDrive checkout branch | `workstream/chapter-quality-and-worker` |
| Behind `origin/main` | **2,722 commits** |
| Ahead | 76 commits |
| Uncommitted files from concurrent sessions | ~50 |

Every path the master plan names under `docs/architecture/multi-tenancy/`,
`docs/BUILD_PIPELINE_*.md`, `docs/REPO_CONNECT_CONTRACT.md` and
`backend/src/services/sbp/` is **absent from that checkout and present on `origin/main`**.
Verified path-by-path with `git cat-file -e`:

```
----- MAIN  docs/architecture/multi-tenancy/CURRENT_STATE.md
----- MAIN  docs/BUILD_PIPELINE_REQUIREMENTS.md
----- MAIN  docs/REPO_CONNECT_CONTRACT.md
----- MAIN  backend/src/routes/sbpRoutes.ts
LOCAL ----  backend/src/services/buildPlanIngestService.ts   <- exists ONLY in the stale tree
```

The last line is the dangerous one: `buildPlanIngestService.ts` is named in master plan
§2.3 as something to trace and reuse. It exists **only** in the stale checkout and was
deleted or renamed on `main` at some point in those 2,722 commits. Any plan built by
reading the OneDrive tree would have designed around a service that no longer exists.

This is the same failure the multi-tenancy Gate 0 caught (its D-01, at 2,586 commits
behind). It has now happened twice. See
[MIGRATION_STRATEGY.md](MIGRATION_STRATEGY.md) for the standing rule.

**All findings below are from `origin/main` at `d1d46d1e`, in a clean external worktree.**

---

## 1. Multi-tenancy — real, mostly built, one load-bearing gap

Master plan §2.1 says "do not recreate tenancy." Correct: it exists.

All 11 named models are present in `backend/src/models/`:

```
Tenant.ts          Brand.ts             BrandDomain.ts       SenderProfile.ts
PlatformIdentity.ts PlatformIdentityLink.ts TenantMembership.ts LeadTenantContext.ts
CommunicationPreference.ts TenantAccessAudit.ts Organization.ts
```

The tenancy logic lives in `backend/src/modules/tenancy/` — `tenantRoles.ts`,
`tenantAuthorization.ts`, `tenantAccessGuards.ts`. Roles are compared in exactly one
place by design.

Per `docs/architecture/multi-tenancy/IMPLEMENTATION_STATUS.md`, Gates 1–4 and 6 are
COMPLETE, 7 is PARTIAL (196/196 unit+integration green, 73 isolation checks, Playwright
not executed), 8 NOT STARTED. The DDL was rehearsed against a structure-only dump of the
real production schema (373 tables): 69 statements, zero errors, idempotent on second run.

### The gap that blocks this plan: Gate 5, Organization scoping

`docs/architecture/multi-tenancy/IMPLEMENTATION_STATUS.md` reports Gate 5 as **PARTIAL**
and explains the reasoning: every organization today is Colaberry Enterprise, so scoping
changes no behaviour until a second tenant owns one.

Verified independently — this is not stale documentation:

```
$ grep -c "tenant_id" services/orgService.ts services/adminOrgService.ts
services/orgService.ts:0
services/adminOrgService.ts:0
```

**Zero.** Neither org service filters by tenant.

The deferral was correct when it was made and is not correct any more. Master plan §6
places `DeliveryEngagement` under `Organization`, and §2.1's E2E scenario B is
"AI Flotation tenant → client org → engagement". The moment a second tenant owns an
organization, an unscoped `orgService` is a cross-tenant read. **This is a Gate 1
prerequisite, not a Gate 1 task** — see [MIGRATION_STRATEGY.md](MIGRATION_STRATEGY.md).

---

## 2. `Project` cannot generalize as-is — confirmed, with the blast radius

Master plan §2.2 hypothesised this. Confirmed at the schema level:

```ts
// backend/src/models/Project.ts
enrollment_id: { type: DataTypes.UUID, allowNull: false }
program_id:    { type: DataTypes.UUID, allowNull: false,
                 references: { model: 'program_blueprints', key: 'id' } }
```

Both are `NOT NULL`; `program_id` carries a foreign key to `program_blueprints`. A
commercial client project has neither an enrollment nor a program blueprint.

**Blast radius if made nullable:** 32 files read or write `Project`, including
`projectService`, `projects/projectReadService`, `projects/projectWriteService`,
`projectSetupService`, `portfolioGenerationService`, `showcaseArtifactService`,
`studentTaskService`, `architectBuildPollerService`, `routes/projectRoutes.ts` and
`routes/admin/projectOverviewRoutes.ts`. Every one currently assumes an enrollment
exists.

The plan's instruction — *"DO NOT make those nullable just to support client projects"* —
is upheld. See [SCHEMA_CONFLICTS.md](SCHEMA_CONFLICTS.md) for the recommended structure.

### The same trap, one level up, and the plan does not mention it

```ts
// backend/src/models/Organization.ts
owner_enrollment_id: {
  type: DataTypes.UUID,
  allowNull: false,
  unique: true,
  references: { model: 'enrollments', key: 'id' },
}
```

**An `Organization` cannot exist without an enrollment**, and only one org per
enrollment. `Organization` today models "a manager's management account", not "a client
company". Master plan §6 hangs the entire commercial ownership chain off `Organization`,
so this constraint blocks scenario B just as hard as `Project.enrollment_id` blocks
scenario A — and unlike the `Project` case, the plan does not flag it.

Recorded as **C-02** in [SCHEMA_CONFLICTS.md](SCHEMA_CONFLICTS.md).

---

## 3. Student Build Pipeline — the single largest reusable asset

`backend/src/services/sbp/` holds **35 source modules** plus 52 test files. The modules
that matter to this plan:

| Module | What it already does | Plan gate it serves |
|---|---|---|
| `planContract.ts` | Requirement/Release/Story types + JSON schema for structured output. Requirement kinds `FUNC · SAFE · REL · NFR · OBS · CONSTRAINT`, priorities `must · should` | Gate 7 |
| `planGate.ts` | Pure, deterministic traceability gate. **Fails closed.** Every-must-needs-a-story, dangling-reference and malformed-row rules, split into blocking vs warning | Gate 7 |
| `decomposeService.ts` / `decomposePrompt.ts` | Brief + requirements → releases → vertical stories | Gate 7 |
| `boundedQueue.ts` | Hard concurrency ceiling, `QueueFullError`, single shared instance | Gate 16 (cost/concurrency) |
| `workspaceRepo.ts` | "Which GitHub repo belongs to this project?" with `access_unknown` vs `pull_only` distinction | Gate 8 |
| `repoWriter.ts` | One content-hash-idempotent commit, path-allowlisted (`CLAUDE.md`, `docs/**`, `.colaberry/**`), enforced by throwing, bot-authored so the push webhook skips its own writes | Gate 8 |
| `materializeTasks.ts` | Idempotent task materialization (has a dedicated idempotency test) | Gate 7 |
| `renderDocs.ts` / `docsBundle.ts` | Plan → document set | Gate 7 |
| `intakeQuestionsService.ts` | Intake interview | Gate 4 |
| `scopeAgents.ts` | Per-story agent scoping | Gate 5 |
| `planStore.ts` / `planHash.ts` / `planRepair.ts` | Persistence, change detection, repair | Gate 7 |

These are written as if generalization were already anticipated: `planContract.ts` is
pure types with "no I/O, no imports from services", and `planGate.ts` is pure and
deterministic. Neither imports an enrollment.

**What is student-coupled is the entry, not the engine.** All 5 SBP HTTP routes are
`requireParticipant`:

```
POST /api/portal/sbp/intake/questions
POST /api/portal/sbp/builds
GET  /api/portal/sbp/builds/:projectId
POST /api/portal/sbp/builds/:projectId/publish
GET  /api/portal/sbp/builds/:projectId/stories/:storyId/prompt
```

Full generic/specific split in [SBP_INTEGRATION_MAP.md](SBP_INTEGRATION_MAP.md).

---

## 4. Execution plane — more exists than the plan assumes, and one security finding

### Claude Code SDK: **not present**

`backend/package.json` declares `"@anthropic-ai/sdk": "^0.106.0"`. There is **no**
`@anthropic-ai/claude-code`, no Agent SDK, and no `claude-code`/`ClaudeCode` symbol
anywhere in `backend/src` or `frontend/src`. (`services/intel/sources/claude_code_technique.ts`
is a curriculum content source, not an execution integration.)

Gate 8's "use the official Claude Code SDK if approved and available" therefore resolves
to: **a new dependency, which is a governance escalation** under root `CLAUDE.md`
("External dependency introduction"). Flagged, not decided.

### A sandbox already exists — `previewStackService.ts`

This is the most useful undiscovered asset in the repo for Gate 8. Per its own header,
it provisions "per-project preview stacks (isolated docker-compose environments booted
from the user's own repo)", allocates ports from a reserved pool, clones with the
project's GitHub token, and records lifecycle on `PreviewStack` + `PreviewEvent`.

**And it carries a security finding.** Its stated assumption:

> Backend container has the docker socket mounted (`/var/run/docker.sock`) and the
> `docker` CLI available on PATH.

Docker socket access from the backend container is root-equivalent on the host. Master
plan §5.7 and §11 require that client/student code never execute in the main backend
process. A backend that can drive the Docker daemon does not literally violate that — the
code runs in a sibling container — but it means **the isolation boundary is one API call
wide, and the process holding the key also serves HTTP**. Recorded as **S-01** in
[EXECUTION_CAPABILITY_MAP.md](EXECUTION_CAPABILITY_MAP.md).

### Queue

No `bull`/`bullmq`/`agenda`. `node-cron ^4.2.1` for scheduling, plus in-repo queues:
`sbp/boundedQueue.ts` (in-process, bounded) and
`intelligence/systemStateEngine/queue/authoritativeTaskQueue.ts`. There is **no durable,
restart-surviving job queue**. Gate 8's `ExecutionRun` state machine
(`queued → provisioning → … → completed`) needs one; an in-process queue loses every
in-flight run on deploy. Recorded as **E-03**.

### AI provider abstraction: partial

`services/runtime/anthropicClient.ts` (121 lines) wraps Anthropic with cost accounting
and a `MENTOR_ANTHROPIC_MODEL` env override. But **43 files instantiate OpenAI directly**
and there is no `services/ai/` directory. Master plan §5.2 requires replaceable engines;
today the provider is inlined at 43 call sites. Not a blocker for Gate 8 (the new
`ExecutionProvider` interface is greenfield) but it means "engines are replaceable" is
aspirational for the rest of the platform.

---

## 5. Approval and risk — an R0–R4 model already exists

Master plan §Gate 2 proposes risk levels R0–R5 as if new. A comparable system is live:

```ts
// backend/src/services/agentAutonomy.ts
export type AutonomyLevel = 'observe' | 'suggest' | 'act_audited' | 'communicate';
// per-action R0-R4 risk tier (already on tickets.risk_tier / work_ledger_events.risk_tier)
```

`models/ApprovalRequest.ts` carries `risk_tier`, `autonomy_level`, `prepared_action`,
`approval_scope`, `expires_at`, `decided_by`, `decision_channel`, and:

```ts
export type ApprovalVerdict = 'would_allow' | 'would_require_approval' | 'would_block';
export type ApprovalStatus  = 'shadow_logged' | 'pending' | 'approved' | 'rejected' | 'expired';
```

`shadow_logged` is notable — the platform already knows how to run an authorization model
in observe-only mode before enforcing it. That is exactly how delivery risk levels should
be introduced.

Supporting services: `agentAuthorizationService.ts`, `agentPermissionService.ts`,
`agentAutonomy.ts`, `models/OpsApprovalQueueItem.ts`, `db/ensureApprovalRequestsSchema.ts`.

**Gate 2 should extend this vocabulary, not invent a parallel one.** Full mapping in
[AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).

---

## 6. Evidence — exists, but scoped to the wrong parent

`models/EvidenceRecord.ts`:

```ts
declare enrollment_id: string;        // NOT NULL
declare card_id: string | null;
declare source_type: EvidenceSource;  // 'prompt_lab' | 'github_commit' | 'github_pr' |
                                      // 'artifact' | 'peer_review' | 'instructor_review' |
                                      // 'deliverable' | 'implementation' | 'portfolio'
declare idempotency_key: string;      // dedup already solved
```

The idempotency key is already there, which satisfies master plan §15's
"same execution callback ⇒ no duplicate evidence" for free. But **`enrollment_id` is
required**, so a client delivery project cannot write an `EvidenceRecord` — the same
constraint as `Project`, one table down.

`models/EvidenceArtifact.ts` is `ticket_id`-scoped with types
`screenshot | log | diff | receipt | other`. Neither model can currently hold
`test_run`, `browser_run`, `visual_diff`, `security_scan`, `accessibility_scan`,
`AI_eval`, `client_acceptance` or `deployment_verification`.

Also present: `EvidenceLink.ts`, `StudentSkillEvidence.ts`, `PortfolioArtifact.ts`,
`ProjectArtifact.ts`, `ShowcaseArtifact.ts`, `Artifact.ts`, `ArtifactDefinition.ts`,
`ArtifactRelationship.ts`, `db/ensureEvidenceSchema.ts`.

Detail in [EVIDENCE_INTEGRATION_MAP.md](EVIDENCE_INTEGRATION_MAP.md).

---

## 7. Schema management: no migration framework

**53** `ensure*Schema.ts` modules under `backend/src/db/`, each idempotent raw DDL run at
boot. Confirmed by the multi-tenancy Gate 0's D-02: `sync({alter:true})` once produced
~50k duplicate constraints and OOM-ed Postgres.

Consequence for this plan: every table it adds is a hand-written idempotent DDL module
that must be safe to run on every boot, forever. Not a blocker — a well-trodden path with
`ensureMultiTenantSchema.ts` (69 statements, rehearsed) as the reference implementation.

---

## 8. Namespace: `/refactored` is clean

No occurrence of `refactored` in `frontend/src/routes/*.tsx` or `backend/src/routes/`.
The route namespace in master plan §9 is unclaimed. Route trees are
`adminRoutes.tsx`, `portalRoutes.tsx`, `publicRoutes.tsx`, `referralRoutes.tsx` — a fifth
tree is the conventional addition. See [ROUTE_IMPACT.md](ROUTE_IMPACT.md).

### One name collision

`models/EngagementEvent.ts` already exists and is unrelated to delivery engagements (it
is an activity/tracking event). `DeliveryEngagement` as a model name does not collide;
a bare `Engagement` would. Keep the `Delivery*` prefix throughout.

---

## 9. Case Study OS: not built

No `CaseStudy` model or service. The nearest existing surfaces are
`ShowcaseArtifact.ts` / `showcaseArtifactService.ts` and the portfolio services
(`portfolioGenerationService`, `portfolioShareService`, `portfolioEnhancementService`).
Master plan §Gate 15 speaks of "Case Study OS" as an existing consumer; it is not one
today. Detail in [CASE_STUDY_INTEGRATION_MAP.md](CASE_STUDY_INTEGRATION_MAP.md).

---

## 10. Answers to the Gate 0 question list (master plan, Checkpoint A)

| Question | Answer | Evidence |
|---|---|---|
| Can `Project` safely generalize? | **No.** `enrollment_id` + `program_id` both NOT NULL, `program_id` FK'd, 32 dependent files | §2 |
| What SBP parts are generic? | `planContract`, `planGate`, `decomposeService`, `boundedQueue`, `materializeTasks`, `renderDocs`, `planStore/Hash/Repair` — pure or near-pure. Coupling is in routes + `scheduleForEnrollment` | §3, SBP_INTEGRATION_MAP |
| What queue/job system exists? | `node-cron` + two in-process queues. **No durable queue.** | §4 |
| What AI provider abstractions exist? | Partial: `runtime/anthropicClient.ts`; 43 direct OpenAI instantiations | §4 |
| Does Claude Code SDK exist? | **No.** `@anthropic-ai/sdk ^0.106.0` only. New dep = escalation | §4 |
| What runner/sandbox infra exists? | `previewStackService.ts` — docker-compose per project, docker socket mounted into backend (**S-01**) | §4 |
| What approval models exist? | `ApprovalRequest` + `agentAutonomy` R0–R4 + `shadow_logged` mode | §5 |
| What client/org portal exists? | None client-facing. `Organization` is a manager's account, enrollment-bound | §2, CLIENT_PORTAL_MAP |
| Which evidence types already work? | 9 `EvidenceSource` values, 5 `EvidenceArtifact` types — all enrollment/ticket-scoped | §6 |
| How will project roles coexist with tenant roles? | Separate registry. Tenant roles stay tenant-wide; delivery roles are project-scoped | AUTHORIZATION_MATRIX |
| Which tables inherit tenancy by parent? | Delivery children scope by join to `DeliveryProject`, per multi-tenancy D-05 | DATA_OWNERSHIP_MATRIX |
| What must remain backward compatible? | All 5 SBP routes, 32 `Project` consumers, `EvidenceRecord` writers, progression/portfolio | ROUTE_IMPACT, TEST_PLAN |
| What can later be extracted? | `planContract`/`planGate`/`decomposeService` (pure); `ExecutionProvider` contract | EXTRACTION notes in DOMAIN_REUSE_MAP |

---

## 11. Gate 0 verdict

The source-of-truth map is **not ambiguous** — the plan may proceed to Checkpoint B — with
three conditions recorded before any schema work:

1. **Organization tenant scoping (multi-tenancy Gate 5) must close first.** It is a
   prerequisite, not a parallel task.
2. **`Organization.owner_enrollment_id` must be resolved** (C-02). It blocks commercial
   client orgs as hard as `Project.enrollment_id` blocks client projects, and the master
   plan does not mention it.
3. **Two governance escalations are open** and are Ali's call, not Claude's:
   the Claude Code SDK dependency, and the execution isolation model given S-01.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the deviation register.
