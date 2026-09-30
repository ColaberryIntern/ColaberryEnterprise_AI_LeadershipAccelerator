# Workforce Platform State — what is REAL on main (14dc8266, 2026-09-15)

Produced by a read-only discovery agent; persisted verbatim by the orchestrator (session CC-20260915-a1x7), HTML entities restored.

Baseline: worktree HEAD = `14dc8266` (merge of PR #2540). `docs/architecture/ai-workforce-management/IMPLEMENTATION_STATUS.md` lines 6-11 still say Checkpoints B-G are NOT STARTED; that doc is stale. Everything below is from code on main.

## 1. AgentRoleCharter

| Field | Finding |
|---|---|
| Exists | **Yes** |
| Model / table | `backend/src/models/AgentRoleCharter.ts` -> `agent_role_charters`; `agent_id` UUID **unique** FK `ai_agents.id` (lines 64-69); fields role_title, mission, responsibilities[], kpis[], updated_by_email |
| Service | `backend/src/services/agentRoleCharterService.ts` (`getRoleCharter`, upsert) |
| Routes + guard | `GET/PUT /api/admin/agents/:id/charter` — `requireAgentManagerOrAdmin()` (`backend/src/routes/admin/agentRoleCharterRoutes.ts:13-14`) |
| Runtime injection | `agentContextLayers.ts:18-29` `buildRoleCharterBlock` -> "ROLE CHARTER: You are the {roleTitle}..." — used by BOTH prompt paths (`agentSystemPrompt.ts:107-110`, `agentManagerConversationPrompt.ts:61-62`) |
| Frontend | Agent Detail -> Overview (AgentOverviewV2, charter in Identity per `AgentDetailPage.tsx:104-127`); editing in Trust & Control (`AgentTrustControlTab.tsx`) |
| Schema boot | `server.ts:~2799` `ensureAgentRoleCharterSchema()` |
| Tests | `services/__tests__/agentRoleCharterService.test.ts`, `__tests__/controllers/agentRoleCharterController.test.ts` |
| Keyed on | `ai_agents.id` (generic). Model header lines 9-13 explicitly refuses to reuse synthetic `orgRegistry.ts` |

## 2. ManagerDirective + runtime context assembler

| Field | Finding |
|---|---|
| Exists | **Yes** |
| Model / table | `backend/src/models/ManagerDirective.ts` -> `manager_directives`; `agent_id` FK `ai_agents.id` (line 64); append-only, `status` active/revoked, `revoked_at/revoked_by_email`; index (agent_id,status,created_at) |
| Service | `backend/src/services/managerDirectiveService.ts` (`getActiveDirectiveTexts`, `createDirective`, revoke); chat-driven creation via `managerDirectiveIntentService.ts:72-78` `applyConfirmedDirective` |
| Routes + guard | `GET/POST /api/admin/agents/:id/directives`, `POST .../directives/:directiveId/revoke` — `requireAgentManagerOrAdmin()` (`managerDirectiveRoutes.ts:12-14`) |
| Generic assembler | `backend/src/services/agentBlueprint/agentSystemPrompt.ts:95-146` `buildAgentSystemPrompt(personaBlock, enrollmentId, {agentId,...})`. Layer order: PLATFORM_SAFETY_RULES_BLOCK -> role charter -> persona -> MANAGER DIRECTIVES -> APPROVED MEMORY -> reliability state -> learner context -> extraBlocksBeforeClosing -> closing line. Directives/memory/charter only when `agentId` passed (lines 107-120). **Never writes `AiAgent.system_prompt`** — purely string assembly per call |
| Manager-side assembler | `agentManagerConversationPrompt.ts:50-117` — same layers minus learner context, plus real recent tickets/ai_events (`agentRecentActivitySummary.ts`) |
| Reese usage | `services/reese/reeseSystemPrompt.ts` delegates to `buildAgentSystemPrompt` |
| Frontend | Talk tab "Direct" mode creates a directive (`AgentTalkTab.tsx:5-21`); consolidated revoke list in Trust & Control |
| Tests | `managerDirectiveService.test.ts`, `managerDirectiveController.test.ts`, `managerDirectiveIntentService.test.ts`, `agentBlueprint/__tests__/agentSystemPrompt.test.ts:96` (regression: no agentId => no directive/memory/charter block), `agentManagerConversationPrompt.test.ts` |
| Keyed on | `ai_agents.id` (generic) |

## 3. AgentManagerConversation / Talk tab

| Field | Finding |
|---|---|
| Exists | **Yes**, agent-agnostic |
| Models / tables | `AgentManagerConversation.ts` -> `agent_manager_conversations` (agent_id FK line 171, participant_email, participant_org_member_id); `AgentManagerMessage.ts` -> `agent_manager_messages` |
| Service | `backend/src/services/agentManagerConversationService.ts`; `MODEL = process.env.AI_MODEL || 'gpt-4o-mini'` (line 57); prompt = `buildAgentManagerConversationSystemPrompt(agentId, agent.agent_name, agent.system_prompt)` (line 408); `getInstrumentedOpenAI({ workflow_id:'agent_manager_conversation', agent_id })` (line 409). Persona = the agent's own live `system_prompt`, with an honest minimal fallback when null (`agentManagerConversationPrompt.ts:64-68`) |
| Intent layer | `managerDirectiveIntentService`, `managerGoalIntentService`, `managerOneOnOneIntentService`, `managerAssignWorkIntentService`, `agentWorkStatusIntentService`, `agentUncertaintyIntentService`, `agentInterventionIntentService`, approval-decision intent — all generic on agentId |
| Routes + guard | `GET /api/admin/agents/:id/conversation`, `POST /api/admin/agents/:id/conversation/messages` — `requireAgentManagerOrAdmin()` (`agentManagerConversationRoutes.ts:11-12`) |
| Frontend | `frontend/src/components/admin/AgentTalkTab.tsx` (tab key `talk`) |
| Tests | 10 backend service test files (`agentManagerConversationService.*.test.ts`), `agentManagerConversationController.test.ts`, `AgentTalkTab.test.tsx` |
| Keyed on | `ai_agents.id` (generic) |

## 4. Goals, 1:1s, Report subscriptions/runs, Memory proposals

| Item | Model / table (keyed on ai_agents.id) | Service | Routes (all `requireAgentManagerOrAdmin()`) | Frontend | Tests |
|---|---|---|---|---|---|
| AgentGoal | `AgentGoal.ts` -> `agent_goals` (FK line 60; table line 72). Metric keys only `'monthly_cost_usd' | 'open_ticket_count'` (line 24) | `agentGoalService.ts` (UNMEASURED when null, line 40) | `GET/POST /api/admin/agents/:id/goals`, `POST .../goals/:goalId/archive` (`agentGoalRoutes.ts:11-13`) | Performance tab | `agentGoalService.test.ts`, `agentGoalController.test.ts`, `AgentPerformanceTab.test.tsx` |
| AgentOneOnOne | `AgentOneOnOne.ts` -> `agent_one_on_ones` (FK line 55). No recurring cadence (line 14) | `agentOneOnOneService.ts` | `GET/POST .../one-on-ones`, `POST .../one-on-ones/:oneOnOneId/complete` (`agentOneOnOneRoutes.ts:11-13`) | Performance tab | `agentOneOnOneService.test.ts`, controller test |
| AgentReportSubscription / Run | `agent_report_subscriptions` (line 127; FK 82-85; cadence, delivery_hour_local, timezone); `agent_report_runs` (line 88) | `agentReportSubscriptionService.ts`, `agentReportRunService.ts` (`dispatchDueReportRuns`, `computeLocalHour` per subscription timezone line 170). Cron `AgentReportSubscriptionDispatch` via `instrumentCronJob` (`schedulerService.ts:1740`) | `GET/POST .../report-subscriptions`, `PATCH .../report-subscriptions/:subscriptionId`, `GET .../report-runs`, `GET .../report-preview` (`agentReportSubscriptionRoutes.ts:17-25`) | Reports tab | `agentReportSubscriptionService.test.ts`, `agentReportRunService.test.ts`, controller test, `AgentReportsTab.test.tsx` |
| AgentMemoryProposal | `AgentMemoryProposal.ts` -> `agent_memory_proposals` (line 109; FK 72-75); status pending/approved/rejected | `agentMemoryProposalService.ts` — **runtime reader** `getApprovedMemoryTexts(agentId)` line 132 | `GET/POST .../memory-proposals`, `POST .../memory-proposals/:proposalId/approve`, `.../reject` (`agentMemoryProposalRoutes.ts:17-26`); Manager Inbox `GET .../inbox`, `POST .../inbox/:proposalId/approve|reject` (`managerInboxRoutes.ts:17-19`) | Trust & Control (Governed Memory); Live Status / Work & Decisions inbox | `agentMemoryProposalService.test.ts`, controller test, `managerInboxService.test.ts`, `AgentTrustControlTab.test.tsx` |

**Memory approval enforced by the runtime reader — real test, not a comment:** `backend/src/services/__tests__/agentMemoryProposalService.test.ts:151-172` ("getApprovedMemoryTexts — the actual runtime read path") asserts `findAll` is called with `where: { agent_id: 'agent-1', status: 'approved' }` (line 158). `agentBlueprint/__tests__/agentSystemPrompt.test.ts:146-166` proves an approved row yields an APPROVED MEMORY block and a non-approved one does not.

## 5. requireAgentManagerOrAdmin + OrgMember.timezone

| Field | Finding |
|---|---|
| Exists | **Yes** — `backend/src/middlewares/agentManagerAuthMiddleware.ts:50-94` |
| Logic | Runs `requireAdmin` first (line 52); `super_admin` bypass (lines 43, 64-67); otherwise resolves `OrgMember` by JWT `req.admin.email` (line 76, never a client param), then `isAgentInHumanDownstream(orgMember.id, agentId)` (line 82); 403 "not in your reporting chain"; sets `req.agentManagerOrgMemberId` (line 88) |
| What it walks | `services/workforce/orgChartHierarchyService.ts:138-141` -> `resolveHumanDownstreamAgents` (110-133): level 1 = `AiAgent` where `reports_to_type='human' AND reports_to_id=orgMemberId`; then BFS over `reports_to_type='agent'` up to `MAX_DOWNWARD_DEPTH` |
| Routes using it | 27 routes in 10 files: agentDetail (`GET /api/admin/agents/:id`), explainability, goals (3), conversation (2), memory-proposals (4), one-on-ones (3), report-subscriptions/runs/preview (5), charter (2), directives (3), inbox (3) |
| Routes NOT using it | `/api/admin/ai-ops/agents` list/patch/run (`aiOpsRoutes.ts:47-49`, plain `requireAdmin`); `/api/admin/workforce/agents/reset` and `/:id/reactivate` (`workforceRoutes.ts:58,63`, plain `requireAdmin`) |
| Tests | `middlewares/__tests__/agentManagerAuthMiddleware.test.ts` (9 cases incl. custom param name) |
| OrgMember.timezone | **Yes** — `models/OrgMember.ts:33,49,102-106` STRING(60) NOT NULL default `'America/Chicago'`; consumed by report subscriptions (subscription carries its own `timezone` column, read in `agentReportRunService.ts:170`) |

## 6. Presence / always-online

| Field | Finding |
|---|---|
| Writer | **Reese-only.** `backend/src/services/reese/reesePresenceHeartbeat.ts:21-34`: finds `Enrollment` by `REESE_EMAIL`, then `CommunityMember` by enrollment_id, updates `last_active_at`. Scheduled `*/1 * * * *` via `instrumentCronJob('ReesePresenceHeartbeat')` (`schedulerService.ts:1715-1722`); registry row `agentRegistrySeed.ts:2496-2509` (agent_type `ai_staff_mentor`) |
| Storage | `CommunityMember.last_active_at` (also a `presence_status` column exists, `CommunityMember.ts:19,90`, but derivation ignores it) |
| Derivation | `communityService.ts:28-38` `derivePresence`: online <= 90 s, away <= 10 min, else offline |
| Reader (generic) | `services/reese/agentDetailService.ts:270-283` `getAgentDetail`: `AdminUser(agent_id)` -> `Enrollment(email)` -> `CommunityMember(enrollment_id)` -> `derivePresence`; `'unknown'` if chain missing. Same chain in `liveAgentsService.ts` for cards |
| UI | `frontend/src/utils/agentOperationalState.ts:49-89` `deriveOperationalState` (paused / blocked / needs_approval / working / waiting / offline / idle / unknown) from `agent.enabled`, `trust_contract.status`, inbox count, `live_status`, last ticket activity 24 h; rendered in `AgentLiveStatusTab.tsx:66` and the At a Glance "Live Status" tile (`AgentAtAGlanceTab.tsx:182`) |
| Verdict | Reader is generic; the heartbeat writer is hard-coded to Reese. A second employee gets `live_status='unknown'` until it has its own AdminUser->Enrollment->CommunityMember chain and a heartbeat |

## 7. Workforce UI

| Field | Finding |
|---|---|
| `/admin/agents` list page | **Does not exist as a route.** Only `/admin/agents/:id` is mounted (`frontend/src/routes/adminRoutes.tsx:215`). `pages/admin/AdminAISettingsPage.tsx` (table: Agent / Category / Status / Runs / Errors / Last Run from `/api/admin/ai-ops/agents`) and `ai-settings/DepartmentAgentsTab.tsx` are **not imported by any route** (orphaned) |
| Fleet surfaces that exist | `/admin/workforce` `WorkforceOSPage.tsx` -> `OrgChartSection` (Human Employees -> AI Leadership (`reports_to_type='human'`) -> AI Staff (`reports_to_type='agent'`); `orgChartService.ts:179` only includes agents with `reports_to_type` set; cards show display_name, open_ticket_count, hierarchy_color, enabled; drill to `/admin/agents/:id`) + `ActivityTimeline` (`liveAgentsService.ts`: only agents with `AdminUser.is_ai_operated=true AND agent_id NOT NULL`) |
| Employee vs behavior distinction | **None structural.** Reese's employee row `'Reese'` and 4 cron behavior rows share `agent_type:'ai_staff_mentor'` (`agentRegistrySeed.ts:2428, 2497, 2520, 2537, 2564`). Implicit filters: org chart = has `reports_to_type`; live agents = has is_ai_operated AdminUser |
| Agent Detail tabs (exactly as rendered) | `AgentDetailV2Header.tsx:14-23`: **At a Glance, Live Status, Overview, Work & Decisions, Talk, Reports, Performance, Trust & Control** (8) |
| Synthetic org | `services/workforce/orgRegistry.ts` `AI_ORG` still present — 12 fictional `AiEmployee` entries (Ada Sterling CEO, Miles Chen CoS, ...); still feeds WorkforceOSPage's Chief of Staff briefing / Daily Leadership Meeting sections (`WorkforceOSPage.tsx:16-23`). Still isolated: `liveAgentsService.test.ts:375-391` source-greps import lines for `orgRegistry` / `AI_ORG` |

## 8. Tools

| Field | Finding |
|---|---|
| `TOOL_CAPABILITIES` | `backend/src/services/reese/agentToolCapabilities.ts:42-249` — **37 entries**, `Record<string, {reads: string[], produces: string[]}>` keyed by free-text tool name; `deriveAgentCapabilities(tools_granted)` (line 278) surfaces `undocumentedTools`. Documentation only, no execution binding |
| `agentToolRegistry.ts` | `backend/src/services/agents/tools/agentToolRegistry.ts:16-23` — typed code constant `GRANTS = { cory: ['read_attachments'], reese: ['read_attachments'] }`; **2 agents, 1 tool** (`types.ts:12` `AgentToolName = 'read_attachments'`, `:15` `AgentKey = 'cory' | 'reese'`). Keyed on string `AgentKey`, **not** `ai_agents.id`. `AGENT_TOOLS_DISABLED` env kill switch (lines 25-31) |
| `tools_granted` | `AiAgent.tools_granted` JSONB (`AiAgent.ts:434-438`); written from registry entries (`agentRegistrySeed.ts:3012`); read by `deriveAgentCapabilities`, `classifyAgentAutonomyLevel`, `validateAgentTicketStandard`. Free-text strings, no enum |
| Structured tool -> implementation with schema | **Reese-only:** `services/reese/reeseTools.ts:26-42` `REESE_TOOLS: OpenAI.Chat.ChatCompletionTool[]` (2 tools, both `parameters: {properties:{}}`), `executeReeseTool` dispatch line 87; plus `readAttachmentsTool.ts` / `attachmentSchema.ts`. **No generic mapping** from `tools_granted` names to implementations or schemas |
| `AGENT_PERMISSIONS` | `agentPermissionService.ts:36-97` — **36 entries** keyed by `agent_name` string; tiers `'read_only' | 'suggest_only' | 'write_with_audit' | 'communication'` (line 23); `DEFAULT_PERMISSION` = suggest_only (lines 100-104); `getAgentPermission(agentName)` line 111 |

## 9. Autonomy

| Field | Finding |
|---|---|
| Classifier | `backend/src/services/agentCapabilityClassifier.ts:107` `classifyAgentAutonomyLevel(toolsGranted)` — keyword tiers, highest match wins, `observe` default for no tools |
| Script | `backend/src/scripts/classifyAiAgentAutonomyLevels.ts` — dry-run by default, stamps `autonomy_level_source:'auto'`, skips manual |
| Column | `autonomy_level_source 'auto' | 'manual' | null` — `AiAgent.ts:268,313,474-477`; `db/ensureAiAgentAutonomySourceSchema.ts:19`; booted at `server.ts:2789` |
| Ongoing sync | **WIRED.** PR #2540 MERGED 2026-09-15T22:29:38Z (merge commit `14dc8266` = HEAD). `agentRegistrySeed.ts:8` imports `classifyNewAgentAutonomyLevel, maybeReclassifyAutonomyLevel` from `./agentAutonomyReclassificationService`; called at `:3018` (update branch, diffs pre-update `tools_granted`) and `:3028` (create branch). Service never overwrites `source:'manual'`, only logs staleness |
| Manual path | `services/workforce/agentReactivationService.ts` `reactivateAgent` sets level + `set_at` + `source:'manual'`; UI in Agent Detail header |
| Tests | `agentCapabilityClassifier.test.ts`, `scripts/__tests__/classifyAiAgentAutonomyLevels.test.ts`, `agentAutonomyReclassificationService.test.ts`, `agentRegistrySeedAutonomyReclassification.test.ts` |

## 10. Authorization / audit chokepoints

| Chokepoint | Finding |
|---|---|
| `agentAuthorizationService.ts` | Mode from settings key `abac_enforcement` (`getAbacMode`, lines 40-47): `'off' | 'shadow' | 'enforce'`, **default `'shadow'`**. `allowed = enforced ? !wouldDeny : true` (line 195) — shadow never denies. Safe-mode check lines 150-153. Unregistered agent -> `null` -> not blocked (line 98). Every decision emitted as `agent.authorization` ai_event |
| `agentActionAuthorizationBridge.ts` | `authorizeTicketDispatch` (line 69) — thin shadow-only wrapper over `authorizeAgentAction`; writes `approval_requests` rows keyed by pre-generated ledger `eventId`; never throws/blocks. Callers: `ticketAgentDispatcher.ts:108`, `reese/reeseAutonomousOutreachService.ts:155` |
| `agentActivityLogService.ts` | `agentBlueprint/agentActivityLogService.ts:32` `logAgentActivity({agentId,...})` -> `ai_agent_activity_logs` keyed on `ai_agents.id`; generic, fail-open; feeds trust dimensions |
| Cost attribution | `openaiInstrumented.ts:30` `getInstrumentedOpenAI({ agent_id, workflow_id, ... })` -> `emitAiEvent` with `cost_usd` (`aiEventService.ts:140,172`). Conversation service passes `agent_id` (line 409). Attribution is opt-in per call site |
| Work ledger | `services/workLedger/`: `workLedgerService.emitEvent` (line 53) -> `work_ledger_events` (`actor_type/actor_id` copied from ticket `created_by_type/created_by_id` strings, `ticketCreationLedgerHook.ts:91-92`); `approval_requests` (`ApprovalRequest.ts:153`); `separationOfDutyService`, `evidenceExpectationService`, `workLedgerHealthService`, `summaryGeneratorService`. `risk_tier` lives here (and on tickets), not on `ai_agents` |
| Explainability | `agentExplainabilityService.ts` — read-only aggregation of ai_events, `ProposedAgentAction.reason`, authorization verdicts; `GET /api/admin/agents/:id/explainability` |

## 11. Kill switches

| Field | Finding |
|---|---|
| `instrumentCronJob` | `backend/src/services/cronInstrumentation.ts:19-104`: looks up `AiAgent` by `agent_name` (line 27); **not in registry -> runs untracked** (35-38); `!enabled || status==='paused'` -> skip + structured warn (46-52); otherwise sets running, increments run/error counts, writes `AiAgentActivityLog` with trace_id |
| Other per-behavior switches | (a) `AGENT_TOOLS_DISABLED` env — tool-level, global (`agentToolRegistry.ts:25-31`); (b) `abac_enforcement` setting — global mode; (c) safe mode `systemControlService.isSafeModeActive` — global, side-effects only; (d) `REESE_WELCOME_ENABLED` env — Reese-specific; (e) seed-time force-disable of `ContentOptimizationAgent` + `enforceRetiredAgents()` (`agentRegistrySeed.ts:3033-3040`); (f) Agent Detail Deactivate = `resetAgents` (enabled:false + cancel open tickets), Reactivate requires an autonomy level |
| Pattern | A behavior is only individually killable if it has its own registry row (Reese: 4 sibling cron rows). No per-behavior switch inside a single employee row |

## 12. AiAgent columns today (`backend/src/models/AiAgent.ts`)

36 columns: `id, agent_name, agent_type, status, config, last_run_at, last_result, module, source_file, trigger_type, schedule, category, description, enabled, run_count, avg_duration_ms, error_count, last_error, last_error_at, max_runs_per_hour, max_writes_per_execution, max_proposals_per_run, agent_group, created_at, updated_at, system_prompt, tools_granted, persona_version, reports_to_org_member_id (deprecated), reports_to_type, reports_to_id, autonomy_level, autonomy_level_set_at, autonomy_level_source, department, scope`.

| Proposed column | Present? | Nearest existing thing |
|---|---|---|
| record_kind | **No** | implicit: `reports_to_type` set / is_ai_operated AdminUser |
| parent_agent_id | **No** | `agent_group` (super-agent grouping, line 226) or `reports_to_id` when `reports_to_type='agent'` |
| migration_status | **No** | — |
| legacy_alias_of | **No** | `config.legacy_creator_ids` JSONB + `agentBlueprint/legacyCreatorAliases.ts` (read-time alias resolution) |
| human_owner_id | **No** | `reports_to_type='human'` + `reports_to_id` (org_members.id) |
| risk_tier | **No** on ai_agents | exists on `tickets`, `work_ledger_events`, `approval_requests`, `ticket_work_units`, `reese_outreach` |
| autonomy_level_source | **Yes** (line 268) | |
| persona_version | **Yes** (line 234) | history in `AgentPersonaVersionHistory` |
| department | **Yes** (line 275) | |
| category | **Yes** (line 213, `AiAgentCategory` union line 198) | |

## 13. CI guards over AGENT_REGISTRY

| Guard | Finding |
|---|---|
| CI workflow | **None** — no `.github/` reference to the registry or validator |
| tsc | `AgentSeedEntry` interface (`agentRegistrySeed.ts:10-29`): required `agent_name, agent_type (AiAgentType), module, source_file, trigger_type, schedule, category (AiAgentCategory), description`; optional `config, enabled, system_prompt, tools_granted, persona_version`. 232 entries |
| Fleet-wide test | **None** — no test iterates all of `AGENT_REGISTRY` |
| Per-agent registry tests | `ticketCreatorAgentRegistry.test.ts` (tools_granted populated for 5 creators + AgentBehaviorMonitorAgent; line 177 "every declared tool traces to a real grep-able signal in source"), `agentRegistrySeedReesePresenceHeartbeat`, `agentRegistrySeedReeseOutreach`, `agentRegistrySeedPersonaVersionHistory`, `agentRegistrySeedAutonomyReclassification`, cory/corybrain/inboxCase/bpos resolver registry tests, `marketingPublishingWorkerRegistry`, `agentRegistrySeedMandrillPoll` |
| `validateAgentTicketStandard.ts` | Runtime DB diagnostic, **explicitly "NOT a merge gate"** (lines 9-11); checks registration, tools_granted populated, display identity, reports_to chain resolves to a human, recurring resolver — for the 6 agents in `AGENT_TICKET_RESOLVER_REGISTRY` |
| Other | `agentRegistryAuditClassification.ts` static dead/pipeline-step buckets; `liveAgentsService.test.ts` orgRegistry isolation source-grep; `ticketService.createTicket` rejects agent creators with null reports_to (`AiAgent.ts:236-239`) |

## Summary: what the second employee gets for free vs must build

**Free (generic, keyed on `ai_agents.id`, guarded by `requireAgentManagerOrAdmin`, tested):** role charter; standing directives; governed memory with a runtime reader that only injects `status='approved'` (proven by test); the two-path runtime context assembler (safety rules -> charter -> persona -> directives -> memory -> reliability -> learner context) that never mutates `system_prompt`; the Talk conversation (gpt-4o-mini, agent's own system_prompt, intents for directive/goal/1:1/assign-work); goals (2 metric keys), 1:1s, report subscriptions with timezone-aware cron dispatch, manager inbox; the full 8-tab Agent Detail page; explainability; manager-vs-admin server-side chain walk; cost attribution via `getInstrumentedOpenAI({agent_id})`; activity log write path; registry-row kill switch via `instrumentCronJob`; automatic autonomy classification on create/update (PR #2540 wired). All of it lights up the moment the new employee has an `ai_agents` row with `reports_to_type/reports_to_id` set and an `is_ai_operated` AdminUser with `agent_id`.

**Must build:** (1) presence heartbeat — the writer is hard-coded to `REESE_EMAIL`; either a second copy or a generic heartbeat over all is_ai_operated identities; (2) a structured tool layer — `tools_granted` is free text, `TOOL_CAPABILITIES` is docs-only, `agentToolRegistry` is a 2-key/1-tool constant, and only Reese has JSON-schema tools with a dispatcher; (3) a fleet list page — `/admin/agents` does not exist and `AdminAISettingsPage` is orphaned; (4) an employee-vs-behavior marker — no `record_kind`/`parent_agent_id`; employee and behavior cron rows share `agent_type`; (5) real enforcement — `abac_enforcement` defaults to `shadow`, `authorizeTicketDispatch` is advisory, `AGENT_PERMISSIONS` is a hand-keyed 36-entry map by name; (6) any of `migration_status`, `legacy_alias_of`, `human_owner_id`, `risk_tier` on `ai_agents`; (7) a CI gate over the registry — only tsc shape checking and per-agent tests exist, the validator is a non-blocking script.

**Doc correction:** `IMPLEMENTATION_STATUS.md` (Checkpoints B-G "NOT STARTED") is stale; B through F are shipped on main.
