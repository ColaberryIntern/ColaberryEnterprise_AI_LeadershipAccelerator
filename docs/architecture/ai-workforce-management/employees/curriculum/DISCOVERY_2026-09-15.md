# Phase 1 Discovery: Employee #1 "Curriculum, Learning & Certification"

Read-only discovery by a subagent against worktree HEAD `072d7afd` (origin/main `14dc8266`), persisted verbatim by the orchestrator (session CC-20260915-a1x7, entities restored). No file modified by the discovery.

Conventions: paths are relative to `backend/src/` unless prefixed. Risk tiers use `modules/delivery/deliveryRiskLevels.ts:50-57` (R0 read_only / R1 reversible_content / R2 code_change / R3 schema_security_or_external_side_effect).

## 0. Three cross-cutting findings that change the picture

**F1. Five of the eight rows cannot complete their designed action today: `createTicket` throws for them.**
`services/ticketService.ts:86` calls `enforceReportsToGate(created_by_type, created_by_id)` before any write; `services/ticketCreatorReportsToResolver.ts:159-174` throws `TicketCreatorNotReportableError` (`reason:'no_reports_to'`) when the creating agent's `reports_to` chain does not resolve to a human. `FLEET_RECONCILIATION_2026-09-15.md:93` lists the 23 rows that have a `reports_to`; **CurriculumArchitectAgent, ArtifactGenerationAgent, CurriculumQAAgent, WorkforceCurriculumDirector and WorkforceCertificationDirector are not among them** (only `LearningInnovationArchitect` is, via `agentBlueprint/ticketCreatorIdentitySeed.ts:207,235` -> CoryBrain -> `ORG_MEMBER.ALI` at `:30,:19`). Consequences, per source:
- `agents/curriculumArchitectAgent.ts:125-142` creates one sub-ticket per lesson inside the lesson loop; the first `createTicket` throws, is caught at `:144-146`, and the run returns with the module (`:80-86`) and the first lesson (`:103-110`) already persisted. Partial write, no rollback.
- `agents/curriculumQAAgent.ts:111-122` creates a ticket per issue; throws on the first issue, caught at `:136-138`; the scan action is recorded but zero tickets land.
- `workforce/workforceAgentRuntime.ts:98-116` (`mirrorTicket`) catches and swallows the throw (`ticket_mirror_failed`), so the `WorkforceTask` write (`directorActions.ts:55-63`) succeeds but the promised ticket mirror never appears.
- ArtifactGenerationAgent creates no tickets, so it is unaffected by F1 (but see F2).
**Orchestrator confirmation (production, 2026-09-15):** `reports_to_type` is null on all five rows; only `LearningInnovationArchitect` has one (`agent`).

**F2. The three "work-graph tools" have no live automatic dispatcher.** The only auto-dispatch loop, `agents/ticketManagementAgent.ts:42-77`, is never scheduled or imported: `grep -rn "runTicketManagementAgent\|ticketManagementAgent'" backend/src --include=*.ts | grep -v __tests__` returns only its own definition (`:42`) and a comment in `ticketAgentDispatcher.ts:36`; every other hit is prose. The CSV already classes `TicketManagementAgent` as retire. Remaining reachability of the three tools: `POST /api/admin/tickets/:id/dispatch` (`routes/admin/ticketRoutes.ts:271-273`, behind `router.use(requireAdmin)` at `:60`) and `POST /api/admin/tickets/:id/retry` (`:402-404` -> `workGraph/workCoordinatorService.ts:167-171`). Nothing else calls `dispatchTicketToAgent`.

**F3. LLM cost for four of the eight (and two Part-2 crons) is invisible per agent.** `intelligence/assistant/openaiHelper.ts:16` builds one shared client with `getInstrumentedOpenAI({ workflow_id: 'assistant', prompt_version: 'assistant-pipeline-v1' })` and no `agent_id`; `chatCompletion` (`:26-51`) and `getOpenAIClient()` both use it. So `ai_events` rows for CurriculumArchitectAgent, ArtifactGenerationAgent, LearningInnovationArchitect, ArchitectEvaluationAgent and AnthropicCurriculumImpactAgent all carry `workflow_id='assistant'`, `agent_id=NULL`, indistinguishable from Cory's assistant traffic. None of the eight passes `agent_id` to `getInstrumentedOpenAI`.

---

## PART 1. The eight classified rows

### 1.1 LearningInnovationArchitect (CSV: behavior)
| # | Point | Evidence |
|---|---|---|
| 1 | Accountable employee | Curriculum (Swati); today `reports_to` -> CoryBrain -> Ali (`ticketCreatorIdentitySeed.ts:207,235`; CoryBrain -> `ORG_MEMBER.ALI` `:30`) |
| 2 | Business capability | 6-hourly "strategy cycle" for the `education` department: health grade, 0-3 LLM-proposed initiatives, one strategic ticket per initiative |
| 3 | Source implementation | Registry `agentRegistrySeed.ts:1947-1958` (`config.department_slug:'education'`, `tools_granted` x5, no `system_prompt`/`persona_version`). Runner `aiOrchestrator.ts:796-798` -> `runAgent('LearningInnovationArchitect', runStrategyArchitectAgent)` (`:167-290`) -> `agents/strategy/strategyArchitectAgent.ts:60-289`. Department config `agents/strategy/departmentStrategyConfigs.ts:121-128` (`max_initiatives_per_cycle:3`) |
| 4 | Trigger / schedule | Cron `26 */6 * * *` America/Chicago, `aiOpsScheduler.ts:301`; DB override from `cron_schedule_configs` via `resolveAllCronSchedules` `:550,:584-588`. No aiOps name-vs-row split. |
| 5 | Input data / permissions | Reads `departments` (`:92`), `initiatives` planned/active (`:120-123`), `department_events` last 10 (`:128-132`), `evaluateDepartmentHealth` + `identifyOpportunities` (`departmentInitiativeEngine.ts:56,:125`). No `AGENT_PERMISSIONS` entry. |
| 6 | Output / external effects | DB: `initiatives` insert (`departmentInitiativeEngine.ts:221-234`), `department_events` (`:237-249`, `:286-294`, `strategyArchitectAgent.ts:251-264`), `tickets` type `strategic` source `strategy_architect` (`:267-283`), `departments.health_score/innovation_score` bump (`strategyArchitectAgent.ts:244-248`). LLM: `gpt-4o` hard-coded (`:14,:143-152`) via `getOpenAIClient()` (F3). **No email/DM/Basecamp/GitHub/Mandrill.** |
| 7 | Risk tier | **R1** |
| 8 | Authorization chokepoint | None on the write path. `runAgent` only checks `enabled`/`paused` (`aiOrchestrator.ts:179-187`). Dedup is the only gate (`departmentInitiativeDedupKey.ts`). |
| 9 | Activity / cost / ticket evidence | `ai_agents.run_count/last_run_at/error_count` updated by `runAgent` (`:211-224`, `:262-268`); `ai_agent_activity_logs` success (`:231-248`) and failure (`:269-277`); LLM rows under workflow `assistant` (F3). Tickets: `created_by_id='LearningInnovationArchitect' AND source='strategy_architect'`. `ticketCreatorIdentitySeed.ts:186-187` records that the 16 Architects had created 3,576 open tickets, 100% never closed. |
| 10 | Success metric | Registry description says there is no resolver and tickets stay open (`:1955`). Candidate: initiatives with a real terminal state; ratio acted on by a human. |
| 11 | Kill switch / rollback | `ai_agents.enabled=false` or `status='paused'` (`:179-187`); `cron_schedule_configs` enabled flag. Rollback: delete the cycle's `initiatives`/`tickets`/`department_events` by agent; score bump not reversed automatically. |

Tests: none for `strategyArchitectAgent.ts`; `departmentInitiativeDedupKey.test.ts` covers dedup only. LLM: yes (no `agent_id`). DB writes: initiatives, department_events, tickets, ticket_activities, departments. Outbound: none. **Production: disabled since late August; 609 runs, last 2026-08-24.**

### 1.2 WorkforceCurriculumDirector (CSV: behavior)
| # | Point | Evidence |
|---|---|---|
| 1 | Accountable employee | Curriculum (Swati). Today: **no `reports_to`**. |
| 2 | Business capability | Once daily, turn the top deterministic "curriculum" recommendation into one `workforce_tasks` row for a human. |
| 3 | Source implementation | Registry `agentRegistrySeed.ts:2213-2223` ("No LLM call"). Runner `aiOpsScheduler.ts:342` -> `workforce/directorActions.ts:71` -> `runDomainFlag('curriculum','WorkforceCurriculumDirector','curriculum')` (`:41-68`) -> `workforceAgentRuntime.ts:141-198` (`runDirectorWrite`). Signal source `ops/schoolSignals.ts:55-110` (read-only), rules `ops/directors.ts:52-54` (`curriculum.first` if 0 blueprints, `curriculum.improve` if avg quality < 65). |
| 4 | Trigger / schedule | Cron `10 6 * * *` CT; manual "run now" via `trustController.ts:172` -> `runDirectorBySlug` (`directorActions.ts:227-231`). Doc drift: `aiOpsScheduler.ts:337-340` says "All seed disabled"; registry says `enabled:true`. |
| 5 | Input / permissions | Reads active `enrollments`, `student_levels`, `curriculum_blueprints.quality_score`, per-student signals. `AGENT_PERMISSIONS`: `write_with_audit`, tables `['workforce_tasks']`, op `flag_curriculum` (`agentPermissionService.ts:88`). |
| 6 | Output / external effects | `workforce_tasks` insert (`directorActions.ts:55-63`, `approver:'chief_of_staff'`); `ai_agent_activity_logs` (`workforceAgentRuntime.ts:170-176`); `ai_events` `agent.action` with `workflow_id:'workforce_curriculum'`, `agent_id` set (`:177-185`); ticket mirror (`:99-111`) **fails today per F1**, swallowed. No LLM. No email. |
| 7 | Risk tier | **R1** |
| 8 | Authorization chokepoint | `gate()` `:66-73`: registry row, `enabled`, not `paused`, global kill switch, safe mode; then `validateAgentWrite` (tier + table allow-list, ABAC shadow-logged). Idempotent on `source_rec_key` open task (`directorActions.ts:24-27`). **The best chokepoint in the set.** |
| 9 | Evidence | `ai_agents.run_count/last_run_at` never written (not in `UNINSTRUMENTED_AGENTS`, `aiOpsScheduler.ts:114-117`; runner runs bare `:487-489`). Real evidence: `ai_agent_activity_logs.agent_id`, `ai_events.workflow_id='workforce_curriculum'`, `workforce_tasks.employee_slug='curriculum'`. |
| 10 | Success metric | Tasks acted on / closed by the approver; `WorkforceTask.status` transitions are human-only. |
| 11 | Kill switch / rollback | `ai_agents.enabled`, `status='paused'`, global kill switch, safe mode; `cron_schedule_configs`. Rollback: delete the `workforce_tasks` row. |

Tests: `workforce/__tests__/directorActions.test.ts:59-102` (shared `runDomainFlag` path), `workforceAgentRuntime.test.ts` (the gate). LLM: no. Outbound: none.

### 1.3 WorkforceCertificationDirector (CSV: behavior)
Identical mechanics to 1.2: registry `agentRegistrySeed.ts:2235-2245`; cron `30 6 * * *` `aiOpsScheduler.ts:344` -> `directorActions.ts:73`; rule `ops/directors.ts:45-46` (`cert.boost` when `avg_pass_prob < 55`, from `runtime/certificationReadiness.ts:28`); permission `agentPermissionService.ts:90`; `ai_events.workflow_id='workforce_certification'`. Same F1 and same missing `run_count`. No LLM, no outbound. Risk R1.

### 1.4 CurriculumArchitectAgent (CSV: tool)
| # | Point | Evidence |
|---|---|---|
| 1 | Accountable | Curriculum. No `reports_to` (F1). |
| 2 | Capability | Given a `curriculum` ticket with `metadata.action='design_module'` (or any `curriculum` ticket via the 0.5-specificity fallback), LLM-design a module + N lessons and spawn one `generate_artifact` sub-ticket per lesson. |
| 3 | Source | Registry `agentRegistrySeed.ts:1025-1034` (`on_demand`). Capability `workGraph/capabilityRegistry.ts:53-63` and fallback `:102-116` -> `agents/curriculumArchitectAgent.ts:29-156`. |
| 4 | Trigger | Ticket dispatch only: `ticketAgentDispatcher.ts:178-374` via `selectAgent` (`workGraph/capabilityRouter.ts:147-157`). Reachable only from admin routes (F2). Curriculum-ticket creators today: itself (`:128`), `curriculumOptimizerAgent.ts` (dead), `studentBehaviorIntelligenceAgent.ts` (retire). In practice only a human-created ticket. |
| 5 | Input / permissions | `program_blueprints` by id (`:49`); ticket metadata. `AGENT_PERMISSIONS` `write_with_audit`, tables `['tickets','ticket_activities']` (`:73`) - **omits `curriculum_modules`/`curriculum_lessons`, which it writes**; the permission is never consulted on this path. |
| 6 | Output | LLM `chatCompletion` (`:70-74`, json, 2000 tokens, `AI_MODEL` default `gpt-4o-mini`, no `agent_id`). DB: `curriculum_modules` (`:80-86`, `status:'draft'`), `curriculum_lessons` (`:103-110`), `tickets` sub-tickets (`:125-142`). Dispatcher adds `agent_runs`, `work_ledger_events`. No outbound. |
| 7 | Risk | **R1** |
| 8 | Chokepoint | Shadow only: `authorizeTicketDispatchSafe` (`ticketAgentDispatcher.ts:254-261`); `requireAdmin` on the route. Router checks `CapabilityEntry.enabled` (code constant `capabilityRegistry.ts:62`), not the DB row. |
| 9 | Evidence | `agent_runs.agent_name`; `work_ledger_events.actor_id`; `tickets.created_by_id`; `ai_events` under `assistant` (F3). `capabilityRegistry.ts:22` calls these "two never-run agents". |
| 10 | Success metric | Modules that reach a non-draft status; none exists in code today. |
| 11 | Kill switch / rollback | Only the code constant or removing admin access. Rollback: delete draft rows by ticket id; partial-write hazard per F1. |

Tests: none exercising the agent. LLM: yes, no `agent_id`. Outbound: none.

### 1.5 ArtifactGenerationAgent (CSV: tool)
Registry `agentRegistrySeed.ts:1035-1044`; capability `capabilityRegistry.ts:64-74` (`metadata.action='generate_artifact'`) -> `agents/artifactGenerationAgent.ts:17-116`. Reads `curriculum_lessons` by `metadata.lesson_id` (`:37`); generates 1-2 artifacts per lesson type (`:45-49`) with `chatCompletion` (`:64-68`, no `agent_id`) and writes `artifact_definitions` `status:'draft'` (`:73-87`). Creates no tickets (F1 does not break it), but its only feeder is the Architect's sub-tickets, which F1 blocks. Permission `:74` (allow-list omits `artifact_definitions`). Risk **R1**. Tests: none. Outbound: none.

### 1.6 CurriculumQAAgent (CSV: tool)
Registry `agentRegistrySeed.ts:1045-1054` says `trigger_type:'cron', schedule:'0 */6 * * *'`. **That cron is fictional**: no entry in `aiOpsScheduler.ts`, `schedulerService.ts` or `aiOrchestrator.ts`; the only caller is `capabilityRegistry.ts:75-85` (`metadata.action='qa_check'`). Because the row says cron+enabled, `cronHealthAlertService` treats it as permanently missed. Source `agents/curriculumQAAgent.ts:19-148`: read-only walk of modules -> lessons -> artifacts/mini_sections (`:27-37`), then one ticket per issue **of `type:'bug'`** (`:111-122`), which routes to `PlatformFixAgent` (Platform domain). No LLM. Ticket creation fails per F1. Risk **R1** (R0 without the tickets). Tests: none. Outbound: none.

### 1.7 CurriculumOptimizerAgent (CSV: retire) - confirmed
`agents/curriculumOptimizerAgent.ts:18`; three `createTicket` sites. Zero importers: `grep -rn "curriculumOptimizerAgent\|runCurriculumOptimizerAgent" backend/src --include=*.ts | grep -v __tests__` -> only registry `source_file` strings, a comment, and the definition. No scheduler entry. Not runnable from Admin > Agents (`agent_type` absent from `AGENT_EXECUTORS`, `controllers/aiOpsController.ts:51-62`). Registry cron `0 6 * * *` is another fictional cron that alarms health alerting.

### 1.8 EducationReportingAgent (CSV: retire) - confirmed
Registry `agentRegistrySeed.ts:1685-1695`. Source `agents/reporting/departmentReporterAgent.ts:8-46` self-registers at module load; the module is never loaded (`grep -rn "agents/reporting/" backend/src --include=*.ts | grep -v __tests__ | grep -v source_file` -> empty). No scheduler entry. No test.

---

## PART 2. Overlaps and missing registrations

### 2(a) Untracked `schedulerService.ts` crons (no `ai_agents` row: no kill switch, no run_count, no health alerting)
| Cron | Schedule | Source | What it does | LLM / attribution | Side effects | Tests | Belongs to |
|---|---|---|---|---|---|---|---|
| CurriculumVideoLinkHealth (`schedulerService.ts:2541-2560`) | `20 6 * * *` CT, only if `CURRICULUM_VIDEO_HEALTH_ENABLED=true` (`config/env.ts:136`) | `curriculumHealth/videoLinkHealthService.ts` | YouTube Data API check of ~150 curriculum videos; never edits a card | none | `emitAlert` (`:545-595`) -> `alerts` -> `notifySubscribers` -> `deliverAlert` per `alert_subscriptions` (`alertService.ts:132-142`). External read of YouTube API. | 6 test files | **Curriculum** (behaviour; R0 read + R1 alert rows) |
| AnthropicCurriculumImpactAgent (`:3379-3390`) | `0 3 * * *` UTC | `anthropicCurriculumImpactAgent.ts` | Scores unscored `anthropic_change_events` 1-10 by curriculum impact, updates `severity` (`:114-133`) | `getOpenAIClient()` (`:64`) -> `assistant`, no `agent_id` (F3) | **Email**: `sendCurriculumImpactDigest` for score >= 7 (`:160-170`), recipient `admin_notification_emails[0]` default `ali@colaberry.com` (`:104-112`) | yes | **Curriculum** (behaviour; **R3** for the email). Family with `AnthropicContentWatcher :3354`, `AnthropicChangeDetector :3368`, `AnthropicCatalogScraper :3401` |
| ArchitectEvaluationAgent (`:3446-3465`) | `0 6 * * 6` UTC | `agents/architectEvaluationAgent.ts` | Per active enrollment: LLM score + next steps -> `architect_evaluations` (`:165-167`) | `chatCompletion` (`:122`), `assistant`, no `agent_id` | DB only | yes | **Learner Success** (student-keyed), Curriculum consumes |
| BuildLogDraftGenerator (`:3306-3318`) | `0 11 * * 1` UTC | `buildLogDraftService.ts` | AI-drafts "building in public" sections into `build_log_drafts`; never auto-posts | `workflow_id:'build_log_draft'` (`:183`), no `agent_id` | DB only | yes | **Marketing or Internship**; Curriculum should know |
| LearnerMemoryDistill (`:2040-2053`) | `15 2 * * *` CT | `runtime/learnerMemoryWriter.ts` | Nightly distill of mentor turns into `learner_memory` (`:81-83`), idempotent per (enrollment, day) | `chatJson('learner_memory_distill')` -> `runtimeAi.ts`, workflow only (same gap as Reese's assessment) | DB only | none | **Learner Success** |

Also untracked and curriculum-adjacent: `FeedReleaseTick :1975-1985` (publishes scheduled timeline cards every 15 min), `PodcastRefresh :1945-1955`, `SessionRecordingIngest :2753-2765`.

### 2(b) Curriculum-type / Experience Studio generation: LLM paths with no AiAgent identity
Every generation entry point runs under a human admin (or student) request with `workflow_id` only and **no `agent_id`, no AiAgent row, no activity log**:

| Entry point | workflow_id | Writes |
|---|---|---|
| `controllers/componentController.ts:93` -> `components/componentAiService.ts:46 generateComponent` | `experience_studio_generate` | draft; nothing saved until accept |
| `componentController.ts:102` -> `coDesignComponent` `:73` | `experience_studio_codesign` | recommendations |
| `componentController.ts:108` -> `runtimePreview` `:100` | `experience_studio_runtime_preview` | none |
| `componentController.ts:158` -> `components/rendererService.ts:52 renderSurface` | `renderer_<surface>` | renderer text |
| `components/promptTesterService.ts:58` | `experience_builder_prompt_test` | none |
| `controllers/composerController.ts:47,61,87` -> `composer/composerAi.ts:134 generateCurriculum`, `:169 fillCard`; `composer/blueprintService.ts:120` | `composerAi.ts:95` | curriculum plan / blueprint content |
| `controllers/timelineAdminController.ts:215`, scripts -> `timeline/cardContentService.ts:135 generateCardContent` | `timeline_card_generate` | `timeline_cards` content |
| **Student-triggered**: `controllers/runtimeController.ts:78` (`routes/participantRoutes.ts:91`) -> `cardContentService.ts:309 ensureFreshContent` | `timeline_card_generate` | auto-regenerates class-wide card content on first open / blueprint change / 30-day TTL (`:330-375`): **an LLM write triggered by a student view with no agent identity or authorization** |
| `timeline/courseDraftService.ts:74`, `timeline/videoDraftService.ts:83,162` | `timeline_course_draft`, `timeline_video_suggest`, `timeline_video_draft_text` | drafts |

Kind for the program: **tools** (human-in-the-loop authoring), except `ensureFreshContent`, which is an unattended behaviour.

### 2(c) Student Build Pipeline LLM call sites
Four call sites, all through a **raw `new OpenAI(...)`** client (not `getInstrumentedOpenAI`): **no `ai_events` row at all, no `workflow_id`, no `agent_id`, no cost**: `sbp/intakeQuestionsService.ts:100-110` (call `:202`; student-triggered via `routes/sbpRoutes.ts:148-153`); `sbp/decomposeService.ts:75-87` (call `:115`; from `sbpOrchestrator.ts:267`; model `SBP_DECOMPOSE_MODEL` default `gpt-4o`); `sbp/planRepair.ts:191` and `sbp/scopeAgents.ts:226` reuse that client. Only correlation is a per-build `correlation_id` in logs. No AiAgent represents SBP generation (`GithubInvitationSweep` is the invitation cron, not generation).

### 2(d) Certification prep
No agent, no cron. Services `services/certPrep/*` (19 files) incl. three LLM helpers (`certQuestionTriage.ts:60` `cert_question_triage`; `certQuestionImprover.ts:72` `certprep_question_improve`; `certDistractorLengthener.ts:57` `certprep_option_length`; all `workflow_id` only), reached only from operator scripts. Models: `cert_tracks`, `cert_domains`, `cert_questions`, `cert_question_revisions`, `cert_sessions`, `cert_readiness_snapshots`, `cert_evidence_mappings`. Runtime readiness `runtime/certificationReadiness.ts:28` feeds `schoolSignals.ts:63` (what 1.3 flags on). One outbound: `certPrep/certReviewEmail.ts:147` (question-review email to a human reviewer), operator-run only. Classification: product surface + operator tools; a future employee capability, not a legacy agent to absorb.

### 2(e) Registry rows in curriculum-adjacent categories placed elsewhere by the CSV
- **`Intel_*` ×9** (`:239-279`, category `accelerator`) and **`AiNewsRefresh`** (`:223-231`): CSV -> Marketing. They materialise **student timeline cards** (`intel/intelPipeline.ts:32,:177`) into the learner feed: curriculum delivery content. Recommend joint ownership or move to Curriculum.
- **`WorkforceResearchDirector`** (`:2291-2300`): CSV -> Executive. Its only output is a weekly `workforce_messages` row addressed `to_slug:'curriculum'` (`directorActions.ts:141-146`). Curriculum is the consumer.
- **`Corporate_Training_Agent`** (`:1248-1256`): retire; name overlap only.
- **`StudentBehaviorIntelligenceAgent`**: creates `curriculum`-type tickets (dead); design intent is a Curriculum feeder.
- Reporting rows (`KnowledgeGraphBuilderAgent`, `InsightDiscoveryAgent`, `TrendAnalysisAgent`, `ExperimentRecommendationAgent`) mention lessons/cohorts in descriptions only; no wiring.

---

## PART 3. Baseline hooks
Queries Q1-Q8 were specified by the discovery and run by the orchestrator; results are in `BASELINE_2026-09-15.md`.

---

## PART 4. Recommendations

| Item | Recommendation | One-line reasoning |
|---|---|---|
| LearningInnovationArchitect | **absorb-later** (freeze first) | Real cron, real writes, but the 16-clone strategy template with a 3,576-open-ticket history, `gpt-4o` under the shared `assistant` workflow, no chokepoint; already disabled in production. |
| WorkforceCurriculumDirector | **absorb-now** | Cleanest legacy item: deterministic, R1, real gate and permission row; needs `reports_to` (F1) and run instrumentation; do not reuse its name for the employee. |
| WorkforceCertificationDirector | **absorb-now** | Same mechanics; the only live certification behaviour in the fleet. |
| CurriculumArchitectAgent | **absorb-later** as a tool | Sound capability, currently unreachable (F2), partial-write on F1, no `agent_id`, no tests. |
| ArtifactGenerationAgent | **absorb-later** as a tool | Same; only feeder is the Architect's sub-tickets. |
| CurriculumQAAgent | **absorb-now** as R0 read tool; fix registry | Read-only integrity scan is useful; delete the fictional cron; stop emitting `bug` tickets to PlatformFixAgent. |
| CurriculumOptimizerAgent | **retire** | Zero importers, no scheduler, fictional cron. |
| EducationReportingAgent | **retire** | Never loaded, no scheduler. |
| CurriculumVideoLinkHealth (2a) | **absorb-now** (register + charter) | Pure curriculum behaviour, env-gated, well tested, R0/R1; needs a row for a kill switch. |
| AnthropicCurriculumImpactAgent (+3) | **absorb-later** | Curriculum-relevant but emails Ali (R3) and runs unattributed; register and re-attribute first. |
| ArchitectEvaluationAgent | **stays-elsewhere** (Learner Success) | Student-keyed evaluation. |
| BuildLogDraftGenerator | **stays-elsewhere** (Marketing / Internship) | Social content drafts; register regardless. |
| LearnerMemoryDistill | **stays-elsewhere** (Learner Success) | AI Mentor memory; shares Reese's attribution gap. |
| Experience Studio / composer / card generation (2b) | **absorb-later** as employee tools | Human-driven authoring under `workflow_id` only; `ensureFreshContent` needs an identity and a switch first. |
| SBP generation (2c) | **stays-elsewhere**, flag to Platform | Four raw clients with zero `ai_events`; a cost-attribution defect regardless of owner. |
| Certification prep (2d) | **absorb-later** as capability | Product surface + operator scripts; natural second capability of this employee. |
| Intel_* / AiNewsRefresh (2e) | **stays-elsewhere** but joint | They write student timeline cards; Curriculum needs a veto/subscription. |
| WorkforceResearchDirector (2e) | **stays-elsewhere** | Subscribe the employee to `workforce_messages`. |

**External side effects found across the whole set:** two, both outside the eight rows: (1) `anthropicCurriculumImpactAgent.ts:160-170` nightly digest **email**; (2) `videoLinkHealthService.ts:545-595` alert fan-out per `alert_subscriptions` (env-gated off by default). Within the eight rows: **no email, DM, Basecamp, GitHub or Mandrill call anywhere** (`grep -n "sendEmail\|sendMail\|mandrill\|basecamp\|sendDm\|octokit"` on the seven source files returns nothing).
