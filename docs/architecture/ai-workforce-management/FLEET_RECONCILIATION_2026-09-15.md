# Fleet reconciliation — AGENT_REGISTRY vs. source (Program Phase 0)

Worktree: C:\Users\ali_m\Downloads\acc-ai-employees-wt @ origin/main 14dc8266 (PR #2540 merged). Generated 2026-09-15 by the scripts in this run dir (extractRegistry.js -> crossRef.js -> schedNameMap.js -> reachability.js -> classify.js -> writeReport.js). Every number below is read from the JSON those scripts wrote. Entry line numbers cite the opening brace of the object literal (agent_name is on the next line).

## 1. Headline numbers

| Measure | Value | Produced by |
|---|---|---|
| AGENT_REGISTRY entries (TypeScript AST, object literals in the array) | **232** | extractRegistry.js (typescript 5.9.3 createSourceFile) |
| `^    agent_name:` at entry indent (regex, independent) | **232** | extractRegistry.js regex |
| `agent_name:` anywhere in the file (naive grep) | 252 | extractRegistry.js regex; `grep -c "agent_name:"` gives the same |
| Unique agent_name values | 232 (duplicates within registry: 0) | extractRegistry.js |
| Registry array span | backend/src/services/agentRegistrySeed.ts:31-2932 | extractRegistry.js |

**232 is the true count.** The 252 figure is the naive `agent_name:` grep: 232 entry fields + 16 nested `config: { department_slug, agent_name }` keys inside the Department Strategy Architect entries (backend/src/services/agentRegistrySeed.ts:1801-1981) + 4 non-entry lines (interface field line 10, `findOne({ where: { agent_name` line 2970, `findOrCreate({ where: { agent_name` line 2985, `AiAgent.update(... where: { agent_name: name` line 3111). The stale docstring "Seed the full agent registry (129 agents)" at backend/src/services/agentRegistrySeed.ts:2935 is wrong by 103. The mission text "more than 200" is correct.

## 2. Distribution

### By trigger_type

| trigger_type | entries |
|---|---|
| cron | 189 |
| on_demand | 36 |
| event_driven | 7 |

### By category

| category | entries |
|---|---|
| accelerator | 17 |
| reporting | 17 |
| dept_strategy | 16 |
| admissions | 15 |
| openclaw | 15 |
| executive | 12 |
| operations | 12 |
| behavioral | 11 |
| outbound | 11 |
| strategic | 11 |
| autonomous | 10 |
| admissions_ops | 10 |
| workforce_director | 10 |
| ai_ops | 8 |
| website_intelligence | 8 |
| security_ops | 8 |
| dept_super | 8 |
| student_success | 6 |
| maintenance | 5 |
| memory | 4 |
| meta | 4 |
| curriculum | 4 |
| governance_ops | 4 |
| alumni | 3 |
| partnerships | 3 |

### By agent_type (top 20 of 142 distinct)

| agent_type | entries |
|---|---|
| scheduled_processor | 19 |
| dept_strategy_architect | 16 |
| workforce_director | 10 |
| super_agent | 8 |
| department_reporter | 7 |
| maintenance | 6 |
| self_healing | 6 |
| ai_staff_mentor | 5 |
| ticket_creator_identity | 5 |
| memory | 4 |
| lead_intelligence | 3 |
| action_planner | 3 |
| strategic_intelligence | 3 |
| executive_briefing | 3 |
| insight_computer | 2 |
| digest | 2 |
| monitor | 2 |
| strategic_cycle | 2 |
| trend_detection | 2 |
| access_control | 2 |

### By department

**0 of 232** entries set a `department` field. `AgentSeedEntry` (backend/src/services/agentRegistrySeed.ts:9-28) has no such field; `department` exists only as a nullable column on the AiAgent model (backend/src/models/AiAgent.ts:275) that the seed never writes. The only department-shaped data in the registry is `config.department` on the 7 department_reporter entries (backend/src/services/agentRegistrySeed.ts:1672-1738) and `config.department_slug` on the 16 Architect entries. Department ownership must therefore be assigned, not read.

## 3. Identity / employee fields

| Field | Entries | Names |
|---|---|---|
| system_prompt non-empty | 1 | Reese (REESE_PERSONA_BLOCK, backend/src/services/reese/reeseSystemPrompt.ts:31) |
| persona_version non-empty | 1 | Reese = 2026-08-06 (backend/src/services/agentRegistrySeed.ts:2451) |
| tools_granted non-empty | 28 | ExecutiveStrategyArchitect, GovernanceStrategyArchitect, StrategyFuturesArchitect, FinanceIntelligenceArchitect, OperationsOptimizationArchitect, OrchestrationEcosystemArchitect, InsightArchitect, PartnershipExpansionArchitect, GrowthExperimentArchitect, MarketingAutomationArchitect, AdmissionsConversionArchitect, InfrastructureEvolutionArchitect, PlatformInnovationArchitect, LearningInnovationArchitect, StudentSuccessArchitect, AlumniNetworkArchitect, AgentBehaviorMonitorAgent, Reese, cory-engine, CoryBrain, InboxCaseEngine, workforce_intelligence_engine, WorkforceTicketAutoResolver, CoryEngineTicketAutoResolver, CoryBrainInitiativeTicketAutoResolver, InboxCaseSourceCompletionResolver, bpos_orchestrator, BposCapabilityTicketAutoResolver |
| reports_to (set by seedAgentIdentity, NOT a registry field) | 23 | ExecutiveStrategyArchitect, GovernanceStrategyArchitect, StrategyFuturesArchitect, FinanceIntelligenceArchitect, OperationsOptimizationArchitect, OrchestrationEcosystemArchitect, InsightArchitect, PartnershipExpansionArchitect, GrowthExperimentArchitect, MarketingAutomationArchitect, AdmissionsConversionArchitect, InfrastructureEvolutionArchitect, PlatformInnovationArchitect, LearningInnovationArchitect, StudentSuccessArchitect, AlumniNetworkArchitect, AgentBehaviorMonitorAgent, Reese, cory-engine, CoryBrain, InboxCaseEngine, workforce_intelligence_engine, bpos_orchestrator |
| reports_to_type / reports_to_id / department / risk inline in registry | 0 | not in AgentSeedEntry; reports_to is written by backend/src/services/agentBlueprint/agentIdentitySeed.ts:320-339 from reeseIdentitySeed.ts:69-90 (Reese) and ticketCreatorIdentitySeed.ts:106-237 (6 explicit + 16 Architects) |
| enabled: false at seed | 6 | ReeseStudentSupportSupersessionResolver, CoryEngineTicketAutoResolver, CoryBrainInitiativeTicketAutoResolver, InboxCaseSourceCompletionResolver, BposCapabilityTicketAutoResolver, MarketingPublishingWorker |
| force-disabled every boot | 1 | ContentOptimizationAgent (backend/src/services/agentRegistrySeed.ts:3033-3036) |
| RETIRED_AGENTS (backend/src/services/agentRegistrySeed.ts:2944-2955) | 2 | StudentProgressMonitor (in registry, line 382); CompanyStrategicCycle (NOT in registry; cron removed from aiOpsScheduler.ts:194-201) |

Employee rule (system_prompt AND persona_version AND reports_to) is satisfied by exactly **1** entry: Reese. The other 22 identity-seeded rows (5 ticket_creator_identity + AgentBehaviorMonitorAgent + 16 Architects) have reports_to and tools_granted but no system_prompt/persona_version.

Autonomy classification is now wired at boot: PR #2540 (merged 2026-09-15) added `maybeReclassifyAutonomyLevel()` / `classifyNewAgentAutonomyLevel()` calls in seedAgentRegistry() (backend/src/services/agentRegistrySeed.ts:8, :3018, :3028) from agentAutonomyReclassificationService. Registry entries themselves were not changed by that PR (AST count 232 before and after, verified by re-running extractRegistry.js at HEAD 14dc8266).

## 4. ai_agents rows created outside AGENT_REGISTRY

| Path | What it creates | Live? |
|---|---|---|
| backend/src/services/agentRegistrySeed.ts:2984 `AiAgent.findOrCreate` | the 232 registry rows | yes (boot, via aiOpsScheduler.ts:3 / aiOrchestrator.ts:80) |
| backend/src/intelligence/agents/agentFactory.ts:160 `AiAgent.create` | `agent_type: dynamic` rows, paused + pending approval, from coryEngine.ts:11 / routes/admin/coryRoutes.ts:10 | yes (runtime, admin/Cory-created; not enumerable from source) |
| backend/src/services/governanceService.ts:19 `ensureGovernanceAgents()` | 5 rows: visitor_tracker, intent_scorer, revenue_aggregator, forecast_engine, calendar_intent_booster | **no** - zero callers anywhere in backend/ (grep) |
| backend/src/services/agentRegistrySeed-Ali-AI.ts:1958 `AiAgent.findOrCreate` | 173 entries (stale copy) | **no** - file is imported by nothing (grep); one of 7 `-Ali-AI` orphan files, only aiOrchestrator-Ali-AI.ts has 2 importers |
| backend/src/services/agentBlueprint/agentIdentitySeed.ts:157 `seedAgentIdentity()` | AdminUser + Enrollment + CommunityMember; **updates** reports_to on an existing AiAgent row, throws if the row is missing (line 199-208) or tools_granted is empty (218-225) | yes (boot) |
| backend/src/services/workforce/orgRegistry.ts:72 `WORKFORCE_AGENT_NAME` | lookup map slug -> agent_name for 10 Workforce*Director rows; creates nothing | all 10 names present in registry |
| backend/src/services/cronInstrumentation.ts:19 `instrumentCronJob()` | creates nothing; if no row, runs the job untracked (line 36-39) | - |

## 5. Untracked `instrumentCronJob(name)` call sites (no AGENT_REGISTRY row)

Scan: crossRef.js over 3639 non-test files in backend/src; 64 string-literal call sites, 63 distinct names. **33 names have no registry row** (all in schedulerService.ts). They run every tick with no enabled/paused gate, no run_count, no activity log, and are invisible to cronHealthAlertService (cronInstrumentation.ts:36-39).

| # | name | call site |
|---|---|---|
| 1 | AgentReportSubscriptionDispatch | backend/src/services/schedulerService.ts:1740 |
| 2 | ReliabilityAlerting | backend/src/services/schedulerService.ts:1824 |
| 3 | ProofDeskOutcomeMeasurements | backend/src/services/schedulerService.ts:1837 |
| 4 | PodcastRefresh | backend/src/services/schedulerService.ts:1951 |
| 5 | BlogRefresh | backend/src/services/schedulerService.ts:1967 |
| 6 | FeedReleaseTick | backend/src/services/schedulerService.ts:1982 |
| 7 | LearnerMemoryDistill | backend/src/services/schedulerService.ts:2045 |
| 8 | PaySimplePaymentSync | backend/src/services/schedulerService.ts:2060 |
| 9 | AppPaymentReconcile | backend/src/services/schedulerService.ts:2076 |
| 10 | PaySimpleWebhookHealth | backend/src/services/schedulerService.ts:2114 |
| 11 | RenewalReminders | backend/src/services/schedulerService.ts:2163 |
| 12 | AutopayDisclosure | backend/src/services/schedulerService.ts:2188 |
| 13 | BillingWatch | backend/src/services/schedulerService.ts:2211 |
| 14 | CampaignWatchdog | backend/src/services/schedulerService.ts:2250 |
| 15 | CampaignGraduation | backend/src/services/schedulerService.ts:2450 |
| 16 | InboxCaseAutoSync | backend/src/services/schedulerService.ts:2469 |
| 17 | InboxLivenessReconcile | backend/src/services/schedulerService.ts:2492 |
| 18 | MissedOpportunitiesReport | backend/src/services/schedulerService.ts:2517 |
| 19 | CurriculumVideoLinkHealth | backend/src/services/schedulerService.ts:2543 |
| 20 | InboxDeletedSync | backend/src/services/schedulerService.ts:2571 |
| 21 | SessionRecordingIngest | backend/src/services/schedulerService.ts:2760 |
| 22 | AlumniLifecycleProcessor | backend/src/services/schedulerService.ts:2863 |
| 23 | HotLeadEscalation | backend/src/services/schedulerService.ts:2876 |
| 24 | AliPersonalOutreach | backend/src/services/schedulerService.ts:3108 |
| 25 | ColdOutboundPhaseGraduation | backend/src/services/schedulerService.ts:3121 |
| 26 | SystemHealthMonitor | backend/src/services/schedulerService.ts:3159 |
| 27 | BuildLogDraftGenerator | backend/src/services/schedulerService.ts:3309 |
| 28 | AnthropicContentWatcher | backend/src/services/schedulerService.ts:3354 |
| 29 | AnthropicChangeDetector | backend/src/services/schedulerService.ts:3368 |
| 30 | AnthropicCurriculumImpactAgent | backend/src/services/schedulerService.ts:3382 |
| 31 | AnthropicCatalogScraper | backend/src/services/schedulerService.ts:3401 |
| 32 | ArchitectEvaluationAgent | backend/src/services/schedulerService.ts:3451 |
| 33 | CommunityDigest | backend/src/services/schedulerService.ts:3471 |

Dynamic: `Intel_${src.slug}` (schedulerService.ts:2028) expands to 9 names from backend/src/services/intel/sources/*.ts SLUG constants; all 9 are registered (backend/src/services/agentRegistrySeed.ts:238-278).

## 6. aiOpsScheduler.ts name split (governance key != AiAgent row)

aiOpsScheduler.ts SCHEDULE_REGISTRY/DYNAMIC_SCHEDULE_REGISTRY carry 107 `agentName` values; 32 are not registry names. Their runners call aiOrchestrator.ts `runAgent(<other name>)`, so the cron_schedule_configs / trackTask key differs from the AiAgent row the enabled-gate reads (schedNameMap.js):

| scheduler agentName (aiOpsScheduler.ts) | runner | runAgent() name (aiOrchestrator.ts) | registry row exists |
|---|---|---|---|
| AdmissionsVisitorActivity (:207) | runAdmissionsVisitorActivity | AdmissionsVisitorActivityAgent (:419) | yes |
| AdmissionsConversationMemory (:208) | runAdmissionsConversationMemory | AdmissionsConversationMemoryAgent (:423) | yes |
| AdmissionsIntentDetection (:209) | runAdmissionsIntentDetection | AdmissionsIntentDetectionAgent (:427) | yes |
| AdmissionsProactiveOutreach (:210) | runAdmissionsProactiveOutreach | AdmissionsProactiveOutreachAgent (:439) | yes |
| AdmissionsConversationContinuity (:211) | runAdmissionsConversationContinuity | AdmissionsConversationContinuityAgent (:447) | yes |
| AdmissionsHighIntentDetection (:212) | runAdmissionsHighIntentLead | AdmissionsHighIntentLeadAgent (:451) | yes |
| AdmissionsInsightsAggregation (:213) | runAdmissionsInsights | AdmissionsInsightsAgent (:459) | yes |
| AdmissionsExecutiveUpdate (:214) | runAdmissionsExecutiveUpdate | AdmissionsExecutiveUpdateAgent (:463) | yes |
| AdmissionsCallCompliance (:215) | runAdmissionsCallCompliance | AdmissionsCallComplianceMonitor (:493) | yes |
| AdmissionsCallbackManagement (:216) | runAdmissionsCallback | AdmissionsCallbackManagementAgent (:497) | yes |
| AdmissionsAssistant (:218) | runAdmissionsAssistant | AdmissionsAssistantAgent (:505) | yes |
| OpenclawSupervisor (:221) | runOpenclawSupervisor | OpenclawSupervisorAgent (:529) | yes |
| OpenclawMarketSignal (:222) | runOpenclawMarketSignal | OpenclawMarketSignalAgent (:533) | yes |
| OpenclawConversationDetection (:223) | runOpenclawConversationDetection | OpenclawConversationDetectionAgent (:537) | yes |
| OpenclawEngagementMonitor (:224) | runOpenclawEngagementMonitor | OpenclawEngagementMonitorAgent (:541) | yes |
| OpenclawResponseOrchestrator (:225) | runOpenclawResponseOrchestrator | OpenclawResponseOrchestratorAgent (:545) | yes |
| OpenclawFollowUp (:226) | runOpenclawFollowUp | OpenclawFollowUpAgent (:577) | yes |
| OpenclawContentResponse (:227) | runOpenclawContentResponse | OpenclawContentResponseAgent (:549) | yes |
| OpenclawQualityGate (:228) | runOpenclawQualityGate | OpenclawQualityGateAgent (:581) | yes |
| OpenclawBrowserWorker (:229) | runOpenclawBrowserWorker | OpenclawBrowserWorkerAgent (:553) | yes |
| OpenclawLearningOptimization (:230) | runOpenclawLearningOptimization | OpenclawLearningOptimizationAgent (:557) | yes |
| OpenclawInfrastructureMonitor (:231) | runOpenclawInfraMonitor | OpenclawInfraMonitorAgent (:561) | yes |
| OpenclawTechResearch (:232) | runOpenclawTechResearch | OpenclawTechResearchAgent (:565) | yes |
| OpenclawLinkedInCommentMonitor (:233) | runOpenclawLinkedInCommentMonitor | OpenclawLinkedInCommentMonitorAgent (:585) | yes |
| SkoolSupervisor (:236) | runSkoolSupervisorAgent | SkoolSupervisor (:617) | **NO** |
| SkoolSignalDetection (:237) | runSkoolSignalDetectionAgent | SkoolSignalDetection (:601) | **NO** |
| SkoolContentResponse (:238) | runSkoolContentResponseAgent | SkoolContentResponse (:605) | **NO** |
| SkoolQualityGate (:239) | runSkoolQualityGateAgent | SkoolQualityGate (:609) | **NO** |
| SkoolBrowserWorker (:240) | runSkoolBrowserWorkerAgent | SkoolBrowserWorker (:613) | **NO** |
| SkoolNotificationResponse (:241) | runSkoolNotificationResponseAgent | SkoolNotificationResponse (:621) | **NO** |
| WeeklyReport (:244) | runWeeklyReportAgent | WeeklyReport (:627) | **NO** |
| WorkforceIntelligence (:247) | runWorkforceIntelligenceAgent | WorkforceIntelligence (:633) | **NO** |

**8 scheduled jobs have no registry row under either name** (SkoolSupervisor, SkoolSignalDetection, SkoolContentResponse, SkoolQualityGate, SkoolBrowserWorker, SkoolNotificationResponse, WeeklyReport, WorkforceIntelligence). aiOrchestrator.ts runAgent() (line 173-177) does `AiAgent.findOne` and returns null with `[AI Ops] Agent not found` when the row is missing, so these crons never execute unless a row was created by hand in the DB. No seed, migration, script or SQL in backend/ references these names (grep). Their code exists (backend/src/services/agents/skool/*.ts, workforceIntelligenceEngine.ts).

AGENT_GROUP_MAP (backend/src/services/agentRegistrySeed.ts:3069-3104) also names 3 rows that do not exist: AdmissionsAppointmentAgent, AdmissionsCallComplianceAgent, AdmissionsCallbackAgent (registry has AdmissionsAppointmentSchedulingAgent, AdmissionsCallComplianceMonitor, AdmissionsCallbackManagementAgent).

## 7. Duplicate groups

### 7a. Same source_file (7 groups; crossRef.js)

- `backend/src/services/schedulerService.ts` (8): ScheduledActionsProcessor, NoShowDetector, PageEventCleanup, StaleActionRecovery, ChatMessageCleanup, EmailDigest, SessionReminders, SessionLifecycle
- `backend/src/services/agents/apolloLeadIntelligenceAgent.ts` (2): ApolloLeadIntelligenceAgent, ApolloWeeklyEnrollmentAgent
- `backend/src/services/executiveBriefingService.ts` (4): Executive_Briefing_Agent, DailyExecutiveBriefing, WeeklyStrategicBriefing, ExecutiveAwarenessEveningDigest
- `backend/src/intelligence/autonomy/autonomousEngine.ts` (2): AutonomousEngine, cory-engine
- `backend/src/services/agents/reporting/departmentReporterAgent.ts` (7): MarketingReportingAgent, AdmissionsReportingAgent, EducationReportingAgent, StudentSuccessReportingAgent, PlatformReportingAgent, AlumniReportingAgent, PartnershipsReportingAgent
- `backend/src/services/agents/strategy/strategyArchitectAgent.ts` (16): ExecutiveStrategyArchitect, GovernanceStrategyArchitect, StrategyFuturesArchitect, FinanceIntelligenceArchitect, OperationsOptimizationArchitect, OrchestrationEcosystemArchitect, InsightArchitect, PartnershipExpansionArchitect, GrowthExperimentArchitect, MarketingAutomationArchitect, AdmissionsConversionArchitect, InfrastructureEvolutionArchitect, PlatformInnovationArchitect, LearningInnovationArchitect, StudentSuccessArchitect, AlumniNetworkArchitect
- `backend/src/services/workforce/directorActions.ts` (10): WorkforceStudentSuccessDirector, WorkforceCurriculumDirector, WorkforceCareerDirector, WorkforceCertificationDirector, WorkforceFinanceDirector, WorkforceOperationsDirector, WorkforceCommunityDirector, WorkforceTechnologyDirector, WorkforceResearchDirector, WorkforceMarketingDirector

Of these, 5 are parameterised templates (16 Architects keyed by config.department_slug; 10 Workforce directors; 7 department reporters keyed by config.department; 8 schedulerService.ts crons; 2 Apollo runners) - distinct behaviors sharing a file, **not** duplicates. Two groups contain real duplicates:

- **Executive_Briefing_Agent** (backend/src/services/agentRegistrySeed.ts:1107, cron `0 7 * * *`) vs **DailyExecutiveBriefing** (backend/src/services/agentRegistrySeed.ts:2345, cron `45 6 * * *`, scheduled at aiOpsScheduler.ts:366). Executive_Briefing_Agent has no cron call site and zero literal mentions anywhere outside the registry; it is a ghost row for the same executiveBriefingService.ts. Also WeeklyStrategicBriefing / ExecutiveAwarenessEveningDigest share the file but are distinct schedules.
- **cory-engine** (backend/src/services/agentRegistrySeed.ts:2594, ticket_creator_identity, on_demand) vs **AutonomousEngine** (backend/src/services/agentRegistrySeed.ts:1117, cron, aiOpsScheduler.ts:192). Same source_file intelligence/autonomy/autonomousEngine.ts: one row is the cron/governance record, the other the ticket-creator identity with reports_to/tools_granted.

### 7b. Same module label

`module` is a coarse group label with only 28 distinct values (intelligence=37, schedulerService=29, aiOpsScheduler=24 ...) - sharing it is not evidence of duplication.

### 7c. Name-stem / suffix variants

- GrowthExperimentAgent (backend/src/services/agentRegistrySeed.ts:610, intelligence/agents/GrowthExperimentAgent.ts) vs GrowthExperimentArchitect (backend/src/services/agentRegistrySeed.ts:1887, strategyArchitectAgent.ts): different code, same stem - **not** a duplicate, but confusing.
- No FooAgent/FooAgentV2 pairs exist inside the registry (crossRef.js dupByPrefix = 0).
- Cross-registry pairs (registry row vs. scheduler/orchestrator name for the same code): workforce_intelligence_engine (backend/src/services/agentRegistrySeed.ts:2676, workforceIntelligenceEngine.ts) vs scheduler `WorkforceIntelligence` (aiOpsScheduler.ts:247 -> aiOrchestrator.ts:633 runWorkforceAnalysis from the same file); plus the 24 `X` vs `XAgent` pairs in section 6.

## 8. Retire candidates (61)

| Group | n | Evidence | Names |
|---|---|---|---|
| source_file never existed | 22 | fs.statSync false + `git log --all -- <path>` empty; agentRegistryAuditClassification.ts:23 NO_SOURCE_FILE | Organization_Health_Agent, Product_Strategy_Agent, Human_Learning_Strategy_Agent, Program_Evolution_Agent, Content_Marketing_Agent, Enterprise_Opportunity_Agent, Alumni_Outreach_Agent, Alumni_Reengagement_Agent, Alumni_Referral_Agent, Enterprise_Partnership_Agent, Corporate_Training_Agent, Employer_Relationship_Agent, UX_Optimization_Agent, Deployment_Agent, Performance_Monitoring_Agent, Data_Intelligence_Agent, Trend_Detection_Agent, Analytics_Agent, Opportunity_Detection_Agent, Policy_Agent, Risk_Agent, Approval_Agent |
| orchestrator wrapper with zero callers | 18 | reachability.js callersOf() over non-test, non-Ali-AI files; audit WEBSITE_INTELLIGENCE_UNWIRED / ADMISSIONS_ON_DEMAND_UNWIRED; manual trigger map aiOpsController.ts:51-62 covers only 10 agent_types, none of these | WebsiteUIVisibilityAgent, WebsiteBrokenLinkAgent, WebsiteConversionFlowAgent, WebsiteUXHeuristicAgent, WebsiteBehaviorAgent, WebsiteAutoRepairAgent, WebsiteImprovementStrategist, AdmissionsVisitorIdentityAgent, AdmissionsConversationPlanningAgent, AdmissionsKnowledgeAgent, AdmissionsPageContextAgent, AdmissionsCEORecognitionAgent, AdmissionsDocumentDeliveryAgent, AdmissionsEmailAgent, AdmissionsSMSAgent, AdmissionsAppointmentSchedulingAgent, AdmissionsSynthflowCallAgent, AdmissionsCallGovernanceAgent |
| reporting cluster, source exists, unwired | 15 | 0 external importers of source_file (crossRef.js), no cron site, no scheduler entry; audit REPORTING_UNWIRED (VisualizationAgent/NarrativeAgent excluded - planner-callable, classified tool) | KnowledgeGraphBuilderAgent, ReportingIntelligenceAgent, InsightDiscoveryAgent, TrendAnalysisAgent, MarketingReportingAgent, AdmissionsReportingAgent, EducationReportingAgent, StudentSuccessReportingAgent, PlatformReportingAgent, AlumniReportingAgent, PartnershipsReportingAgent, ExecutiveBriefingReportingAgent, ExperimentRecommendationAgent, RevenueOpportunityAgent, AgentPerformanceAnalyticsAgent |
| registered as cron but never scheduled, 0 importers (post-audit finds) | 4 | no instrumentCronJob/aiOpsScheduler entry; source_file_importers=0 | CurriculumOptimizerAgent, StudentBehaviorIntelligenceAgent, TicketManagementAgent, OpenclawLinkedInFlowAgent |
| retired / force-disabled at boot | 2 | backend/src/services/agentRegistrySeed.ts:2949 RETIRED_AGENTS; :3033-3036 safety disable | ContentOptimizationAgent, StudentProgressMonitor |

Description keyword scan (deprecated|legacy|retired|removed|superseded|obsolete): **0** hits. Weak hits: 3 Explorer* entries say "dark unless flag on" (feature-flagged, not retired); CoryEngineTicketAutoResolver / BposCapabilityTicketAutoResolver say "no longer" in a different sense. Not used as retire evidence.

## 9. Genuinely ambiguous entries

- **4 identity-only rows** (CoryBrain, InboxCaseEngine, workforce_intelligence_engine, bpos_orchestrator; backend/src/services/agentRegistrySeed.ts:2621/2649/2676/2838): agent_type=ticket_creator_identity, on_demand, no schedule, tools_granted + reports_to via ticketCreatorIdentitySeed.ts, but no system_prompt/persona_version. They are the "AI Leadership" tier of the org chart (CoryBrain -> Ali, workforce_intelligence_engine -> Kes) yet fail the employee rule. Left `unresolved`.
- **16 Department Strategy Architects + AgentBehaviorMonitorAgent**: cron behaviors that also carry reports_to (12 -> CoryBrain, 4 -> Taiwo per ticketCreatorIdentitySeed.ts:92-104,232-235) and tools_granted. Classified `behavior` with an employee-candidate note.
- **Trigger-type mismatches**: CurriculumQAAgent (registered cron `0 */6 * * *`, only reachable via ticket dispatch capabilityRegistry.ts:78) and OpenclawAuthorityContentAgent (registered cron `0 8 * * *`, only reachable via openclawRoutes.ts:1717) are classified `tool`; their registry trigger_type is wrong.
- **VisualizationAgent / NarrativeAgent**: the 2026-07-31 audit marks them reporting_unwired, but intelligence/orchestrator/plannerAgent.ts and intelligence/agents/agentRegistry.ts reference them by name as planner-callable capabilities. Classified `tool` rather than `retire`; verify the planner path is live before retiring.
- **20 internal pipeline steps** (Autonomous 8, Meta 4, Memory 3, Strategic 5): registered with their own trigger_type/schedule but only ever run inside a parent loop; classified `behavior` with the parent named.
- **6 enabled:false rows** (5 resolvers + MarketingPublishingWorker): real code, deliberately dark; classified `behavior`.
- **Domain unresolved (16)**: category=behavioral (visitor intent/ICP scoring - marketing or sales), alumni, partnerships have no target domain in the mission list.

## 10. Draft classification summary (LEGACY_AGENT_CLASSIFICATION_draft.csv)

| proposed_kind | entries |
|---|---|
| behavior | 155 |
| retire | 61 |
| tool | 9 |
| unresolved | 4 |
| duplicate | 2 |
| employee | 1 |

| proposed_owner_domain | entries |
|---|---|
| Executive Intelligence & Governance | 72 |
| Platform Automation & Reliability | 38 |
| Marketing Intelligence & Brand | 34 |
| Admissions & Applicant Experience | 28 |
| Sales, Enrollment & Subscriptions | 16 |
| unresolved | 16 |
| Learner Success (Reese) | 11 |
| Website Portfolio & Conversion | 8 |
| Curriculum, Learning & Certification | 8 |
| Internship & Career Readiness | 1 |

## 11. Files in this run dir

- extractRegistry.js
- registry.json
- crossRef.js
- crossref.json
- fleet-inventory.csv
- schedNameMap.js
- scheduler-name-mismatch.json
- reachability.js
- reachability.json
- classify.js
- classification-summary.json
- LEGACY_AGENT_CLASSIFICATION_draft.csv
- writeReport.js
- fleet-reconciliation.md

## Production reconciliation (orchestrator, read-only query 2026-09-15)

`ai_agents` in `accelerator_prod` = **246 rows**. Every one of the 232 registry names exists in production (0 missing). **14 production rows have no registry entry**, all seeded by paths no longer present in `AGENT_REGISTRY`:

| Row | Type | Enabled | Created | Note |
|---|---|---|---|---|
| SkoolBrowserWorker, SkoolContentResponse, SkoolNotificationResponse, SkoolQualityGate, SkoolSignalDetection, SkoolSupervisor | execution/generation/engagement/validation/detection/operational | yes | 2026-04-24/25 | The 6 `Skool*` names `aiOpsScheduler.ts` runs; they execute because these rows exist, not because the registry knows them |
| WeeklyReport | reporting | yes | 2026-04-26 | same: scheduler name with a row outside the registry |
| WorkforceIntelligence | analysis | yes | 2026-04-24 | same |
| calendar_intent_booster, intent_scorer, forecast_engine, revenue_aggregator, visitor_tracker | intent_scorer / scheduled_processor / signal_detector | yes | 2026-03-11 | the March 2026 governance seed (`governanceService.ts ensureGovernanceAgents`, zero callers today) |
| CompanyStrategicCycle | strategy | **no** | 2026-04-24 | disabled |

So: 232 + 14 = 246. 13 of the 14 are enabled. None has a prompt, persona, or reports_to. These 14 belong in `LEGACY_AGENT_CLASSIFICATION.csv` as `behavior` (or `retire` where the code path is gone), owner domain per the scheduler that runs them; they are added there with `source = production_only`.
