# Services

All business logic. **1,726 files** — 378 top-level services plus 18 feature subtrees. The largest and most consequential directory in the backend.

Services are called by controllers and by scheduled jobs. They call models. They never import from `controllers/`.

Because a flat list is not navigable, this README groups by the business capability served.

---

## Naming and structure

- One responsibility per file. `xyzService.ts` does one job.
- Soft size target ~300 lines, hard ceiling 500. Files over the ceiling must be split before new code is added.
- Files with an `-Ali-AI` suffix (`aiOrchestrator-Ali-AI.ts`, `aiOpsScheduler-Ali-AI.ts`) are parallel variants from an earlier fork of the ops layer. They are live, not dead code. Check which is wired in `server.ts` before editing either.

## Feature subtrees

Newer work lands in a named subtree rather than as another top-level file.

| Path | Files | What's there |
|---|---|---|
| `agents/` | 167 | The agent fleet. See below. |
| `sbp/` | 134 | **Student Build Pipeline** — intake, decomposition, gating, honesty guards, build scheduling, progress snapshots. |
| `__tests__/` | 106 | Service unit tests. |
| `timeline/` | 91 | Student timeline runtime: ambient pools, blueprint context, build-station reconciliation, media. |
| `caseStudy/` | 77 | Case Study OS: authoring, public projection, GitHub fetch, fixtures and integration harness. |
| `inbox/` | 67 | Inbox COS: classification, triage, reply drafting, deleted-mail recovery, VIP rules, digests. |
| `cape/` | 67 | **CAPE**, the adaptive path engine: candidate features, card enrichment, skill mapping, diagnostics, governance. |
| `runtime/` | 54 | Student-facing runtime: assessments, read gates, architect-mindset logic, Anthropic client. |
| `inboxCase/` | 54 | Inbox case resolution: action state machine, executors, scenario fixtures. |
| `delivery/` | 46 | Client delivery: contracts, acceptance, change requests, capacity, client projection. |
| `explorerGrowth/` | 39 | Explorer Growth OS: affinity, contactability, identity bridge, scoring, signals. |
| `reese/` | 30 | Reese outreach agent: eligibility, autonomous outreach, DM initiation, tool capabilities. |
| `intel/` | 30 | Intelligence pipeline: AI news ingestion, card content, registry. |
| `ops/` | 26 | Operations engine support. |
| `workforce/` | 26 | AI workforce management: org chart, live agents, director actions, reset/reactivation. |
| `classKit/` | 25 | Class delivery kits: config, decks, build bay. |
| `progression/` | 22 | Points and progression: band ladder, card points, community XP, competency engine, daily caps. |
| `composer/` | 20 | Curriculum composer: blueprints, competency dictionary, coverage gap engine. |
| `communityRooms/` | 20 | Community rooms: bookings, entitlements, DMs, meeting providers. |
| `reporting/` | 16 | Report generation and delivery. |
| `components/` | 16 | Experience Studio components: capability registry, analytics, cost estimation. |
| `projects/` | 14 | Project read/write services and DTOs. |
| `curriculumHealth/` | 14 | Video link health: classifier, probes, API client. |
| `company/` | 14 | Company/department modeling: budgets, goals, directives. |
| Smaller subtrees | | `strategic-intelligence/`, `verification/`, `testing/`, `guidedExecution/`, `risk/`, `nextAction/`, `cory/`, `adaptive/`, `intelligence/` |

### `agents/`

The 134-agent fleet, catalogued in [../../../docs/agent-catalog/README.md](../../../docs/agent-catalog/README.md), split by family: `openclaw/` (outbound social, and home of `openclawCircuitBreaker.ts`, the canonical circuit-breaker pattern for this repo), `departments/`, `admissions/`, `reporting/`, `security/`, `skool/`, `strategy/`.

Cross-importing between agent families is forbidden. If two need the same logic, lift it into `services/`.

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

Section and quality layer: `miniSectionService`, `miniSectionTypeValidationService`, `sectionResetService`, `sessionGenerationService`, `structureGenerationService`, `gatingService`, `qualityScoringService`. Video-link health has its own subtree, `curriculumHealth/`.

### Students, mentoring, and portfolio
`participantService`, `cohortService`, `enrollmentService`, `mentorService`, `projectMentorService`, `mentorInterventionService`, `skillGenomeService`, `skillRecalculationService`, `portfolioGenerationService`, `portfolioEnhancementService`, `progressMdService`, `sessionChatService`, `sessionChecklistService`, `walkSessionService`

### Student Build Pipeline
Turns a student's capstone idea into a scoped, gated, materialized project:

`projectService`, `projectScopeService`, `projectSelectionService`, `projectSetupService`, `projectScaffoldService`, `projectArchitectService`, `projectDnaService`, `projectWorkflowService`, `projectProgressService`, `projectReconciliationService`, `projectRequirementsContextService`, `projectVariableService`, `projectSuggestionService`, `projectExportService`

Plan lifecycle lives in the `sbp/` subtree: `planStore`, `planGate`, `planRepair`, `planContract`, `planDocument`, plus `repoWriter` for committing the result to the student's repo. Preview and history: `buildPreviewService`, `buildHistoryService`.

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
