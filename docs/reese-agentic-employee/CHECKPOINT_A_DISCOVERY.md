# Reese Agentic AI Employee — Checkpoint A Discovery Report

**Mission source:** `REESE-AGENTIC-AI-EMPLOYEE-BUILD-PROMPT.md` (provided by Ali, 2026-09-04)
**Session:** CC-20260818-x4nk
**Date:** 2026-09-04
**Status:** Discovery only. No product code in this checkpoint, per the mission's own required method.

---

## 0. Git state (per the mission's required working method, steps 1-4)

**Primary working directory** (`.../Colaberry Enterprise AI Leadership Accelerator`, no `-wt` suffix):
```
branch: workstream/chapter-quality-and-worker
```
This branch is **significantly behind `origin/main`** and carries a large set of pre-existing, unrelated local modifications (enrollment controllers, launch-task scripts, commission pipeline — none of it this mission's concern, none of it touched). Its `git log -10` shows a completely different, older commit history with no AI Workforce Management or Reese work on it at all. **This branch was not used for this discovery** and should not be used for this mission's implementation either — it is not this mission's starting point.

**Worktree used for this discovery** (`C:\Users\ali_m\agent-dashboard-redesign-wt`):
```
branch: docs/session-log-skill-hardening (tracks origin/main)
HEAD: be7c8f91 (clean working tree)
remote: origin -> https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator.git
```
`git log -10`:
```
be7c8f91 Session log: Reese agent-family review, heartbeat fix, skill hardening
46f310dd Merge pull request #2101 from ColaberryIntern/skill/harden-build-platform-agent
35863f17 Harden build-platform-agent: trust/hierarchy layer + close the tool chest gap
d584915b Merge pull request #2098 from ColaberryIntern/fix/reese-presence-heartbeat-registry
fa1750a1 Merge pull request #2097 from ColaberryIntern/feat/projects-drill-into-their-write-up
b830d6b1 Merge remote-tracking branch 'origin/main' into feat/projects-drill-into-their-write-up
43fff81b Register ReesePresenceHeartbeat — closes a real ungoverned-cron gap
1745b8e5 PROGRESS.md: rebase this session's entry onto main's tip
8a224abf Merge pull request #2096 from ColaberryIntern/fix/quotes-must-be-real
fe2be0aa Quotes must be real, and must be the customer's
```

**Required method step 4 answered:** Yes — every existing AI Workforce Management checkpoint (identity, manager conversation, directives, inbox, goals, 1:1s, report subscriptions, memory proposals, chain of command, authorization, GOALS™) and every Reese change made earlier this session (recent-activity grounding, the ReesePresenceHeartbeat fix, the `build-platform-agent` skill hardening) are already on `origin/main`, confirmed via this worktree's own log and direct file reads. This mission's implementation branch should fork from `origin/main`, matching this session's established discipline throughout — never from the stale primary-directory branch.

This report itself makes zero product-code changes. A new branch (`docs/reese-checkpoint-a-discovery` or similar) will carry only this markdown file.

---

## 1. Domain reuse map

Classification per mission capability — what to REUSE, EXTEND, BUILD NEW, or LEAVE ALONE, and why.

| Capability | Verdict | Real basis |
|---|---|---|
| 1. Versioned role charter | **BUILD NEW** | No charter model exists. `AiAgent.system_prompt` is unversioned prose; `persona_version` is a bare string, not a structured contract (mission/responsibilities/inputs/outputs/forbidden actions/escalation). |
| 2. Student Success 360 evidence service | **BUILD NEW, pattern-EXTEND `learnerContextService.ts`** | The real pattern to copy (`Promise.allSettled` resilience, read-only/no-side-effect discipline) already exists and already works for 6 sources. The typed `value/status/sourceSystem/observedAt/freshnessPolicy/reliabilityState` envelope and the other ~5 real sources it doesn't yet read are new. |
| 3. Evidence Reliability & Metric Quarantine | **BUILD NEW, entirely** | Confirmed via dedicated search: no data-source reliability registry, no quarantine gate, nothing that removes a metric from a decision path anywhere in this codebase. This is the mission's own declared "blocking safety requirement" and has zero prior art to reuse beyond a structurally-similar-but-unrelated marketing-copy quarantine pattern (`CaseStudyAiDraft`). |
| 4. Evidence-grounded assessment engine | **BUILD NEW** | No health/root-cause/momentum classifier exists for Reese or any student-success agent. `architectEvaluationAgent.ts`'s null-degradation blend pattern (`blendOverallScore()`) is a real, reusable *pattern*, not a reusable *service*. |
| 5. Intervention planner + tool execution + pre-action authorization | **EXTEND the tool-chest infra (just hardened this session) + BUILD NEW the tools + WIRE (not rebuild) `agentAuthorizationService.ts`** | `tools_granted`/`TOOL_CAPABILITIES` (`agentToolCapabilities.ts`) is real and just hardened. `agentAuthorizationService.ts`'s ABAC ladder is real and functional — Reese's action paths simply never call it. The gap is a missing call site, not a missing engine. |
| 6. Stateful work plans & mandatory checklists | **BUILD NEW** | No persistent checklist-instance model found anywhere. |
| 7. Work ledger & commitments | **EXTEND `Ticket`/`TicketActivity`/`OutcomeMeasurement`** | Directly matches the mission's own instruction: "Use ProofDesk and existing agent activity/event infrastructure... do not create an unrelated task universe." The real gap is `Ticket.outcome_status` being a dead, never-written column, and no due-date/commitment-tracking concept on top of the existing model. |
| 8. Human-quality conversation & manager intent | **EXTEND `agentManagerConversationPrompt.ts`'s layering + BUILD NEW the intent classifier/confirmation-card flow** | The manager-conversation path already layers directives → approved memory → recent activity, a partial match to the mission's 10-layer context order. Typed intent classification (ASK/INSTRUCT/CORRECT/etc.) and durable-state confirmation cards don't exist. |
| 9. Decision-ready reporting | **EXTEND `AgentReportSubscription`/`AgentReportRun`** | Already real, already produces an immutable `content_snapshot` per send, already ticks on a real cron with idempotency enforced at the DB level. Closer to the mission's ask than any other capability — needs new report *sections* (exception report, quarantine disclosure), not a new execution mechanism. |
| 10. Governed learning | **EXTEND `AgentMemoryProposal`** | Already real, already proven (by test) that only `status='approved'` rows are injected at runtime. Needs one new rule: quarantined evidence can't support a proposal, and existing approved memory whose evidence gets quarantined later must be flagged. |
| Identity / registry / permission tiers / reports-to / GOALS™ | **LEAVE ALONE** | Real, solid, independently verified and hardened earlier this session (`build-platform-agent` skill, PR #2101). No changes needed for this mission's own scope. |

---

## 2. Reese runtime inventory (mandatory discovery list, items answered)

- **Identity**: `AiAgent` row (`agent_name='Reese'`), linked `AdminUser`(`agent_id`)/`Enrollment`/`CommunityMember`, seeded via `agentBlueprint/agentIdentitySeed.ts`'s `seedAgentIdentity()`, wrapped by `reese/reeseIdentitySeed.ts`. Confirmed unchanged.
- **System-prompt assembly** — two separate real paths, not one:
  - Manager-conversation (`agentBlueprint/agentManagerConversationPrompt.ts`): reads `AiAgent.system_prompt` directly, layers `ManagerDirective` → approved `AgentMemoryProposal` → real recent activity (`agentRecentActivitySummary.ts`).
  - Student-facing (`agentBlueprint/agentSystemPrompt.ts` via `reese/reeseSystemPrompt.ts`'s `REESE_PERSONA_BLOCK`): does NOT read the DB column — `personaBlock` is a plain argument. Injects `ManagerDirective`/`AgentMemoryProposal` too when `agentId` is passed.
- **Learner-context assembly** (`learnerContextService.ts`): real, `Promise.allSettled` over 6 sources — `Enrollment`+`Cohort`, `UserCurriculumProfile`, `getSkillGenome()`, `getProjectByEnrollment()` (cached readiness only, deliberately no live recompute — no side effects on a mentor turn), last-200 `AssessmentAttempt` rollup, `LearnerMemory`. Fails safe (`''` on error, never throws). Notably narrower than a "Student Success 360" would need — no ticket history, no attendance, no engagement/activity signal, no cohort-relative standing.
- **Reactive DM handling** (`reese/reeseReplyService.ts`): triggered from `dmService.ts`'s `sendDmMessage()`. Real loop guard (never reply to self) and scope guard (must have active `RoomMembership`), both structural, not policy-driven. Uses `getInstrumentedOpenAI()` (`openaiInstrumented.ts`), `workflow_id: 'reese'`, real `agent_id` tagging. **Calls no authorization function anywhere in the path** — confirmed by full read of both the service and its calling site.
- **Autonomous outreach & follow-up**: `reeseAutonomousOutreachService.ts` (cron `0 15 * * *`) — signal-driven (`reeseSignalService.ts`, reads real `TimelineCardProgress`), eligibility-gated (`reeseEligibilityService.ts`, fails closed on ambiguity), cadence/daily-cap enforced. `reeseOutreachFollowUpService.ts` (cron `0 16 * * *`) shares constants with the sweep, closes/escalates within a 3-attempt cap. Both real, both live (`enabled: true`).
- **Eligibility and cohort gates**: `reeseEligibilityService.isEligibleForAutonomousOutreach()` — checks `Enrollment.cohort_id` against an admin-configured pilot-cohort allowlist.
- **Signal evaluation**: `reeseSignalService.evaluateInactivitySignal()` reads `TimelineCardProgress` directly. Its own header comment documents a deliberate decision NOT to reuse two pre-existing agents (`studentSuccessAgent.ts`, `studentBehaviorIntelligenceAgent.ts`) because those read `Enrollment.updated_at`/`Enrollment.progress` — **fields that do not exist on the model** (`Enrollment` has `timestamps:false`, no `progress` column). Independently confirmed: those two other agents' checks silently never fire in production — a real, live example of exactly the fabricated-signal risk this mission exists to prevent.
- **ProofDesk ticket linkage**: `reese/reeseTicketLinkService.ts` → `agentBlueprint/agentTicketLinkService.ts`'s `ensureAgentTicketForRoom()`/`logAgentExchangeActivity()`. Ticket keyed on `entity_type: 'community_room'`, `entity_id: <room.id>` — the only real per-student join path into `Ticket` (there is no direct student FK on `Ticket` at all).
- **Scheduler registration** (`schedulerService.ts`): `ReeseAutonomousOutreachSweep` (`0 15 * * *`), `ReeseOutreachFollowUps` (`0 16 * * *`), `ReeseStudentSupportSupersessionResolver` (`0 17 * * *`, **`enabled: false`** — held pending a reviewed historical bulk-clear), `ReesePresenceHeartbeat` (`*/1 * * * *`, now registered and confirmed ticking live as of this session's earlier fix, PR #2098), `AgentReportSubscriptionDispatch` (`*/15 * * * *`, shared across all agents including Reese's own report subscriptions).
- **Cost/event instrumentation**: two real, separate wrapper mechanisms exist — `llmCallWrapper.ts` (`callLLMWithAudit`, scoped to the lesson-content-generation pipeline, not used by Reese) and `openaiInstrumented.ts` (`getInstrumentedOpenAI`, used by BOTH Reese's reply path and outreach path). Every real LLM call logs to `AiEvent` (`ai_events`): `event_type`, `outcome`, `trace_id`, `workflow_id`, `agent_id`, `model`, token counts, `cost_usd`, `duration_ms`. Cron-level run success/failure (not per-LLM-call) logs separately to `AiAgentActivityLog` (`ai_agent_activity_logs`) via `instrumentCronJob()` — Reese's reactive reply path, not being cron-triggered, never writes to this second table.
- **`tools_granted` and the tool capability dictionary**: `TOOL_CAPABILITIES` in `reese/agentToolCapabilities.ts` — Reese's own 2 documented tools are `respond_to_dm`, `read_learner_context`. **A real drift found**: `reeseReplyService.ts` also gates attachment-reading behind `agentHasTool('reese', 'read_attachments')` — a third real capability, checked in code, but not represented in `TOOL_CAPABILITIES` or (unverified without a DB read) necessarily in the live `tools_granted` array either. This is exactly the kind of "declared vs. real" drift the mission's Capability 5 asks to reconcile.

---

## 3. AI Workforce Management inventory (mandatory discovery list, items answered)

- **Agent Detail / Command Center UI**: confirmed current — 7 tabs (At a Glance, Command Center, Work & Decisions, Talk, Reports, Performance, Trust & Control), `frontend/src/pages/admin/AgentDetailPage.tsx:92-100`. Default-rendered tab on mount is still `glance`, a deliberate, logged choice to avoid breaking an existing large smoke-test suite.
- **Manager-agent conversation**: real, `agentManagerConversationService.ts` → `agentManagerConversationPrompt.ts`, live-verified this session via a real production message exchange.
- **Manager directives**: `ManagerDirective` model, `managerDirectiveService.ts`, append-only/versioned (never edited, only superseded), restrict-only by construction.
- **Manager inbox**: **correction to an earlier assumption** — there is no `ManagerInboxItem` Sequelize model. The real backing model is the pre-existing `ProposedAgentAction`; `managerInboxService.ts` is a genuinely new per-agent *view* over it, a deliberate reuse decision documented in its own header. `ManagerInboxItem`/`ManagerInboxItemView` exist only as TypeScript interface names, never as a persisted model.
- **Agent goals**: `AgentGoal` model — `metric_key` (`monthly_cost_usd`|`open_ticket_count`, closed set), `comparison`, `target_value`, manager-authored post-creation.
- **1:1 meetings**: `AgentOneOnOne` model — `agenda`/`outcome_notes`/`status`/`held_at`, manager-authored post-creation.
- **Report subscriptions and report runs**: **real, and this DOES actually execute** — a genuine correction to treat as good news for Capability 9. `AgentReportSubscription` ticks every 15 minutes (`schedulerService.ts:1725`, `AgentReportSubscriptionDispatch`), checks each subscriber's own local delivery hour, computes an idempotency `period_key` (DB-unique-constrained on `(subscription_id, period_key)` so a duplicate tick is caught, never double-sent), renders content from `agentDetailService.getAgentDetail()` (the same numbers the Agent Detail page shows), sends via real email, and persists an immutable `content_snapshot` on a dedicated `AgentReportRun` row (`delivery_status: sent|failed`, `error_message` on failure). A real "Reports" tab history view exists on top of this.
- **Approved memory and memory proposals**: `AgentMemoryProposal` — `status: pending|approved|rejected`, only `approved` rows injected into either prompt path, proven by existing tests.
- **Chain of command**: `reports_to_type`/`reports_to_id` on `AiAgent`, resolved via `ticketCreatorReportsToResolver.ts`'s `resolveReportsToHuman()`/`resolveReportsToChainWithTrail()`, `MAX_CHAIN_DEPTH=5` cycle guard, fails closed (returns `null`) on an unresolved or cyclic chain — silently, not loudly. `enforceReportsToGate()` rejects a ticket-creating agent's own tickets if its chain doesn't resolve.
- **Authorization and proposed actions**: `agentAuthorizationService.ts`'s `authorizeAgentAction()` — the real ABAC chokepoint, gated by the `abac_enforcement` setting (`off|shadow|enforce`, default `shadow`, fails open). **Confirmed: never actually flipped to `enforce` anywhere outside one unit test** — every prose reference to enforcement describes it as a future step, and a dedicated pre-flip review script (`scripts/auditAbacShadowDenyRate.ts`) exists specifically because the flip hasn't happened. `agentAutonomy.ts`'s 4-rung ladder (`observe/suggest/act_audited/communicate`) maps 1:1 from `agentPermissionService.ts`'s 4 permission tiers; `AiAgent.autonomy_level` only takes effect once `reactivateAgent()` stamps `autonomy_level_set_at` — otherwise silently derived from the tier.
- **INPACT/GOALS and Trust Contract calculations**: **correction to an earlier assumption** — a real, non-trivial INPACT™ computation library exists (`backend/src/modules/delivery/inpact.ts`, 290 lines, tested), but it belongs to a completely separate "DeliveryAgentDefinition" production-readiness gate for a story/delivery-governance pipeline — it has no code path connecting it to `AiAgent`/Reese. On every Reese/GOALS-facing surface (`AgentTrustControlTab.tsx`, `AgentOverviewTab.tsx`), INPACT™ remains footnote/citation text only, never a computed score. GOALS™ itself (`agentGoalsDimensionsService.ts`) is real: `governance`(5)/`lexicon`(4) are hardcoded constants (only their evidence text varies with real config), `observability`/`availability`/`solid` are genuinely computed from the last 20 `AiAgentActivityLog` rows.
- **Agent event/activity logs**: three real, distinct tables — `AiEvent` (`ai_events`, per-LLM-call/per-authorization-check/per-tool-call), `AiAgentActivityLog` (`ai_agent_activity_logs`, per-cron-run success/failure, also what GOALS™'s live dimensions read), `AiSystemEvent` (`ai_system_events`, a simpler campaign/system-event log, not used by Reese).

---

## 4. Student intelligence source catalog

Every category the mission asked for, with canonical source, meaning, freshness, known failure modes, current Reese usage, and decision-vs-context classification.

| Source | Canonical model/service | Meaning | Freshness | Known failure mode | Reese reads today? | Usage class elsewhere |
|---|---|---|---|---|---|---|
| Enrollment & cohort | `Enrollment.cohort_id` | Which curriculum/cohort a student is placed in | Real-time on write; no cohort-history table | Nullable FK — silent empty joins for guest/Explorer accounts | **Yes** (Reese's own outreach eligibility gate) | Decision-making |
| Attendance | `AttendanceRecord` via `liveSessionAttendanceService.ts` | Did the student join a scheduled live session, on time | Real-time join + 5-min cron finalize | Only the portal "Join" button is captured — a raw Meet-link join is invisible | **No** | Decision-making (promotion gate, 40% of `readiness_score`, 2+ absence alerts) |
| Presence (not attendance — explicitly documented as a separate, non-decision proxy) | `CommunityMember.last_active_at` | Is a browser tab open right now | Real-time, 90s/10min windows | Explicitly documented in-code as "a UX flourish, not an attendance record" | Yes, but only for agents' own online/away/offline badge, never a student's | Context-only |
| Timeline / classroom progress | `TimelineCardProgress` + `timelineGatingService.ts` | Real completion state per learning card, with fail-open gating | Real-time, synchronous on user action | Gating evaluation errors fail OPEN (student proceeds) and are invisible downstream | **Yes — Reese's primary live signal** | Decision-making (XP, promotion, Reese's outreach trigger) |
| Assessments/attempts | `AssessmentAttempt` | Graded quiz/evaluation attempts, per-competency breakdown | Real-time | Model comment says 75% pass threshold; the enforced runtime constant is actually 70% — comment and code disagree | No | Decision-making (gates Evaluation cards) |
| Rubric evaluation | `InterviewRubric` + `ArchitectEvaluation` | Weekly mock-interview score, deterministic keyword-match, blended 70/30 with lesson completion | **Weekly batch** (Sat 6AM UTC) | Documented historical bug: scored against calendar ISO week instead of cohort-relative week (BC #10088637794) | No | Decision-making (weekly narrative eval) |
| Reflections | `ReflectionEntry` | Self-rated readiness + direction, explicitly "not graded" per its own source comment | Real-time | None found | No | Context-only, by design |
| Competency (legacy) | `StudentCompetency`/`BuilderLevel` via `competencyEngine.ts` | Recomputed (not incremented) confidence per domain from validated `EvidenceRecord` | Real-time, on card completion | None found | No | Decision-making (Builder-Level promotion gate) |
| Competency (CAPE, newer, parallel system) | `StudentArchitectureSkill` | 10-axis skill cache; explicitly documented as NOT feeding `EvidenceRecord`/`StudentCompetency` in this phase | Recompute-on-evidence (cache) | `placement_score` is `0` for anyone with no resume upload — explicitly must never be derived from evidence, per its own comment | No | Context-only today (deliberately unwired from promotion) |
| Certification readiness | `CertReadinessSnapshot` via `certReadinessService.ts` | Colaberry's own readiness estimate — 80/20 knowledge/evidence blend, minimum 20-item sample before any score is shown at all | Real-time snapshot on practice-exam completion (append-only history) | `weights_available:false` is a first-class state meaning "coverage estimate, not exam-weighted" — must be captioned honestly | No | Decision-making, explicitly scoped as an estimate |
| Projects / repo / milestones | `Project`, `GitHubConnection`, `StudentTask` | Build stage, cached readiness %, repo connection, per-story verification | Cached (Project); webhook+on-demand (GitHubConnection); write-once verified fields (StudentTask) | GitHub collaborator invitations can sit unaccepted or expire silently — 2 real, named production incidents cited in-code | Only indirectly, as prose via `learnerContextService.ts` | Context-only for Reese; decision-grade elsewhere (career/portfolio surfaces) |
| Community activity | `CommunityPost`/`CommunityComment`/`CommunityEvent`/`CommunityPointsEvent` | Social engagement — posts, events, gamification | Real-time | None found | **No — zero usage, not even as context** | Not used by Reese at all |
| ProofDesk tickets / interventions | `Ticket` (via `entity_type='community_room'`) + `OutcomeMeasurement` | Support history and a narrow 7-day recurrence-check outcome proxy | Real-time (tickets); 7-day-delayed check (outcome) | `Ticket.outcome_status` column exists but is **never written anywhere** — a dead column | Writes only; **never reads prior history before replying** | Ops/reporting visibility only |
| Instructor feedback | `MentorReviewItem` via `mentorFeedbackService.ts` | AI-drafted, confidence-gated rubric feedback on `AssignmentSubmission`, human-reviewed when low-confidence | Synchronous on submission | Silent gap on LLM failure — no feedback row created, no alert | **No** | Decision-making for that specific feedback item (student-facing) |

**Headline finding**: every category above has a real, actively-written, documented source. **Reese reads only 2 of 13** (cohort, timeline progress) — everything else (attendance, assessments, rubric evals, competencies, cert readiness, projects/repo, community engagement, ticket/intervention history, instructor feedback) is real and in several cases already decision-grade elsewhere on the platform, yet entirely invisible to Reese today. Building the Student Success 360 service is materially about connecting Reese to data that already exists and is already trustworthy — not inventing new instrumentation.

---

## 5. Required discovery questions — answered with evidence

**1. Which Reese capabilities execute today, and which are only described in `tools_granted` or UI text?**
Real, executing: `respond_to_dm` (reactive reply, `reeseReplyService.ts`), `read_learner_context` (`learnerContextService.ts`, folded into the prompt). A third real, executing capability — attachment reading, gated by `agentHasTool('reese', 'read_attachments')` — is **not** represented in `TOOL_CAPABILITIES` and may not be in the live `tools_granted` array either (unverified without a DB read; flagged as a concrete Checkpoint B/E task). Four cron-driven behaviors execute for real but aren't modeled as "tools" at all: the autonomous outreach sweep, the follow-up closer, the (currently disabled) supersession resolver, and the presence heartbeat. Nothing in `tools_granted` is purely decorative — everything declared does something real — but the declaration undercounts real behavior.

**2. Does every real Reese action have an `AiAgent.id`, event, authorization verdict, ticket/work item, evidence, and outcome?**
No. Reactive reply: has `agent_id`, has an `AiEvent`, has a ticket — has **no authorization verdict at all** (not even shadow-logged) and no structured outcome (`Ticket.outcome_status` is dead; `OutcomeMeasurement`'s narrow recurrence check is ticket-level, not reply-level). Autonomous outreach: has all of the above except a real *pre-action* authorization verdict — its verdict is shadow-logged, but only after the send has already happened.

**3. Which communications are authorized before execution, and which are merely evaluated after sending?**
**Neither Reese communication path is authorized before execution today.** Reactive DM reply: no authorization call anywhere in the path — confirmed via a full read of both `reeseReplyService.ts` and its calling site. Autonomous outreach send: `initiateDm()` runs first; `authorizeTicketDispatch()`→`authorizeAgentAction()` runs after, explicitly documented in-code as advisory-only and incapable of blocking even in `enforce` mode for this call site. This is the mission's core Capability 5 gap, precisely located.

**4. Which student metrics are sufficiently trustworthy to influence a decision today?**
Real and decision-grade *elsewhere on the platform*: `Enrollment.cohort_id`, `TimelineCardProgress`, `AttendanceRecord`, `AssessmentAttempt`, `StudentCompetency`/`BuilderLevel`, `CertReadinessSnapshot` (explicitly scoped as an estimate). Reese currently uses 2 of these 6.

**5. Can a manager mark a data source unreliable? Can Reese detect reliability problems? Does either path actually remove the metric from prompt/context assembly?**
No to all three. Confirmed via a dedicated, broad search (`quarantine`/`reliability`/`degraded`/`unreliable`/`data_quality`/`source_status`) — every real hit is either infra-health monitoring, ops alerting, or an unrelated marketing-copy approval workflow. Nothing gates what data reaches a decision based on a reliability judgment. This capability must be built from zero.

**6. Where is durable approved memory injected into Reese's runtime?**
Both prompt paths — `agentManagerConversationPrompt.ts` (manager conversation) and `agentSystemPrompt.ts` (student-facing, when `agentId` is supplied) — inject only `status='approved'` `AgentMemoryProposal` rows, proven by existing tests that a stored-but-unread approval flag is exactly the failure mode being guarded against.

**7. Which report numbers link back to their evidence?**
`AgentReportRun.content_snapshot` — a real, immutable, DB-persisted record of exactly what was sent, generated from `agentDetailService.getAgentDetail()`, the same source the live Agent Detail page reads. `CertReadinessSnapshot` similarly persists its component breakdown (`knowledge_scaled`/`evidence_coverage_pct`/`sample_confidence`) separately from the headline number, by explicit design ("an unexplainable score is not a credential anyone should trust"). `OutcomeMeasurement` is real but narrow (7-day ticket recurrence only).

**8. Which current services can be reused without creating a second agent platform or a synthetic employee identity?**
Nearly everything real-and-solid this session has already touched: the `AiAgent` registry, the `AdminUser`/`Enrollment`/`CommunityMember` identity triple and `agentIdentitySeed.ts`, `ManagerDirective`/`AgentMemoryProposal`/`AgentGoal`/`AgentOneOnOne`/`AgentReportSubscription`+`AgentReportRun`, `agentAuthorizationService.ts` (needs a call site added at Reese's own action points, not a rebuild), `agentPermissionService.ts`'s tiers, `agentToolCapabilities.ts` (the tool chest, just hardened), `ticketCreatorReportsToResolver.ts`, `Ticket`/`TicketActivity`/`OutcomeMeasurement`, `learnerContextService.ts` (the pattern to extend into Student Success 360), `openaiInstrumented.ts`, `aiEventService.ts`. No part of this mission requires a parallel dashboard, ticket system, memory store, or approval engine — confirmed against the mission's own explicit non-goal.

---

## 6. Reliability policy & threat model (draft — Capability 3 scoping)

Since no reliability mechanism exists today, this is a first draft, not a description of something real.

**Threat model** (what this must defend against, grounded in real, cited platform behavior):
- A silently-broken data pipeline continuing to feed decisions with no signal anything is wrong (the exact `studentSuccessAgent.ts`/`Enrollment.progress` non-existent-field bug found in §2 is a live example of this happening today, just not yet acted on by any agent).
- A manager's casual conversational statement ("attendance is broken") silently mutating durable governance state without confirmation — the mission explicitly requires a confirmation-card step before any write.
- A metric returning to "trusted" status merely because new records started arriving again, without genuine recovery validation (the mission explicitly bans this).
- Historical reports being silently rewritten once a metric they used is later quarantined (the mission explicitly requires immutability of past report state — and `AgentReportRun.content_snapshot`'s existing immutability is directly reusable here).

**Draft registry shape** (mapped onto real existing conventions — no DB FK enforcement on actor-ref columns, matching this repo's established convention; a real `ensure*Schema.ts` additive script, matching how every other `AiAgent` column has landed):
`source_system`, `metric_key_or_scope` (supports a wildcard like `attendance.*`), `affected_scope` (tenant/cohort/student/time-range, nullable = global), `status` (`healthy|degraded|quarantined|recovering`), `severity`, `reason`, `evidence/incident/ticket links` (reuse `Ticket.entity_type`/`entity_id`, the same polymorphic pattern every other subsystem already uses), `declared_by_source` (`manager_report|agent_detection|automated_monitor`), `declared_by`/`declared_at`, `review_owner`/`next_review_time`, `recovery_criteria`, `restored_by`/`restored_at`, and an append-only audit-event trail (mirroring `ManagerDirective`'s revoke-not-edit pattern).

**Draft policy gate**: one reusable function, called from Student Success 360 assembly, message-context construction, intervention recommendation, report generation, goal calculation, and memory-proposal validation — mirroring exactly how `learnerContextService.ts`'s `Promise.allSettled` pattern already isolates one failing source from breaking the rest, extended to also strip/mark anything currently quarantined before it reaches reasoning.

---

## 7. Role charter contract (draft — Capability 1 scoping)

Proposed shape, versioned and tied to Reese's real `AiAgent.id`, reusing the existing `persona_version` string field's *position* in the schema but replacing its content with a structured object:

```
mission: <the mission's own default mission text — reused verbatim, not reworded>
responsibilities: [...]
assigned_population: <the real pilot-cohort allowlist reeseEligibilityService.ts already reads>
inputs_may_read: [<the real 13-source catalog above, marked which Reese may use>]
outputs_may_create: [respond_to_dm, initiate_student_check_in, create_student_support_ticket, propose_memory, propose_metric_quarantine, ...]
autonomous_actions: [<derived from the real permission-tier + autonomy-ladder mapping already in agentPermissionService.ts/agentAutonomy.ts>]
requires_approval: [<per the mission's own Human-approval-required list>]
forbidden: [<per the mission's own Forbidden list, plus this repo's own existing self-approval/self-permission-expansion bans already enforced by agentAuthorizationService.ts's design>]
escalation_triggers: [...]
required_checklists: [<Capability 6, once built>]
success_metrics: [...]
manager_and_chain_of_command: <resolved live via resolveReportsToHuman(), not hardcoded>
version / effective_date / author / change_history: [...]
```

Enforcement point: the same authorization call site this mission needs added to `reeseReplyService.ts` and `reeseAutonomousOutreachService.ts` (Capability 5) is the natural place to also check the charter's `autonomous_actions`/`requires_approval`/`forbidden` lists — one gate, not two.

---

## 8. API/event schema sketch

- **Student Success 360**: `getStudentSuccessSnapshot(enrollmentId, asOf?)` — typed return, one field per source in §4's catalog, each wrapped in the mission's required `{value, status, sourceSystem, sourceRecordIds, observedAt, freshnessPolicy, reliabilityState, reliabilityReason?}` envelope. Missing data returns `status: 'unknown'`, never a fabricated zero — matching `StudentArchitectureSkill.placement_score`'s existing explicit anti-fabrication precedent.
- **Reliability events**: new `event_type` values on the existing `AiEvent`/`ai_events` table (`metric.quarantined`, `metric.restored`, `metric.evaluation_excluded`) — reuses the existing event pipeline rather than inventing a parallel one.
- **Tool contracts**: every new tool in `TOOL_CAPABILITIES` gets the mission's required shape (typed inputs/outputs, risk tier, required authority, cadence limits, checklist prerequisite, idempotency behavior, event/cost logging, evidence requirements, failure behavior, dry-run support) — extending the existing `ToolCapability` interface in `agentToolCapabilities.ts`, not replacing it.
- **Work ledger**: extend `Ticket`/`TicketActivity` with the mission's required exposed fields (evidence/reliability state at open time, assessment/confidence, decision/reason codes, plan/checklist reference, authorization verdict) — likely via `TicketActivity`'s existing free-text `comment` becoming structured JSON for agent-created activity rows specifically, or a new narrow join table if that proves too lossy (a real Checkpoint A→B design decision to make explicitly, not implicitly).

---

## 9. Migration & feature-flag plan (draft)

- Every new column follows this repo's own established convention: an additive, individually-try-cached `ensure*Schema.ts` script called from `server.ts`, never a formal migration file (there is no migrations folder in this repo).
- Blocking authorization for Reese's own action paths ships behind an explicit new setting (e.g. `reese_action_authorization_mode: shadow|enforce`), independent of the global `abac_enforcement` flag — so flipping it doesn't also flip every other shadow-mode agent in the fleet. Rollout: shadow first (prove zero unexpected denials against real traffic, mirroring the existing `auditAbacShadowDenyRate.ts` pre-flip review pattern), then enforce.
- Metric quarantine ships as a genuinely new, additive registry — cannot regress anything, since nothing reads a quarantine state today.
- Reese's own reactive-reply and outreach-send call sites get the new authorization call added behind the same flag, so both paths flip together, not independently (avoiding the mission's own warned-against "reactive still open while proactive is gated" inconsistency).

---

## 10. Explicitly deferred from this checkpoint

Per the mission's own "no product code in Checkpoint A" instruction, none of the following were built, only scoped above: the reliability registry, the evidence service, the assessment engine, new tools, the checklist model, intent classification, report-section additions, or any schema change. All of it is Checkpoint B onward, pending Ali's review of this report.

One narrow, already-real fix surfaced by this discovery that is NOT part of this mission's own scope but is worth flagging separately (per CLAUDE.md's scope-lock rule — log and continue, don't silently fold in): `Ticket.outcome_status` is a live, real DB column that is never written by any code path. Whether to wire it up now or treat it as subsumed by this mission's own Capability 7 work is Ali's call, not assumed here.
