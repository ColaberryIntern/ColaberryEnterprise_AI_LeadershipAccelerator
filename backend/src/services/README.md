# Services

All business logic. **518 files** — 266 top-level services plus agent and feature subtrees. This is the largest and most consequential directory in the backend.

Services are called by controllers and by scheduled jobs. They call models. They never import from `controllers/`.

Because a flat list of 266 filenames is not navigable, this README groups them by the business capability they serve. Every service listed here is a real file in this directory.

---

## Naming and structure

- One responsibility per file. `xyzService.ts` does one job.
- Soft size target ~300 lines, hard ceiling 500. Files over the ceiling must be split before new code is added to them.
- Files with an `-Ali-AI` suffix (`aiOrchestrator-Ali-AI.ts`, `aiOpsScheduler-Ali-AI.ts`, `agentRegistrySeed-Ali-AI.ts`) are parallel variants from an earlier fork of the ops layer. They are live, not dead code. Check which one is wired in `server.ts` before editing either.

## Subdirectories

| Path | Files | What's there |
|---|---|---|
| `agents/` | 148 | The agent fleet. See below. |
| `inbox/` | 24 | Inbox COS: classification, triage, reply drafting, deleted-mail recovery, VIP rules, digests. |
| `reporting/` | 16 | Automated report generation and delivery. |
| `strategic-intelligence/` | 9 | Long-horizon strategic analysis. |
| `ops/` | 9 | Operations engine support. |
| `verification/` | 7 | Output verification and smart verifiers. |
| `testing/` | 6 | Test simulation and harness support. |
| `company/` | 6 | Company/department modeling: budgets, goals, directives. |
| `guidedExecution/` | 5 | Step-by-step guided execution flows. |
| `risk/` | 4 | Risk scoring. |
| `nextAction/` | 4 | Next-best-action computation. |
| `cory/` | 4 | Cory, the AI COO persona layer. |
| `adaptive/` | 4 | Adaptive path logic (CAPE). |
| `intelligence/` | 3 | Bridges into `src/intelligence/`. |
| `__tests__/` | 3 | Service unit tests. |

### `agents/`

The 134-agent fleet, catalogued in [../../../docs/agent-catalog/README.md](../../../docs/agent-catalog/README.md).

| Subtree | Files | Scope |
|---|---|---|
| `openclaw/` | 35 | Outbound social engagement across Reddit, Quora, HN, LinkedIn, Dev.to. Governed by the PASSIVE_SIGNAL / HYBRID_ENGAGEMENT / AUTHORITY_BROADCAST strategy taxonomy. Contains `openclawCircuitBreaker.ts`, the canonical circuit-breaker pattern for the repo. |
| `departments/` | 33 | Department-scoped operational agents. |
| `admissions/` | 24 | Admissions funnel, lead qualification, conversation agents. |
| `reporting/` | 11 | Analytics and reporting agents. |
| `security/` | 8 | Monitoring, audit, threat detection. |
| `skool/` | 7 | Skool community engagement, with its own banned-phrase quality gate. |
| `strategy/` | 2 | Strategy agents. |

Cross-importing between agent subtrees is forbidden. If `openclaw/` and `skool/` need the same logic, lift it into `services/`.

---

## Capability clusters

### Admissions and voice AI
`admissionsWorkflowService`, `admissionsKnowledgeService`, `admissionsMemoryService`, `admissionsMayaService`, `admissionsKnowledgeSeed`

Maya is the voice AI agent (Synthflow-backed). She handles proactive welcome/interest calls and the inbound "call me now" callback:
`mayaActionService`, `mayaToolsService`, `mayaCampaignRouter`, `mayaPersonalizationService`, `mayaConversationIntelligenceService`, `mayaConversationSummaryService`, `synthflowService`, `callTranscriptProcessor`

Real dialing requires `ENABLE_VOICE_CALLS=true` **and** test mode off. Both gates default closed.

### Leads, scoring, and CRM
`leadService`, `leadIngestionService`, `leadClassificationService`, `leadIntelligenceService`, `leadScoringEngine`, `externalLeadIngestService`, `csvImportService`, `advisoryLeadMapperService`, `advisorySyncQueueService`

Scoring and targeting: `intentScoringService`, `opportunityScoringService`, `icpProfileService`, `icpInsightService`, `offerScoringService`, `offerRouterService`, `offerEventService`, `sponsorshipScoringService`

External sources: `apolloService` (has a credit kill-switch — Apollo has drained credits before), `ghlService` (GoHighLevel).

### Campaigns
The largest single cluster — 17 `campaign*` services covering the full lifecycle:

*Build and launch* — `campaignService`, `campaignBuilderService`, `campaignStrategyService`, `campaignActivationAuditService`, `campaignApprovalService`, `campaignLifecycleService`

*Run and observe* — `campaignHealthScanner`, `campaignWatchdogService`, `campaignAnalyticsService`, `campaignLinkService`, `campaignContextService`

*Learn and adapt* — `campaignEvolutionService`, `campaignOptimizationService`, `campaignKnowledgeService`, `campaignGraduationService`, `campaignRebuildService`, `campaignRecoveryService`

*Test before shipping* — `testSimulationService`, plus the simulation and test-run models (`CampaignSimulation`, `CampaignTestRun`) surfaced through `admin/campaignSimulationRoutes.ts` and `admin/campaignTestRoutes.ts`

Related but separate: `alumniCampaignService`, `alumniCampaignSupervisor`, `alumniReferralCampaignService`, `mayaCampaignRouter`.

### Curriculum
`curriculumService`, `curriculumManagerService`, `curriculumGenerationService`, `curriculumGraphService`, `curriculumTypeService`, `curriculumVersioningService`

Curriculum card types are **data, not code** — rows in `curriculum_type_definitions` authored through the Experience Studio admin surface. `curriculumTypeService` is the entry point.

Section and quality layer: `miniSectionService`, `miniSectionTypeValidationService`, `sectionResetService`, `sessionGenerationService`, `structureGenerationService`, `chapterQualityService`, `chapterOnTopicGuard`, `gatingService`, `qualityScoringService`

### Students, mentoring, and portfolio
`participantService`, `cohortService`, `enrollmentService`, `mentorService`, `projectMentorService`, `mentorInterventionService`, `skillGenomeService`, `skillRecalculationService`, `portfolioGenerationService`, `portfolioEnhancementService`, `progressMdService`, `sessionChatService`, `sessionChecklistService`, `walkSessionService`

### Student Build Pipeline
Turns a student's capstone idea into a scoped, gated, materialized project:

`projectService`, `projectScopeService`, `projectSelectionService`, `projectSetupService`, `projectScaffoldService`, `projectArchitectService`, `projectDnaService`, `projectWorkflowService`, `projectProgressService`, `projectReconciliationService`, `projectRequirementsContextService`, `projectVariableService`, `projectSuggestionService`, `projectExportService`

Build plan ingestion: `buildPlanIngestService`, `buildPlanIngestHelpers`, `buildPlanSchema`, `buildPreviewService`, `buildHistoryService`

### Requirements engine
`requirementsGenerationService`, `requirementsParserService`, `requirementsMatchingService`, `requirementClusteringService`, `requirementToStepService`, `smartRequirementVerifier`, `autonomousRequirementExpansionService`, `contentAwareVerifier`

Requirements move through an `UNMAPPED -> VERIFIED` lifecycle; the smart verifier is what advances them.

### AI operations and orchestration
`aiOpsService`, `aiOpsScheduler`, `aiOrchestrator`, `taskOrchestrator`, `orchestrationService`, `schedulerService`, `ticketService`, `ticketAgentDispatcher`, `workstationService`

Self-healing: `selfHealingService`, `autoRepairService`, `diagnosticsService`, `systemHealthService`, `systemControlService`, `extensiveCheckService`, `deepReconciliationService`

### Agent governance
`agentPermissionService`, `agentExecutionWrapper`, `agentResourceMonitor`, `agentSafetyAlertService`, `agentOrphanService`, `agentAttributionClassifier`, `agentGitHubService`, `agentRegistrySeed`, `classifyAgentRoles`, `capabilityAgentMapService`, `governanceService`, `governanceResolutionService`, `autonomousRampService`

Every agent action passes through the permission and execution-wrapper layer, which is what makes autonomy auditable rather than unbounded.

### Prompts and LLM plumbing
`promptService`, `promptLabService`, `promptValidationService`, `promptSchemaValidationService`, `systemPromptBuilder`, `llmCallWrapper`, `contentGenerationService`, `aiMessageService`, `synthesisService`

`llmCallWrapper` is the single choke point for model calls — timeouts, retries, and cost accounting live there. Do not call the OpenAI SDK directly from a feature service.

### Communication
`emailService`, `gmailService`, `communicationLogService`, `communicationSafetyService`, `messageValidatorService`, `alertService`, `alertDeliveryService`, `digestService`, `unsubscribeEnforcementService`, `smsOptOutProcessor`

Outbound mail policy: Mandrill is the send transport; the Gmail API is used for drafts and mailbox reads. Every outbound email carries the branded signature and contains no em-dashes — both are enforced, the latter by a pre-commit hook.

### Executive reporting
`executiveBriefingService`, `executiveDeliverableService`, `executiveScoringService`, `executiveAwarenessService`, `executiveAwarenessSeed`, `healthReportService`, `revenueDashboardService`, `dashboardService`, `analyticsService`, `marketingAnalyticsService`

The `reporting/` subtree adds the graph and insight layer: `reportingOrchestrationService`, `insightDiscoveryService`, `insightPersonalizationService`, `narrativeService`, `predictiveAnalyticsService`, `kpiService`, `campaignGraphService`, `marketingFunnelGraphService`, `visitorFlowGraphService`, `intelligenceMapsService`, `agentPerformanceService`, `experimentService`, `revenueOpportunityService`, `coryDecisionEngine`, `coryKnowledgeGraphService`, `coryStrategicSimulationEngine`

The Cory daily brief lands at 6:45 AM CT covering shipped work, tests, failures, risk flags, and next milestones.

### Web and visitor intelligence
`visitorTrackingService` (owns `resolveIdentity()` — identity resolution belongs here, never duplicated in a controller), `visitorAnalyticsService`, `websiteScanner`, `visualScanService`, `uiAnalysisService`, `uiFeedbackEngine`, `uiFeedbackStore`, `UserJourneyMapsService`, `journeyTimelineService`

### Codebase self-analysis
The system reads its own source to build the state graph:
`repoAnalysisService`, `frontendPageDiscovery`, `frontendRouteMapper`, `frontendCallGraphScanner`, `routeDetectionService`, `importGraphAttributionService`, `systemModelScanner`, `commitDrivenMatcher`, `backendContextService`, `claudeMdService`, `foundationFilesService`

### Preview stacks
`previewStackService`, `previewStackReaper`, `frontendPreviewService`

Ephemeral per-user Docker stacks on ports 10000-10999, idle-reaped after 30 minutes. See [../../../directives/per-user-project-previews.md](../../../directives/per-user-project-previews.md).

### Integrations
`githubService`, `paysimpleService` (billing — note that the hosted payment page mints its own customer record), `calendarService`, `meetingService`, `appointmentService`, `strategyPrepService`, `alumniReferralService`, `referralEventBridge`

---

## Rules for adding a service

1. **One responsibility.** If you are about to write "and also" in the file header, split it.
2. **Ships with a test.** At minimum a happy-path unit test. Failure path and boundary cases are expected for anything with a side effect.
3. **Idempotent if it writes.** Same input twice, same end state, no duplicate side effect.
4. **Every external call** declares a timeout, a capped retry policy, and an `error_class`.
5. **Structured logs only.** JSON to stdout with `correlation_id`.
6. **No cross-subtree imports** between agent families. Lift shared logic up to `services/`.

Full contract in [../../CLAUDE.md](../../CLAUDE.md) and [../../../CLAUDE.md](../../../CLAUDE.md).
