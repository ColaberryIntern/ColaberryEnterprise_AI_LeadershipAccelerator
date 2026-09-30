# Domain Reuse Map

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

For each capability the master plan requires: does it exist, where, and is the verdict
**REUSE**, **EXTEND**, or **BUILD**?

Counting the verdicts is itself a finding — of 34 capabilities, 9 are pure reuse, 12 are
extensions of something real, and 13 are genuinely new. The plan is roughly one third
greenfield, which is a very different project from what "build an AI Delivery OS" sounds
like.

---

## Legend

- **REUSE** — exists and serves the need; call it, do not fork it
- **EXTEND** — exists and is close; generalize or add to it
- **BUILD** — nothing serves this; new code

---

## Gate 1 — Delivery domain + tenancy

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Tenant / Brand / BrandDomain | ✅ | `models/Tenant.ts`, `Brand.ts`, `BrandDomain.ts` | **REUSE** |
| Tenant membership | ✅ | `models/TenantMembership.ts` | **REUSE** |
| Platform identity | ✅ | `models/PlatformIdentity.ts`, `PlatformIdentityLink.ts` | **REUSE** |
| Cross-tenant audit | ✅ | `models/TenantAccessAudit.ts`, `modules/tenancy/tenantAccessGuards.ts` | **REUSE** |
| Organization | ⚠️ | `models/Organization.ts` — enrollment-bound, unscoped services | **EXTEND** — see C-02 |
| `DeliveryEngagement` | ❌ | — | **BUILD** |
| `DeliveryProject` | ❌ | — | **BUILD** |
| `DeliveryProjectSourceLink` | ❌ | — | **BUILD** |
| Additive boot DDL pattern | ✅ | `db/ensureMultiTenantSchema.ts` (69 stmts, rehearsed) | **REUSE** (pattern) |

## Gate 2 — Roles + authority

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Central role registry pattern | ✅ | `modules/tenancy/tenantRoles.ts` | **REUSE** (pattern) |
| Tenant authorization guards | ✅ | `modules/tenancy/tenantAuthorization.ts` | **REUSE** |
| Risk tiers R0–R4 | ✅ | `services/agentAutonomy.ts`, `tickets.risk_tier` | **EXTEND** — add R5 |
| Approval request lifecycle | ✅ | `models/ApprovalRequest.ts` + `ensureApprovalRequestsSchema.ts` | **EXTEND** |
| Shadow-mode authorization | ✅ | `ApprovalStatus.shadow_logged` | **REUSE** |
| `DeliveryProjectMember` | ❌ | — | **BUILD** |
| Delivery role registry | ❌ | — | **BUILD** (mirroring `tenantRoles.ts`) |
| Builder Authority Profile | ❌ | — | **BUILD** |

## Gate 3 — Contract + project graph

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| `DeliveryContract` (versioned, approved snapshot) | ❌ | — | **BUILD** |
| Decision ledger | ⚠️ | `docs/architecture/multi-tenancy/DECISIONS_LOG.md` is a *document*, not a table. `models/AgentCreationProposal.ts` is the nearest record | **BUILD** |
| Project graph traversal | ❌ | — | **BUILD** (relational; no graph DB — plan §Gate 3) |
| Change requests with impact | ❌ | — | **BUILD** |

## Gate 4 — Intake + discovery

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Intake interview | ✅ | `sbp/intakeQuestionsService.ts`, `intakeQuestionsPrompt.ts` | **EXTEND** |
| Requirements generation | ✅ | `services/requirementsGenerationService.ts`, `intelligence/requirements/` | **EXTEND** |
| Existing-system discovery | ✅ | `services/brownfieldDiscoveryService.ts` (1,198 lines) | **EXTEND** — serves "I Have an Existing System" |
| Requirement grouping | ✅ | `intelligence/requirements/requirementGrouper.ts` | **REUSE** |
| Discovery snapshot approval | ❌ | — | **BUILD** |
| AI Opportunity Map | ❌ | — | **BUILD** |

`brownfieldDiscoveryService.ts` is a notable find — one of the five starting points in
master plan §4 already has a 1,198-line service behind it.

## Gate 5 — Trust Before Intelligence

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Agent fleet + runs | ✅ | `models/AgentRun.ts`, `AgentTask.ts`, `AgentPerformanceMetric.ts`, `services/agents/**` | **REUSE** (ops fleet; distinct from delivery agents) |
| Per-story agent scoping | ✅ | `sbp/scopeAgents.ts` | **EXTEND** |
| Agent write audit | ✅ | `models/AgentWriteAudit.ts` | **REUSE** |
| Agent creation proposal | ✅ | `models/AgentCreationProposal.ts` | **EXTEND** |
| `DeliveryAgentDefinition` (INPACT, autonomy boundary, eval suite) | ❌ | — | **BUILD** |
| INPACT™ / 7-layer / GOALS™ as data | ❌ | — | **BUILD** — see caveat below |
| Architecture-of-Trust map | ❌ | — | **BUILD** |

**D-04 is closed.** The canonical book at
`https://github.com/colaberry/trust-before-intelligence-book` was read from `manuscript/`
at `main`. The vocabulary in the master plan is correct, and the book additionally defines
**exact scoring scales** — INPACT 1–6 per dimension (36 max, scaled to 100), GOALS 1–5 per
dimension (25 max) — plus a mandatory INPACT dependency order and regulatory thresholds.
Gate 5 must use those scales rather than design its own. Full detail in
[TRUST_BEFORE_INTELLIGENCE_INTEGRATION.md](TRUST_BEFORE_INTELLIGENCE_INTEGRATION.md).

## Gate 6 — Design decision loop

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Design system / tokens | ✅ | `.claude/skills/baseline-ui`, `frontend-design`, `frontend/CLAUDE.md` | **REUSE** |
| Component versioning + snapshots | ✅ | `docs/architecture/experience-builder/ARCHITECTURE.md`, `services/components/` | **EXTEND** |
| Dependency graph + cycle prevention | ✅ | Experience Studio | **REUSE** |
| Lifecycle transitions, cost estimation, sandboxed preview, version compare | ✅ | Experience Studio | **EXTEND** |
| `DesignDecision` + variants + approval | ❌ | — | **BUILD** |
| Visual Contract | ❌ | — | **BUILD** |

## Gate 7 — Release / story graph

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Plan contract types + JSON schema | ✅ | `sbp/planContract.ts` (pure) | **REUSE** |
| Fail-closed traceability gate | ✅ | `sbp/planGate.ts` (pure, deterministic) | **REUSE** |
| Decomposition to releases + stories | ✅ | `sbp/decomposeService.ts` | **EXTEND** |
| Plan persistence / hash / repair | ✅ | `sbp/planStore.ts`, `planHash.ts`, `planRepair.ts` | **EXTEND** |
| Idempotent task materialization | ✅ | `sbp/materializeTasks.ts` (+ idempotency test) | **EXTEND** |
| Document rendering | ✅ | `sbp/renderDocs.ts`, `docsBundle.ts` | **EXTEND** |
| Story Contract (risk, approval policy, evidence reqs) | ⚠️ | `PlanStory` is close; lacks risk level, execution policy, approval policy | **EXTEND** |
| Parallel-safe / collision calculation | ⚠️ | `sbp/fileOwnership.ts` is the seed | **EXTEND** |

## Gate 8 — Execution plane

See [EXECUTION_CAPABILITY_MAP.md](EXECUTION_CAPABILITY_MAP.md) for detail.

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Isolated workspace from a repo | ✅ | `services/previewStackService.ts` | **EXTEND** (blocked on S-01) |
| Idempotent, allowlisted repo commit | ✅ | `sbp/repoWriter.ts` | **EXTEND** |
| Repo resolution + access states | ✅ | `sbp/workspaceRepo.ts`, `repoWriteAccess.ts` | **REUSE** |
| Bounded concurrency | ✅ | `sbp/boundedQueue.ts` | **REUSE** |
| Prompt envelope per story | ✅ | `sbp/buildStoryPrompt.ts` | **EXTEND** |
| Claude Code execution | ❌ | — | **BUILD** — E-01 escalation |
| Durable run queue | ❌ | — | **BUILD** — DB-as-queue |
| Branch / PR / base-SHA pinning | ❌ | — | **BUILD** |
| `ExecutionProvider` etc. contracts | ❌ | — | **BUILD** |

## Gate 9 — Quality OS + evidence

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Evidence record + idempotency key | ✅ | `models/EvidenceRecord.ts` | **EXTEND** — enrollment-bound (C-03) |
| Evidence artifacts | ✅ | `models/EvidenceArtifact.ts` (screenshot/log/diff/receipt) | **EXTEND** — ticket-bound |
| Evidence links | ✅ | `models/EvidenceLink.ts` | **REUSE** |
| Playwright harness | ✅ | `tests/systemV2` | **EXTEND** |
| Screenshot capture pipeline | ✅ | `scripts/captureHelpers.js`, `.claude/skills/screenshot-review` | **REUSE** |
| Security scanning | ✅ | `.github/workflows/secret-scan.yml`, `services/agents/security/` | **REUSE** |
| Accessibility auditing | ✅ | `.claude/skills/fixing-accessibility` (a skill, not a service) | **EXTEND** |
| Visual diff | ❌ | — | **BUILD** |
| AI evals | ❌ | — | **BUILD** |
| Release gate (fails closed on missing evidence) | ❌ | — | **BUILD** |

## Gate 10 — Client review room

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Client-facing portal | ❌ | Nothing client-facing exists | **BUILD** |
| Client acceptance object | ❌ | `AcceptanceChecklist.tsx` is a student UI component, not a durable record | **BUILD** |
| Role-aware projection | ⚠️ | Admin `mgmtRole`/`canSection` exists for staff | **BUILD** for clients |

## Gate 11 — Builder workspace + Experience Ledger

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Student skill evidence | ✅ | `models/StudentSkillEvidence.ts`, `ArchitectureSkillEvidenceBandWeights.ts` | **EXTEND** |
| Mentor intervention | ✅ | `services/mentorInterventionService.ts`, `projects/projectMentorService.ts` | **EXTEND** |
| Architect evaluation | ✅ | `services/agents/architectEvaluationAgent.ts` | **EXTEND** |
| Learn vs Delivery mode | ❌ | — | **BUILD** |
| Experience Ledger | ❌ | — | **BUILD** |

## Gates 12–15

| Capability | Exists? | Where | Verdict |
|---|---|---|---|
| Capacity / attention model | ❌ | — | **BUILD** |
| Cost accounting per run | ⚠️ | `runtime/anthropicClient.ts` has a `cost()` fn; `lib/openaiInstrumented.js` instruments | **EXTEND** |
| `DeliveryProfile` (gov/commercial/internal) | ❌ | — | **BUILD** |
| Government compliance categories | ❌ | `docs/GOV_REGISTRATION_PLAYBOOK.md` is process, not a profile | **BUILD** |
| Operate / GOALS signals | ⚠️ | `models/OutcomeMeasurement`, `ensureOutcomeMeasurementsSchema.ts`, ops health agents | **EXTEND** |
| Case Study OS | ❌ | `showcaseArtifactService.ts` + portfolio services are the nearest | **BUILD** — see [CASE_STUDY_INTEGRATION_MAP.md](CASE_STUDY_INTEGRATION_MAP.md) |
| Visitor / session / page event / lead attribution | ✅ | `modules/attribution/`, `LeadTenantContext` | **REUSE** |

---

## Tally

| Verdict | Count |
|---|---|
| REUSE | 9 |
| EXTEND | 12 |
| BUILD | 13 |

**The largest single reuse is SBP** (`planContract` + `planGate` + decomposition +
materialization + repo writing), and the largest single BUILD is the **execution plane**,
which is also the one gated on two escalations.

---

## Anti-duplication rules adopted

1. **Do not recreate tenancy.** Every delivery read goes through
   `modules/tenancy/tenantAuthorization.ts`.
2. **Do not fork `planGate`.** If delivery needs a rule, add it to the shared gate with a
   profile flag, and keep the pilot fixture verdict stable.
3. **Do not create a second progression system.** `DeliveryEvidence` projects *into*
   `EvidenceRecord` for builder credit, once, keyed on the shared idempotency key —
   never the reverse, and never both writing for one event (master plan §2.5).
4. **Do not create a second approval system.** Extend `ApprovalRequest`.
5. **Do not create a second organization concept.** Resolve C-02 on the existing table.
6. **Do not introduce a graph database.** Master plan §Gate 3 forbids it absent evidence
   that relational modelling is inadequate; none was found.
