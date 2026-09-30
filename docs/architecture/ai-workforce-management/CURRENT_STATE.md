# AI Workforce Management — Current State (Checkpoint A)

**Status:** Discovery only. No code written. **Session:** CC-20260818-x4nk (continued). **Date:** 2026-08-27.
**Method:** 4 parallel research agents (chat/notification; scheduler/reporting/communication; goals/memory/approvals; org chart/reports-to/AiAgent/authorization) + direct verification of every load-bearing claim before this document was written. All citations are `file:line` against `C:\Users\ali_m\ai-workforce-mgmt-wt` at `origin/main` `7a0ad328`.

This document answers the mission's core Gate A question — **what does the platform already have, real and today** — before any new model, route, or UI is proposed. `DOMAIN_REUSE_MAP.md` turns this into REUSE / EXTEND / BUILD-NEW verdicts for each concept the mission proposed.

---

## A. The real, current Agent Detail surface (`/admin/agents/:id`)

This is the actual "here is everything the platform knows about this AI agent" page the mission wants to evolve.

- `frontend/src/pages/admin/AgentDetailPage.tsx` (450 lines) — renders, in order: header stats (live status, enabled, persona version, open tickets) → Identity → Trust Contract (autonomy_level, trigger/schedule/last-run/duration/runs/errors, honest fallback text when `trust_contract.trigger_type` is null) → `AgentTrustSummaryCard` (cost_summary, authorization_summary, persona_version_history — shipped this session, PR #1858/#1861) → System prompt (raw, read-only) → Reports-to (immediate_agent, trail, resolved_human) → `AgentToolsCapabilitiesCard` → reads/produces + undocumented-tools disclosure → `AgentScheduledTasksCard` → `AgentTicketActivityTable`.
- `frontend/src/services/agentDetailApi.ts` — the typed client; `backend/src/services/reese/agentDetailService.ts` — the backend assembler (despite its path, it is generic-by-design: works off `AiAgent.id`, not a Reese-only special case — see `DOMAIN_REUSE_MAP.md` item on relocating it).
- Route: `GET /api/admin/agents/:id` in `backend/src/routes/admin/agentDetailRoutes.ts:9` — **flat `requireAdmin`, no manager-vs-admin distinction** (see section C).

**What this page can already answer, live, with real data:** identity, autonomy level, declared trigger/schedule, real cost (`ai_events.cost_usd`, fixed this session for Reese — PR #1868), real authorization-shadow-mode summary, real persona-version history, real reports-to chain, real tools/capabilities, real ticket activity. This is a strong foundation — Checkpoint B/C/D should extend this page, not replace it.

## B. `AiAgent` — the canonical registry (must stay canonical, per the mission's own non-negotiable #1)

`backend/src/models/AiAgent.ts` — table `ai_agents`. Confirmed no drift from this session's own last edit (`bc79e008`). Relevant columns: `id (UUID)`, `agent_name`, `agent_type`, `department`, `enabled`, `autonomy_level`, `autonomy_level_set_at`, `reports_to_type ('human'|'agent')`, `reports_to_id`, `persona_version`, `system_prompt`, `config (JSONB, default {})`, `tools_granted`. **No DB-level FK on `reports_to_type`/`reports_to_id`** — deliberate convention (polymorphic target: either an `org_members.id` or another `ai_agents.id`).

`config` is a real JSONB column but every real usage across `agentRegistrySeed.ts:303-459` is a static operational threshold (`max_retry_attempts`, `open_rate_threshold`, etc.) — never accumulated learning or durable instructions. A repo-wide grep for `config.memory|config.learn|config.insight|config.observation|config.fact|config.knowledge` returns **zero matches**. This matters directly for the mission's non-negotiable #5 (manager instructions must not mutate `system_prompt`, and must not silently live in `config` either) — neither existing column is a safe home for durable manager instructions; a new versioned object is genuinely required (see `TARGET_ARCHITECTURE.md`).

## C. Authorization, autonomy, and the manager-vs-admin gap

**Confirmed: no manager-vs-admin distinction exists anywhere in the auth stack today.**

- `backend/src/middlewares/authMiddleware.ts` — the real `AuthPayload` JWT shape is `{ sub, email, role, mgmt_role?, portal_enrollment_id? }` (`:7-23`). `sub` is an `admin_users.id` (or, on a bridge-minted token, an enrollment id) — **there is no `org_members.id` anywhere in the token.**
- `requireAdmin` (`:58-78`) is a flat role check (`admin`/`super_admin`). Both `agentDetailRoutes.ts:9` and `agentGovernanceRoutes.ts` (all 12 routes, `:21-42`) use only this — any admin can read or approve/reject any agent's proposed actions today; there is no "does this admin actually manage this agent" check anywhere.
- **A real, live, more granular RBAC layer already exists and is a better precedent than building from scratch**: `backend/src/services/access/mgmtRoles.ts` — `MGMT_ROLE_DEFS` (`owner|admin|curriculum|revenue|admissions|support|community_organizer|mentor`), each mapped to a `SectionKey[]` (`dashboard|trust|war_room|revenue|campaigns|...`). `requireSection(section)` (`authMiddleware.ts:90-110`) is the enforcement pattern: never trust frontend nav-hiding, always check server-side against the JWT's `mgmt_role`. This is the right shape to imitate for agent-manager scoping, not the shape to duplicate.
- **A real predicate-middleware precedent for "narrower than admin"** also exists: `requireCoryAuthorized` (`authMiddleware.ts:181-214`) — checks `email === 'ali@colaberry.com' || role === 'super_admin'` directly in middleware, explicitly closing a real prior hole (19 unauthenticated Cory routes, closed 2026-05-22). Confirms the pattern this repo already uses when a route needs tighter-than-`requireAdmin` scoping.
- **The real manager-authorization building block**: `resolveHumanDownstreamAgents(orgMemberId)` and `isAgentInHumanDownstream(orgMemberId, agentId)` in `backend/src/services/workforce/orgChartHierarchyService.ts:110-141`. Walks `AiAgent.reports_to_type/reports_to_id` from a human `org_members.id` down through leadership → staff (bounded by `MAX_DOWNWARD_DEPTH`). **Already used as a real, live 403 gate** in `orgChartTaskAssignmentService.ts::assignTaskToAgent()`. This is the correct precedent to extend for Checkpoint B — see `MANAGER_AUTHORIZATION_MAP.md`.
- `agentAuthorizationService.ts` (`authorizeAgentAction()`) — the real ABAC/HITL chokepoint, still shadow-mode only (never blocks), real HITL rules in `agentAutonomy.ts`. Unchanged since this session's own last edit (`bc79e008`). This remains the single authorization system per non-negotiable #2 — nothing here proposes a second one.
- `ProposedAgentAction` (`backend/src/models/ProposedAgentAction.ts:31-53`, table `proposed_agent_actions`) — the actually-live, actually-enforced approval object (`pending → approved/rejected/expired → applied`), FK'd to `ai_agents.id`, real controller (`agentGovernanceController.ts:27-53`), already used by more than one agent type. This is the strongest existing precedent for "a human needs to decide something about what an agent proposed to do" — stronger than `ApprovalRequest`, which is confirmed shadow-mode-only with nothing ever moving its `status` off `shadow_logged`.

## D. Identity bridge: `PlatformIdentity` — real, but not what it looks like at first glance

There IS a cross-cutting human-identity bridge in this repo (`docs/architecture/multi-tenancy/` — a separate, already-completed architecture effort, not re-audited in full here; only the pieces relevant to agent-manager authorization were read directly):

- `backend/src/models/PlatformIdentity.ts` — "one human, once, across the whole ecosystem," keyed on `primary_email`. Its own header comment is explicit: **"deliberately NOT wired into any existing authentication path by this project."**
- `backend/src/models/PlatformIdentityLink.ts` links `lead | enrollment | admin_user` (not `org_member`) entities to a `PlatformIdentity`.
- `backend/src/models/OrgMember.ts:25` has its own **direct** `platform_identity_id` column ("Bridge to the platform-wide human identity. Nullable during migration.") — a second, simpler hop.
- Built for a different purpose: letting a CPN/multi-tenant ecosystem partner (who may never have an `Enrollment`) exist as one identity across `organizations`. Not built with agent-manager authorization in mind, and not populated for Colaberry's own internal `org_members` roster as a guarantee.

**Verdict:** a real two-hop bridge (`AdminUser → PlatformIdentityLink → PlatformIdentity ← OrgMember.platform_identity_id`) theoretically exists, but it is unwired, not proven populated, and scoped to a different problem. Building `requireAgentManagerOrAdmin` on top of it would import a heavier, differently-purposed system for a narrower need. The lower-risk path is a direct `OrgMember.email = AuthPayload.email` lookup — same "email is the canonical join key" convention `platformIdentityService.ts` itself documents (`:9-13`) — feeding straight into the already-proven `isAgentInHumanDownstream()`. See `MANAGER_AUTHORIZATION_MAP.md`.

## E. CRITICAL FINDING — a second, deliberately-separated "AI Workforce OS" already exists at `/admin/workforce`

This was not in scope for any of the 4 dispatched research agents (none were pointed at `docs/architecture/workforce-os/` or `services/workforce/orgRegistry.ts`) and surfaced only during direct verification. It is the single most important finding of Checkpoint A and must inform every later checkpoint.

`docs/architecture/workforce-os/PHASE_5.md` (session CC-20260708-q7m3, 2026-07-09, "Status: implemented (v1, integrated end-to-end)") describes a **shipped, deployed** system: a 12-employee AI org chart (CEO → Chief of Staff → 10 Directors — "Ada Sterling," "Miles Chen," etc., `backend/src/services/workforce/orgRegistry.ts:25-62`), a daily leadership meeting, assigned tasks, per-employee memory, cross-department messages, and deterministic performance reviews, at `/admin/workforce` with its own DB tables (`workforce_tasks`, `workforce_meetings`, `workforce_memory`, `workforce_messages`) and its own API tree (`/api/admin/workforce/*`).

**On the surface this looks like it already built most of what this mission is asking for.** Direct verification shows it deliberately did not, and was engineered not to conflict:

- `orgRegistry.ts`'s 12 employees are a **static, code-defined, partly-fictional roster** — real people's names were not used; "Ada Sterling," "Miles Chen" etc. are synthetic personas, not `AiAgent` rows. Its own header comment: *"Static config — the org chart is code; state lives in the DB."*
- Only a subset (the Directors with a non-null `ops_domain`) map to anything real, and even then only to the frozen Operations-Center per-domain analysis — not to Reese, CoryBrain, or any of the 23 registered `AiAgent`s this mission is about. A separate `WORKFORCE_AGENT_NAME` map (`orgRegistry.ts:72-80`) links a handful of director slugs to real `ai_agents.agent_name` values (`WorkforceStudentSuccessDirector`, etc.) — a **different, parallel set of registered agents**, not Reese/CoryBrain/the 21 architects.
- `backend/src/services/workforce/liveAgentsService.ts:11-28` is a **second, deliberately separate** service built specifically to surface real `AiAgent` activity (Reese and the 21 Agent-Ticket-Standard architects), and its own header comment states outright: *"This file must NEVER import `orgRegistry.ts` ... the static Directors have no real ProofDesk data, so an honest empty/Reese-only result is correct, not a bug."* This separation is enforced by a real test that greps the source for the forbidden import (`__tests__/liveAgentsService.test.ts`).

**Practical consequence:** `workforce_tasks` / `workforce_memory` / `workforce_messages` / `workforce_meetings` are real, live tables — but every row is keyed on `employee_slug` values like `'ceo'`, `'chief_of_staff'`, `'student_success'` (the synthetic roster), **not on real `ai_agents.id` UUIDs**. Reusing these tables for the current mission's `AgentManagerConversation`/`ManagerDirective`/`AgentOneOnOne` concepts would silently key manager-agent conversations about Reese under a fictional-persona key space, which is exactly the kind of dishonest-by-construction result the mission's non-negotiables (#6, no fabricated Trust data; the "never fabricate historical 1:1s" stop condition) forbid. **These tables are not a reuse candidate for this mission** — new, `ai_agents.id`-keyed tables are required (see `DOMAIN_REUSE_MAP.md`, `TARGET_ARCHITECTURE.md`).

**What IS worth reusing from this system:** the `themeKit` light-default/dark-toggle design-token pattern (per-user localStorage persistence, `PHASE_5.md:25-26`), and the roster → drill-down "office" UI pattern (profile/tasks/memory/messages/review in a drawer) as UX precedent for Checkpoint B/D — rebuilt against real `ai_agents` and real `org_members`, not copied wholesale.

## F. Chat, conversation, and notification infrastructure

- `chatService.ts` + `ChatConversation`/`ChatMessage` models — Maya-specific, hard-FK'd to `visitors`. Structurally generic column shapes, but not directly reusable without a schema change (visitor-identity assumption baked in).
- Community room/DM system (`RoomMessage`/`RoomMembership`/`dmService.ts`) is keyed on `enrollment_id`. Reese participates today only via a special-cased `getReeseEnrollmentId()` hack in the room-membership code, and `assertSameCohort()` carries a narrow hardcoded Reese bypass. Real precedent that an AI agent CAN participate in this system, but only via an identity hack — not a clean generic path.
- **No generic, identity-agnostic "this needs a specific human's attention" inbox/queue exists.** Every candidate found is domain-bound: Basecamp-todo-specific, email-inbox-specific, community-member-specific, or shadow-mode-only (`ApprovalRequest`).
- **No per-user or per-manager timezone field exists anywhere.** `AdminUser.ts` and `OrgMember.ts` both confirmed to have no timezone column; every cron timezone option repo-wide is a hardcoded `'America/Chicago'` literal. Any scheduled manager-facing feature (report cadence, 1:1 reminders) needs this built.
- Maya's context-assembly pipeline (persona + page-context + memory-summary + RAG + message-replay + tool-loop) is a reusable **pattern**, not reusable code — fully Maya/admissions-hardcoded.

## G. Scheduler, reporting, and communication channels

- **No generic report-subscription model exists** (content + recipient + cadence + timezone + channel as one config object). `CronScheduleConfig` is real but strictly agent-name-keyed — no user/timezone/content/channel dimensions.
- `weeklyReportAgent.ts::runWeeklyReport()` — emails via Mandrill, never persists a report row.
- `DepartmentReport` model (`department_reports`) — a real persisted-report object, distinct from the email-only weekly report. `reportingOrchestrationService.ts` + `KPISnapshot` — a more structured, already-live periodic-metrics-persistence mechanism.
- `emailService.ts::sendRawEmail()` — the real, generic, Mandrill-backed, kill-switch-aware send primitive. This is the correct thing to call for any new manager-report feature.
- **Slack is dormant, not live.** `slackSubscriber.ts` is code-complete but never called anywhere outside its own definition — no package dependency, no env var, no registration call. Treat as "would need real wiring," never as "exists and can be flipped on."
- `communicationSafetyService.ts::evaluateSend()` cannot gate manager-report sends as-is — its `SendRequest` type requires a mandatory `leadId` and every check resolves against lead-facing tables. Internal notification paths (incident subscribers) already bypass this gate entirely — real precedent that an internal-facing send needs its own gate, not a forced fit into the lead-safety gate.

## H. Trust, observability, `ai_events`, governance docs

- `docs/ai-governance/TBI_COMPLIANCE_PROGRAM.md` **exists and is current** (350 lines, "Draft v1.0 — for Ali's review," last updated 2026-06-20) — the real governing INPACT™/GOALS™ program doc, actively cited from code (`trustInpactGoalsService.ts:1-9`, `AiAgent.ts:251-257`). Not stale, not a different file under a similar name.
- `docs/ai-governance/ai-systems-registry.csv` **exists and is read at runtime**, not just documentation — 28 real system rows, parsed by `trustInpactGoalsService.ts:61-108` to compute the live INPACT/GOALS desk-estimate shown on the Trust Command Center.
- `trustMetricsService.ts:46-47` hard-codes the production gates (`INPACT_PRODUCTION_GATE_PCT = 86`, `GOALS_PRODUCTION_GATE = 21`) as code constants, not persisted/editable rows. Per-agent `getAgentGoalsDimension[]` (`:552-600`) is **computed live on every read, never persisted** — there is no row a human edits to set a target.
- **`trust_scores` (a persisted historical trust-score table) is confirmed never built** — no model file, no migration, listed as an open gap (`docs/trust-audit/gap-analysis.md:50`, item P3-5) and explicitly future/optional in `docs/trust-audit/dashboard-design.md:108`. `KPISnapshot` (already real, already used elsewhere) is the closest existing mechanism that could carry Trust-score history, but is not currently wired to INPACT/GOALS specifically.
- `ai_events` / `aiEventService.ts` — the real event/cost backbone, unchanged since this session's own last edit. Real event types exist that could ground a future "Ask Agent About This" explainability action without exposing chain-of-thought — cataloguing the exact set is `TBI_DATA_MAP.md`'s job.

## I. Goals, memory, and approval-object precedent

Full detail in `MEMORY_MAP.md` and `DOMAIN_REUSE_MAP.md`; headline findings:

- **No goal/OKR/KPI model scoped to an individual AI agent's own performance target exists.** `CompanyGoal`/`DepartmentKpi` are company/department-scoped (an agent *reads* them, doesn't own one). `KPISnapshot` and `AgentPerformanceMetric`/`AgentPerformanceSnapshot` are observed-metric tables with no target/threshold column.
- **No memory model meets the bar of "agent learned X → evidence → human-approval flag → used at runtime."** Nine memory-shaped models exist (`WorkforceMemory`, `IntelligenceMemory`, `LearnerMemory`, `AdmissionsMemory`, `OpenclawLearning`, `InboxLearningEvent`, `LearningPolicySnapshot`, `ReportingInsight`, `ICPInsight`) — none combine evidence + a real, enforced human-approval gate + runtime feedback. `OpenclawLearning.applied` is a dead, ungated column (grepped every call site; nothing ever sets or reads it for gating).
- At least 11 real approval-shaped objects exist beyond the 5 already known (`ApprovalRequest`, `OpsApprovalQueueItem`, `DecisionRecord`, `InboxReplyDraft`, `OpenclawResponse`) — full inventory in `MEMORY_MAP.md`. `ProposedAgentAction` is the best-fit precedent (see section C).

## J. `build-platform-agent` skill

`.claude/skills/build-platform-agent/SKILL.md` (272 lines) — PREVIEW-mode-default, 4-real-row identity model (AdminUser/Enrollment/CommunityMember/AiAgent), `AGENT_REGISTRY` seeding, reactive-vs-proactive safety-rail split (4 categories for proactive: cadence cap, daily send cap, fail-closed eligible-population gate, escalation cap), Governance checklist (comms capability needs Ali's sign-off before `enabled=true` in production; ticket-creating agents must satisfy `directives/register-ticket-creating-agent.md`). This is the skill Checkpoint G extends — no changes made to it in Checkpoint A.
