/**
 * cronRegistryBaseline — the frozen disagreements between the two hand-maintained cron
 * lists, as measured on 2026-10-06. Data only; the assertions live in
 * ../cronRegistryReconciliation.test.ts and the invariant in ./cronRegistryRatchet.ts.
 *
 * This file may only ever SHRINK. The guard fails both on a violation that is not listed
 * here (new rot) and on a listed entry that has stopped violating (it must then be
 * deleted), so there is no way to grow the baseline quietly. Every entry carries the
 * one-line reason it exists; `audit:` notes quote agentRegistryAuditClassification.ts.
 *
 * Nothing in the suite asserts the SIZE of these lists. A census count is a number a
 * maintainer bumps while a defect sails through underneath it, which is exactly what
 * happened to the 239/197/68/114 literals this file used to be checked against. The size
 * is pinned by the ratchet itself: list (i)…(v) must equal observation exactly, in both
 * directions, so an added line only survives if the disagreement it describes is real.
 *
 * That is also what keeps the two single-entry lists at the bottom — (iv) and (v), both
 * describing Dara — from being a mute button. Each entry spells out the trigger type, the
 * seed schedule and every cron expression that fires the name, so changing any of them makes
 * the entry stop matching, and a baseline entry that no longer matches is reported as healed
 * and must be deleted. The row cannot be quietly conformed to the baseline either, because
 * conforming it is the fix.
 *
 * Not named *.test.ts on purpose: jest's testMatch is '**''/__tests__/**''/*.test.ts', so
 * this is a fixture, never a suite.
 */
// (i) Seed rows advertising `trigger_type: 'cron'` that no cron site registers. The
// `audit` notes quote agentRegistryAuditClassification.ts (the 2026-07-31 registry audit);
// `drift` means a SCHEDULE_REGISTRY entry exists for the same agent under another label,
// so the agent does fire — but under a name no ai_agents row carries.
export const KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION: ReadonlyArray<string> = [
  'AdmissionsAssistantAgent', // drift: SCHEDULE_REGISTRY 'AdmissionsAssistant'; schedules also differ
  'AdmissionsCallComplianceMonitor', // drift: 'AdmissionsCallCompliance'; schedules also differ
  'AdmissionsCallbackManagementAgent', // drift: 'AdmissionsCallbackManagement'; schedules also differ
  'AdmissionsConversationContinuityAgent', // drift: 'AdmissionsConversationContinuity'; schedules differ
  'AdmissionsConversationMemoryAgent', // drift: 'AdmissionsConversationMemory'; same schedule
  'AdmissionsExecutiveUpdateAgent', // drift: 'AdmissionsExecutiveUpdate'; same schedule
  'AdmissionsHighIntentLeadAgent', // drift: 'AdmissionsHighIntentDetection'; name and schedule differ
  'AdmissionsInsightsAgent', // drift: 'AdmissionsInsightsAggregation'; name and schedule differ
  'AdmissionsIntentDetectionAgent', // drift: 'AdmissionsIntentDetection'; schedules also differ
  'AdmissionsProactiveOutreachAgent', // drift: 'AdmissionsProactiveOutreach'; same schedule
  'AdmissionsReportingAgent', // audit: confirmed_dead, referenced only by the seed file
  'AdmissionsVisitorActivityAgent', // drift: 'AdmissionsVisitorActivity'; same schedule
  'AgentPerformanceAnalyticsAgent', // audit: confirmed_dead, referenced only by the seed file
  'AlumniReportingAgent', // audit: confirmed_dead, referenced only by the seed file
  'Alumni_Outreach_Agent', // audit: confirmed_dead, no source file was ever written
  'Alumni_Reengagement_Agent', // audit: confirmed_dead, no source file was ever written
  'ArchitectureAgent', // audit: internal_pipeline_step of MetaAgentLoop, not independently scheduled
  'AuditAgent', // audit: internal_pipeline_step of AutonomousEngine, not independently scheduled
  'Content_Marketing_Agent', // audit: confirmed_dead, no source file was ever written
  'CostOptimizationAgent', // audit: internal_pipeline_step of AICOOStrategicCycle
  'CurriculumOptimizerAgent', // cron row, no cron site registers it; not in the 2026-07-31 audit
  'CurriculumQAAgent', // cron row, no cron site registers it; not in the 2026-07-31 audit
  'Data_Intelligence_Agent', // audit: confirmed_dead, no source file was ever written
  'EducationReportingAgent', // audit: confirmed_dead, referenced only by the seed file
  'Employer_Relationship_Agent', // audit: confirmed_dead, no source file was ever written
  'ExecutiveBriefingReportingAgent', // audit: confirmed_dead, referenced only by the seed file
  'Executive_Briefing_Agent', // cron row, no cron site registers it; not in the 2026-07-31 audit
  'ExperimentAgent', // audit: internal_pipeline_step of MetaAgentLoop
  'ExperimentRecommendationAgent', // audit: confirmed_dead, referenced only by the seed file
  'GovernanceAgent', // audit: internal_pipeline_step of AICOOStrategicCycle
  'GrowthExperimentAgent', // audit: internal_pipeline_step of AICOOStrategicCycle
  'InsightDiscoveryAgent', // audit: confirmed_dead, referenced only by the seed file
  'KnowledgeGraphBuilderAgent', // audit: confirmed_dead, referenced only by the seed file
  'MarketingReportingAgent', // audit: confirmed_dead, referenced only by the seed file
  'MonitorAgent', // audit: internal_pipeline_step of AutonomousEngine
  'OpenclawAuthorityContentAgent', // cron row, no cron site and no drift counterpart at all
  'OpenclawBrowserWorkerAgent', // drift: 'OpenclawBrowserWorker'; same schedule
  'OpenclawContentResponseAgent', // drift: 'OpenclawContentResponse'; same schedule
  'OpenclawConversationDetectionAgent', // drift: 'OpenclawConversationDetection'; same schedule
  'OpenclawEngagementMonitorAgent', // drift: 'OpenclawEngagementMonitor'; schedule 0,30 vs 15,45
  'OpenclawFollowUpAgent', // drift: 'OpenclawFollowUp'; schedule 0 10 vs 0 15
  'OpenclawInfraMonitorAgent', // drift: 'OpenclawInfrastructureMonitor'; same schedule
  'OpenclawLearningOptimizationAgent', // drift: 'OpenclawLearningOptimization'; same schedule
  'OpenclawLinkedInCommentMonitorAgent', // drift: 'OpenclawLinkedInCommentMonitor'; same schedule
  'OpenclawLinkedInFlowAgent', // cron row, no cron site and no drift counterpart at all
  'OpenclawMarketSignalAgent', // drift: 'OpenclawMarketSignal'; same schedule
  'OpenclawQualityGateAgent', // drift: 'OpenclawQualityGate'; schedule 5,20,35,50 vs 12,42
  'OpenclawResponseOrchestratorAgent', // drift: 'OpenclawResponseOrchestrator'; 10,25,40,55 vs 20,50
  'OpenclawSupervisorAgent', // drift: 'OpenclawSupervisor'; same schedule
  'OpenclawTechResearchAgent', // drift: 'OpenclawTechResearch'; same schedule
  'Opportunity_Detection_Agent', // audit: confirmed_dead, no source file was ever written
  'Organization_Health_Agent', // audit: confirmed_dead, no source file was ever written
  'PartnershipsReportingAgent', // audit: confirmed_dead, referenced only by the seed file
  'PerformanceAgent', // audit: internal_pipeline_step of MetaAgentLoop
  'Performance_Monitoring_Agent', // audit: confirmed_dead, no source file was ever written
  'PlatformReportingAgent', // audit: confirmed_dead, referenced only by the seed file
  'Policy_Agent', // audit: confirmed_dead, no source file was ever written
  'ProblemDiscoveryAgent', // audit: internal_pipeline_step of AutonomousEngine
  'PromptOptimizationAgent', // audit: internal_pipeline_step of MetaAgentLoop
  'ReportingIntelligenceAgent', // audit: confirmed_dead, referenced only by the seed file
  'RevenueOpportunityAgent', // audit: confirmed_dead, referenced only by the seed file
  'RevenueOptimizationAgent', // audit: internal_pipeline_step of AICOOStrategicCycle
  'Risk_Agent', // audit: confirmed_dead, no source file was ever written
  'StrategicIntelligenceAgent', // audit: internal_pipeline_step of AICOOStrategicCycle
  'StudentBehaviorIntelligenceAgent', // cron row, no cron site registers it; not in the audit
  'StudentProgressMonitor', // retired from SCHEDULE_REGISTRY 2026-08-15; seed row still says cron
  'StudentSuccessReportingAgent', // audit: confirmed_dead, referenced only by the seed file
  'TicketManagementAgent', // cron row, no cron site registers it; not in the 2026-07-31 audit
  'Trend_Detection_Agent', // audit: confirmed_dead, no source file was ever written
  'TrendAnalysisAgent', // audit: confirmed_dead, referenced only by the seed file
  'UX_Optimization_Agent', // audit: confirmed_dead, no source file was ever written
  'WebsiteBehaviorAgent', // audit: confirmed_dead, referenced only by the seed file
  'WebsiteBrokenLinkAgent', // audit: confirmed_dead, referenced only by the seed file
  'WebsiteConversionFlowAgent', // audit: confirmed_dead, referenced only by the seed file
  'WebsiteImprovementStrategist', // audit: confirmed_dead, referenced only by the seed file
  'WebsiteUIVisibilityAgent', // audit: confirmed_dead, referenced only by the seed file
  'WebsiteUXHeuristicAgent', // audit: confirmed_dead, referenced only by the seed file
  'WorkforceCertificationDirector', // cron row, no cron site registers it; not in the audit
  'WorkforceCurriculumDirector', // cron row, no cron site registers it; not in the audit
];

/**
 * (ii) Names a timer can actually fire that have no seed row at all: they run, and
 * instrumentCronJob() tracks every run_count/error_count against an ai_agents row that does
 * not exist, so they are invisible to every health, staleness and trust surface.
 *
 * ── Why this list doubled on 2026-10-06 ──────────────────────────────────────────────
 * Invariant (ii) used to be computed from the two scheduler registries ONLY, while
 * instrumentCronJob() literal names were used solely to CLEAR direction (i). A name scanned
 * from a cron site therefore silenced (i) and was never itself subject to (ii) — the guard
 * was blind to precisely the harm its own header claimed to catch. Extending (ii) to the
 * resolved registration set surfaced 33 live cron jobs, every one of them in
 * services/schedulerService.ts, including the billing cluster (PaySimplePaymentSync,
 * AppPaymentReconcile, AutopayDisclosure, BillingWatch, RenewalReminders) and the two
 * monitors a silent failure would be reported BY (SystemHealthMonitor, ReliabilityAlerting).
 * Line numbers are where instrumentCronJob() is called; the cron expression is the schedule
 * that fires. None of these has an ai_agents row of that name.
 */
export const KNOWN_SCHEDULED_NAMES_WITH_NO_SEED_ROW: ReadonlyArray<string> = [
  'AdmissionsAssistant', // drift counterpart of seed 'AdmissionsAssistantAgent'
  'AdmissionsCallCompliance', // drift counterpart of seed 'AdmissionsCallComplianceMonitor'
  'AdmissionsCallbackManagement', // drift counterpart of seed 'AdmissionsCallbackManagementAgent'
  'AdmissionsConversationContinuity', // drift counterpart of 'AdmissionsConversationContinuityAgent'
  'AdmissionsConversationMemory', // drift counterpart of seed 'AdmissionsConversationMemoryAgent'
  'AdmissionsExecutiveUpdate', // drift counterpart of seed 'AdmissionsExecutiveUpdateAgent'
  'AdmissionsHighIntentDetection', // drift counterpart of seed 'AdmissionsHighIntentLeadAgent'
  'AdmissionsInsightsAggregation', // drift counterpart of seed 'AdmissionsInsightsAgent'
  'AdmissionsIntentDetection', // drift counterpart of seed 'AdmissionsIntentDetectionAgent'
  'AdmissionsProactiveOutreach', // drift counterpart of seed 'AdmissionsProactiveOutreachAgent'
  'AdmissionsVisitorActivity', // drift counterpart of seed 'AdmissionsVisitorActivityAgent'
  'AgentReportSubscriptionDispatch', // schedulerService.ts:1754, */15 * * * *; dispatches due report subscriptions
  'AliPersonalOutreach', // schedulerService.ts:3202, 20 14-22 * * 1-5; sends outreach mail as ali@colaberry.com
  'AlumniLifecycleProcessor', // schedulerService.ts:2957, 0 11 * * *; nightly alumni lifecycle pass
  'AnthropicCatalogScraper', // schedulerService.ts:3495, 45 1 * * 1; weekly course-outline scrape (L1)
  'AnthropicChangeDetector', // schedulerService.ts:3462, 30 2 * * *; L2, writes anthropic_change_events
  'AnthropicContentWatcher', // schedulerService.ts:3448, 0 2 * * *; L1, hashes anthropic_content_registry
  'AnthropicCurriculumImpactAgent', // schedulerService.ts:3476, 0 3 * * *; L3, scores events and mails Ali
  'AppPaymentReconcile', // schedulerService.ts:2159, */20 * * * *; reconciles app-originated payments
  'ArchitectEvaluationAgent', // schedulerService.ts:3545, 0 6 * * 6; weekly per-student project evaluation
  'AutopayDisclosure', // schedulerService.ts:2271, 30 8 * * *; the auto-pay disclosure a charge depends on
  'BillingWatch', // schedulerService.ts:2300, 0 8 * * *; daily billing watch
  'BlogRefresh', // schedulerService.ts:2050, 30 3 * * 1; weekly student blog library refresh
  'BuildLogDraftGenerator', // schedulerService.ts:3403, 0 11 * * 1; weekly build-log to social draft
  'CampaignGraduation', // schedulerService.ts:2542, 0 */6 * * *; campaign phase 1 to 2 to 3 graduation
  'CampaignWatchdog', // schedulerService.ts:2342, */7 * * * *; detects silent campaign failures
  'ColdOutboundPhaseGraduation', // schedulerService.ts:3215, 0 12 * * *; advances leads to the next phase
  'CommunityDigest', // schedulerService.ts:3565, 0 8 * * *; daily community digest mail
  'FeedReleaseTick', // schedulerService.ts:2065, */15 * * * *; publishes cards whose release_date arrived
  'GithubWriteAccessReconcile', // schedulerService.ts:1924, 23 6 * * *; accepts student repo invitations
  'GovOpportunityDailySync', // DYNAMIC_SCHEDULE_REGISTRY, daily 07:00; no seed row ever written
  'HotLeadEscalation', // schedulerService.ts:2970, 3,18,33,48 14-22 * * 1-5; escalates hot leads to a call
  'InboxCaseAutoSync', // schedulerService.ts:2561, 0 * * * *; turns classified inbox mail into Cases
  'InboxDeletedSync', // schedulerService.ts:2663, 25 * * * *; keeps inbox_deleted_emails fresh
  'InboxLivenessReconcile', // schedulerService.ts:2584, 2-57/5 * * * *; re-checks the stalest case items
  'LearnerMemoryDistill', // schedulerService.ts:2128, 15 2 * * *; nightly LearnerMemory distillation
  'MissedOpportunitiesReport', // schedulerService.ts:2609, 0 20 * * *; daily missed-opportunity brief
  'OpenclawBrowserWorker', // drift counterpart of seed 'OpenclawBrowserWorkerAgent'
  'OpenclawContentResponse', // drift counterpart of seed 'OpenclawContentResponseAgent'
  'OpenclawConversationDetection', // drift counterpart of seed 'OpenclawConversationDetectionAgent'
  'OpenclawEngagementMonitor', // drift counterpart of seed 'OpenclawEngagementMonitorAgent'
  'OpenclawFollowUp', // drift counterpart of seed 'OpenclawFollowUpAgent'
  'OpenclawInfrastructureMonitor', // drift counterpart of seed 'OpenclawInfraMonitorAgent'
  'OpenclawLearningOptimization', // drift counterpart of seed 'OpenclawLearningOptimizationAgent'
  'OpenclawLinkedInCommentMonitor', // drift counterpart of 'OpenclawLinkedInCommentMonitorAgent'
  'OpenclawMarketSignal', // drift counterpart of seed 'OpenclawMarketSignalAgent'
  'OpenclawQualityGate', // drift counterpart of seed 'OpenclawQualityGateAgent'
  'OpenclawResponseOrchestrator', // drift counterpart of seed 'OpenclawResponseOrchestratorAgent'
  'OpenclawSupervisor', // drift counterpart of seed 'OpenclawSupervisorAgent'
  'OpenclawTechResearch', // drift counterpart of seed 'OpenclawTechResearchAgent'
  'PaySimplePaymentSync', // schedulerService.ts:2143, */30 * * * *; pulls PaySimple payments
  'PaySimpleWebhookHealth', // schedulerService.ts:2197, */15 * * * *; catches a webhook rejection run
  'PodcastRefresh', // schedulerService.ts:2034, 0 3 * * 1; weekly podcast catalog refresh
  'ProofDeskOutcomeMeasurements', // schedulerService.ts:1882, 0 4 * * *; resolves elapsed outcome windows
  'ReliabilityAlerting', // schedulerService.ts:1869, */15 * * * *; rolling ai_events error-rate alert
  'RenewalReminders', // schedulerService.ts:2246, 0 9 * * *; renewal reminder mail
  'SessionRecordingIngest', // schedulerService.ts:2854, 12,42 * * * *; ingests Meet recordings into Rooms
  'SkoolBrowserWorker', // the six Skool agents were scheduled without ever being seeded
  'SkoolContentResponse', // the six Skool agents were scheduled without ever being seeded
  'SkoolNotificationResponse', // the six Skool agents were scheduled without ever being seeded
  'SkoolQualityGate', // the six Skool agents were scheduled without ever being seeded
  'SkoolSignalDetection', // the six Skool agents were scheduled without ever being seeded
  'SkoolSupervisor', // the six Skool agents were scheduled without ever being seeded
  'SystemHealthMonitor', // schedulerService.ts:3253, 3,18,33,48 * * * 1-5; the system health monitor itself
  'WeeklyReport', // runs Sundays 13:00; no seed row, so run_count is tracked against nothing
  'WorkforceIntelligence', // runs every 6h; no seed row, so run_count is tracked against nothing
];

// (iii) Names present in BOTH lists whose schedules disagree, frozen as
// `name|registrySchedule|seedSchedule` so editing either side trips the ratchet.
export const KNOWN_SCHEDULE_DISAGREEMENTS: ReadonlyArray<string> = [
  'ApolloWeeklyEnrollmentAgent|0 14 * * 1-5|0 14 * * 1', // scheduler widened Mon→weekdays; seed not updated
  'WeeklyStrategicBriefing|45 7 * * 1|45 6 * * 1', // scheduler moved 06:45→07:45 to stop a double send
];

/**
 * (iv) Registered names whose seed row denies carrying a schedule, as
 * `name|triggerType|seedSchedule|firingSchedules`. These rows ARE registered and DO run; the
 * disagreement is that the row the dashboard renders says otherwise. Invariant (i) misses
 * them because it only examines rows that say `cron`, and (iii) because it only compares
 * rows where both sides carry a non-empty schedule.
 */
export const KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE: ReadonlyArray<string> = [
  // One identity, three timers, one counter. Dara legitimately owns three scheduled duties —
  // Curriculum director 06:10, targeted research sweep 06:15, Certification director 06:30
  // (aiOpsScheduler.ts:367/375/369) — and all three fire, every morning. Her seed row
  // (agentRegistrySeed.ts:2500) says `trigger_type: 'event_driven', schedule: ''`, so the
  // dashboard shows an employee with no schedule, and all three duties report run_count /
  // error_count into that single row, which is why a silent failure in one duty reads as the
  // other two succeeding. Intentional ownership, contradicted paperwork: fixing it means the
  // row declaring the duties, not the timers going away.
  'Dara|event_driven||10 6 * * *,15 6 * * *,30 6 * * *',
];

/**
 * (v) One agentName on several registry entries, as `name|registries|everySchedule` with one
 * schedule per row (not deduplicated). Seed rows are asserted unique by the suite; registry
 * rows were not, so several timers sharing one ai_agents row went unremarked.
 */
export const KNOWN_DUPLICATE_REGISTRY_NAMES: ReadonlyArray<string> = [
  // The same real state as the (iv) entry above, from the scheduler's side: three
  // SCHEDULE_REGISTRY entries named 'Dara', one per duty, pooling run_count/error_count into
  // her one row. Listed in both directions on purpose — they heal independently (teaching the
  // seed row to declare cron fixes (iv) and leaves (v); giving each duty its own tracked name
  // fixes (v) and leaves (iv)), and the entry carries all three cron expressions, so retiming
  // or retiring any duty reports this entry as healed and forces it to be re-described.
  'Dara|SCHEDULE_REGISTRY|10 6 * * *,15 6 * * *,30 6 * * *',
];

/** Files that mention the identifier inside a STRING LITERAL — prose naming the function,
 *  which can register nothing. Pinned as a set, not a count: a new file of prose must be
 *  admitted deliberately, and no occurrence anywhere is left unaccounted. The list grew by
 *  one when the accounting moved from the `instrumentCronJob(` call shape to the identifier:
 *  the seed file's own description text names the wrapper with no parens at all, so the old
 *  token never saw it. */
export const EXPECTED_NON_CALL_MENTION_FILES: ReadonlyArray<string> = [
  'scripts/lib/reeseBehaviourInventory.ts', // 4 killSwitch descriptions citing the wrapper
  'services/agentRegistrySeed.ts', // AiNewsRefresh's description: "…failure tracking via instrumentCronJob."
];

/** Where instrumentCronJob() is declared. Pinned because the scan used to skip the WHOLE
 *  file containing the declaration, so a real registration written beside it was invisible;
 *  now only the declaration occurrence itself is exempt, and it must be in this file. */
export const EXPECTED_CRON_DECLARATION_FILES: ReadonlyArray<string> = [
  'services/cronInstrumentation.ts', // export async function instrumentCronJob(agentName, fn)
];

/** Files that import the wrapper. An import binds the name and registers nothing, but it is
 *  an occurrence of the identifier, so it is accounted for rather than invisible — and the
 *  set is pinned, because a NEW importer is a new file that can schedule cron jobs and the
 *  suite should say so out loud before its registrations are taken on trust. */
export const EXPECTED_CRON_IMPORT_FILES: ReadonlyArray<string> = [
  'services/aiOpsScheduler.ts', // the SCHEDULE_REGISTRY / DYNAMIC_SCHEDULE_REGISTRY loops
  'services/schedulerService.ts', // the 60-odd hand-written crons
  'services/scheduling/growthJourneyCrons.ts', // the three Growth Journey crons
];

/** Files where the identifier is used as a VALUE rather than called — `const run =
 *  instrumentCronJob`, a `require` destructure, a reference passed to something else.
 *
 *  Deliberately EMPTY, and this is the whole point of the entry: an alias is a second name
 *  through which registrations can happen, and following one would need whole-file data-flow
 *  analysis — the same "widen it one syntax further out" trap that produced the three bypasses
 *  in this file's history. So the parser does not resolve aliases; it reports them. Any
 *  occurrence makes the suite red with the file, line and source text, and whoever added it
 *  teaches the scan how to resolve that alias (or writes the call directly). */
export const EXPECTED_CRON_ALIAS_FILES: ReadonlyArray<string> = [];

/** Argument forms handed to instrumentCronJob() that are neither a literal nor a template.
 *  Pinned so a new indirection cannot quietly shrink the registered set. */
export const EXPECTED_DYNAMIC_ARG_FORMS: ReadonlyArray<string> = [
  'HANDOFF_DIGEST_AGENT', // const in briefings/handoffDigestSender.ts → 'GrowthJourneyHandoffDigest'
  'entry.agentName', // aiOpsScheduler's own loop over SCHEDULE_REGISTRY / DYNAMIC_SCHEDULE_REGISTRY
];

/** Template-literal cron sites, by prefix. Pinned because each one needs an expansion rule
 *  in cronRegistryWorld's PREFIX_EXPANSIONS: a prefix with no rule resolves to NO names, so
 *  a new one makes the suite red rather than quietly clearing every seed row that starts
 *  with it. That bare-`startsWith` behaviour is the bug these two lines replace. */
export const EXPECTED_CRON_NAME_PREFIXES: ReadonlyArray<string> = [
  'Intel_', // schedulerService.ts:2111, `Intel_${src.slug}` over listIntelSources(), daily 03:45 CT
];
