import cron, { type ScheduledTask } from 'node-cron';
import { wrapWithDeadLetter } from './deadLetterService';
import { seedAgentRegistry } from './agentRegistrySeed';
import { seedDepartments } from './departmentSeed';
import { seedAdmissionsKnowledge } from './admissionsKnowledgeSeed';
import {
  runHealthScans,
  runRepairAgent,
  runContentOptimization,
  runConversationOptimization,
  runOrchestrationHealth,
  runPromptMonitor,
  runOrchestrationRepair,
  runCampaignQA,
  runSelfHealing,
  runLeadIntelligence,
  runWeeklyLeadEnrollment,
  runAdmissionsVisitorActivity,
  runAdmissionsConversationMemory,
  runAdmissionsIntentDetection,
  runAdmissionsProactiveOutreach,
  runAdmissionsConversationContinuity,
  runAdmissionsHighIntentLead,
  runAdmissionsInsights,
  runAdmissionsExecutiveUpdate,
  runAdmissionsCallCompliance,
  runAdmissionsCallback,
  runAdmissionsConversationTaskScan,
  runAdmissionsAssistant,
  runOpenclawSupervisor,
  runOpenclawMarketSignal,
  runOpenclawConversationDetection,
  runOpenclawEngagementMonitor,
  runOpenclawResponseOrchestrator,
  runOpenclawFollowUp,
  runOpenclawContentResponse,
  runOpenclawQualityGate,
  runOpenclawBrowserWorker,
  runOpenclawLearningOptimization,
  runOpenclawInfraMonitor,
  runOpenclawTechResearch,
  runOpenclawLinkedInCommentMonitor,
  runSkoolSignalDetectionAgent,
  runSkoolContentResponseAgent,
  runSkoolQualityGateAgent,
  runSkoolBrowserWorkerAgent,
  runSkoolSupervisorAgent,
  runSkoolNotificationResponseAgent,
  runWeeklyReportAgent,
  runWorkforceIntelligenceAgent,
  runWorkforceTicketAutoResolverAgent,
  runCoryEngineTicketAutoResolverAgent,
  runCoryBrainInitiativeTicketAutoResolverAgent,
  runInboxCaseSourceCompletionResolverAgent,
  runExecutiveStrategyArchitect,
  runGovernanceStrategyArchitect,
  runStrategyFuturesArchitect,
  runFinanceIntelligenceArchitect,
  runOperationsOptimizationArchitect,
  runOrchestrationEcosystemArchitect,
  runInsightArchitect,
  runPartnershipExpansionArchitect,
  runGrowthExperimentArchitect,
  runMarketingAutomationArchitect,
  runAdmissionsConversionArchitect,
  runInfrastructureEvolutionArchitect,
  runPlatformInnovationArchitect,
  runLearningInnovationArchitect,
  runStudentSuccessArchitect,
  runAlumniNetworkArchitect,
  runSecurityDirector,
  runSecretDetection,
  runCodeSecurityAudit,
  runDependencySecurity,
  runRuntimeThreatMonitor,
  runAccessControlGuardian,
  runAiSafetyMonitor,
  runAgentBehaviorMonitor,
  runAdmissionsKnowledgeSync,
  runOfferRouting,
  // Super agents
  runCampaignOpsSuperAgent,
  runLeadIntelligenceSuperAgent,
  runContentEngineSuperAgent,
  runAnalyticsEngineSuperAgent,
  runSystemResilienceSuperAgent,
  runAdmissionsSuperAgent,
  runPartnershipSuperAgent,
  runFinanceSuperAgent,
} from './aiOrchestrator';
import { runAutonomousCycle } from '../intelligence/autonomy/autonomousEngine';
import { runStrategicCycle } from '../intelligence/strategy/aiCOO';
import { runCoryStrategicCycle, runSelfEvolution } from './cory/coryBrain';
import { runMetaAgentLoop } from '../intelligence/meta/metaAgentLoop';
import { resolveAllCronSchedules, ResolvedCronSchedule } from './governanceResolutionService';
import { expireStaleProposals } from './proposalCleanupService';
import { trackAgentRun } from './agentRunTracker';
import { instrumentCronJob } from './cronInstrumentation';

// BC #10099862873 P1 item 1: SCHEDULE_REGISTRY runners for these agents call
// their target module directly and never touch the AiAgent registry — unlike
// most entries below, whose runners (imported from aiOrchestrator.ts) already
// self-track via a private runAgent() helper. Wrapping every entry here in
// instrumentCronJob() as well would double-count run_count/error_count for
// those already-tracked ~55 agents, so only these known gaps are wrapped.
//
// AutonomousEngine/AICOOStrategicCycle/MetaAgentLoop/CoryEvolutionCycle are
// deliberately NOT in this set even though their runner is a bare module call
// below: agentRunTracker.ts's trackAgentRun() (added after this list was
// written, see its own header comment) already wraps each of their runners
// individually. Adding them here too would double-count run_count/error_count
// on the same AiAgent row via two independent writers.
const UNINSTRUMENTED_AGENTS = new Set([
  'AutonomousRequirementExpansion',
  'ProposalCleanupService',
]);

// ─── Live Task Registry ─────────────────────────────────────────────────────
// Every cron task this module creates, keyed by agent_name, so a governance
// toggle can start/stop it WITHOUT a process restart.
//
// Why this exists: schedules were read from cron_schedule_configs exactly once,
// at boot. Flipping `enabled` in the admin UI updated the row and returned 200,
// but the running scheduler never re-read it — so the job kept doing whatever it
// was doing until the next deploy. StudentProgressMonitor sat disabled that way
// for five months (seeded `enabled=false` the day the governance feature
// shipped) while the UI reported the change as applied. A control that silently
// does nothing is worse than no control.
// NOTE: agent_name is not guaranteed unique across the registry, so tasks are
// stored as a LIST per agent. `CompanyStrategicCycle` was registered twice
// (two runners, two schedules) until it was retired on 2026-08-15; a Map holding
// a single task per agent kept only the LAST one and silently orphaned the
// first, leaving a live cron job that reload could never stop. The list keeps
// every task tracked and stoppable, and is retained deliberately — nothing
// prevents a duplicate agent_name from being reintroduced.
const activeTasks = new Map<string, { task: ScheduledTask; schedule: string }[]>();

export interface ScheduleReloadResult {
  started: string[];
  stopped: string[];
  rescheduled: string[];
  unchanged: number;
}

// ─── Schedule Registry ──────────────────────────────────────────────────────
// Maps agent_name (matching cron_schedule_configs rows) to runner + hardcoded default.

interface ScheduleEntry {
  agentName: string;
  hardcodedSchedule: string;
  runner: () => Promise<any>;
  label: string;
}

// Exported for T004's registry-shape test (asserting this run's new cron entry exists
// with a schedule matching its AGENT_REGISTRY row) — plan-audit cycle 2 finding: this
// const was module-private and no test file for this module existed yet. Read-only
// export, zero behavior change.
export const SCHEDULE_REGISTRY: ScheduleEntry[] = [
  // Campaign agents
  { agentName: 'CampaignHealthScanner', hardcodedSchedule: '*/15 * * * *', runner: runHealthScans, label: 'Campaign health scan' },
  { agentName: 'CampaignRepairAgent', hardcodedSchedule: '8,28,48 * * * *', runner: runRepairAgent, label: 'Campaign repair agent' },
  { agentName: 'ContentOptimizationAgent', hardcodedSchedule: '0 */6 * * *', runner: runContentOptimization, label: 'Content optimization' },
  { agentName: 'ConversationOptimizationAgent', hardcodedSchedule: '0 4 * * *', runner: runConversationOptimization, label: 'Conversation optimization' },
  { agentName: 'CampaignQAAgent', hardcodedSchedule: '0 */6 * * *', runner: runCampaignQA, label: 'Campaign QA agent' },
  { agentName: 'CampaignSelfHealingAgent', hardcodedSchedule: '15,45 * * * *', runner: runSelfHealing, label: 'Campaign self-healing' },

  // Platform agents
  { agentName: 'OrchestrationHealthAgent', hardcodedSchedule: '*/5 * * * *', runner: runOrchestrationHealth, label: 'Orchestration health' },
  // RETIRED 2026-08-15 (Ali's decision, session CC-20260814-k4m9): StudentProgressMonitor.
  // It detected genuinely useful things — students stalled >48h on a lesson, missing
  // artifacts, gating checkpoints — but an exhaustive search of the build showed NOTHING
  // read its output: `stuck_student_detected`, `missing_artifacts_detected` and
  // `gating_checkpoint_detected` appeared only in the agent that wrote them. It had
  // already been silently disabled in the governance DB for five months with no
  // student-facing impact, because the agent has no side effects at all (no writes, no
  // sends). Retired rather than left enabled-and-alarming. The manual trigger in
  // aiOpsController.ts ('student_monitor') is left in place and safely no-ops via
  // runAgent()'s enabled check.
  { agentName: 'PromptMonitorAgent', hardcodedSchedule: '*/1 * * * *', runner: runPromptMonitor, label: 'Prompt monitor' },
  { agentName: 'OrchestrationAutoRepairAgent', hardcodedSchedule: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *', runner: runOrchestrationRepair, label: 'Orchestration auto-repair' },

  // Intelligence layer
  { agentName: 'AutonomousRequirementExpansion', hardcodedSchedule: '3,18,33,48 * * * *', runner: async () => { const { runExpansionCycle } = await import('./autonomousRequirementExpansionService'); return runExpansionCycle(); }, label: 'Autonomous requirement expansion' },
  // AutonomousEngine/AICOOStrategicCycle/MetaAgentLoop (below)/CoryEvolutionCycle (bottom of
  // this array) are wrapped in trackAgentRun() — unlike most entries in this registry, their
  // runners (autonomousEngine.ts/cory/coryBrain.ts/metaAgentLoop.ts) never touch the AiAgent
  // row themselves, so without this wrapper they run correctly but always show run_count=0
  // on the Trust Command Center. Confirmed via source read (2026-07-31 registry audit): neither
  // file calls AiAgent.update for its own row.
  { agentName: 'AutonomousEngine', hardcodedSchedule: '5,15,25,35,45,55 * * * *', runner: () => trackAgentRun('AutonomousEngine', runAutonomousCycle), label: 'Autonomous engine' },
  { agentName: 'AICOOStrategicCycle', hardcodedSchedule: '0,30 * * * *', runner: () => trackAgentRun('AICOOStrategicCycle', runCoryStrategicCycle), label: 'Cory Brain strategic cycle' },
  // RETIRED 2026-08-15 (Ali's decision, session CC-20260814-k4m9): both
  // CompanyStrategicCycle registrations removed. It was registered TWICE under
  // one agent_name with two different runners and two different schedules
  // ('15,45 * * * *' here and '0 */4 * * *' below), so it ran on both — and one
  // governance row covered both, making any schedule override ambiguous.
  // Retired entirely rather than de-duplicated. The manual admin trigger in
  // routes/admin/companyRoutes.ts calls runCompanyStrategicCycle() directly and
  // is deliberately left working, so the cycle can still be run on demand.
  { agentName: 'MetaAgentLoop', hardcodedSchedule: '2 * * * *', runner: () => trackAgentRun('MetaAgentLoop', runMetaAgentLoop), label: 'Meta-agent loop' },
  { agentName: 'ApolloLeadIntelligenceAgent', hardcodedSchedule: '0 */6 * * *', runner: runLeadIntelligence, label: 'Apollo lead intelligence' },
  { agentName: 'ApolloWeeklyEnrollmentAgent', hardcodedSchedule: '0 14 * * 1-5', runner: runWeeklyLeadEnrollment, label: 'Daily cold lead enrollment (Mon-Fri 9 AM CT, 20/day)' },

  // Admissions intelligence
  { agentName: 'AdmissionsVisitorActivity', hardcodedSchedule: '*/10 * * * *', runner: runAdmissionsVisitorActivity, label: 'Admissions visitor activity' },
  { agentName: 'AdmissionsConversationMemory', hardcodedSchedule: '*/30 * * * *', runner: runAdmissionsConversationMemory, label: 'Admissions conversation memory' },
  { agentName: 'AdmissionsIntentDetection', hardcodedSchedule: '3,13,23,33,43,53 * * * *', runner: runAdmissionsIntentDetection, label: 'Admissions intent detection' },
  { agentName: 'AdmissionsProactiveOutreach', hardcodedSchedule: '*/5 * * * *', runner: runAdmissionsProactiveOutreach, label: 'Admissions proactive outreach' },
  { agentName: 'AdmissionsConversationContinuity', hardcodedSchedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *', runner: runAdmissionsConversationContinuity, label: 'Admissions conversation continuity' },
  { agentName: 'AdmissionsHighIntentDetection', hardcodedSchedule: '6,16,26,36,46,56 * * * *', runner: runAdmissionsHighIntentLead, label: 'Admissions high-intent lead' },
  { agentName: 'AdmissionsInsightsAggregation', hardcodedSchedule: '10,40 * * * *', runner: runAdmissionsInsights, label: 'Admissions insights' },
  { agentName: 'AdmissionsExecutiveUpdate', hardcodedSchedule: '0 */4 * * *', runner: runAdmissionsExecutiveUpdate, label: 'Admissions executive update' },
  { agentName: 'AdmissionsCallCompliance', hardcodedSchedule: '7,22,37,52 * * * *', runner: runAdmissionsCallCompliance, label: 'Admissions call compliance' },
  { agentName: 'AdmissionsCallbackManagement', hardcodedSchedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *', runner: runAdmissionsCallback, label: 'Admissions callback management' },
  { agentName: 'AdmissionsConversationTaskMonitor', hardcodedSchedule: '*/2 * * * *', runner: runAdmissionsConversationTaskScan, label: 'Admissions conversation task monitor' },
  { agentName: 'AdmissionsAssistant', hardcodedSchedule: '4,14,24,34,44,54 * * * *', runner: runAdmissionsAssistant, label: 'Admissions assistant' },

  // OpenClaw network
  { agentName: 'OpenclawSupervisor', hardcodedSchedule: '*/2 * * * *', runner: runOpenclawSupervisor, label: 'OpenClaw supervisor' },
  { agentName: 'OpenclawMarketSignal', hardcodedSchedule: '*/30 * * * *', runner: runOpenclawMarketSignal, label: 'OpenClaw market signal' },
  { agentName: 'OpenclawConversationDetection', hardcodedSchedule: '5,35 * * * *', runner: runOpenclawConversationDetection, label: 'OpenClaw conversation detection' },
  { agentName: 'OpenclawEngagementMonitor', hardcodedSchedule: '15,45 * * * *', runner: runOpenclawEngagementMonitor, label: 'OpenClaw engagement monitor' },
  { agentName: 'OpenclawResponseOrchestrator', hardcodedSchedule: '20,50 * * * *', runner: runOpenclawResponseOrchestrator, label: 'OpenClaw reply generator' },
  { agentName: 'OpenclawFollowUp', hardcodedSchedule: '0 15 * * *', runner: runOpenclawFollowUp, label: 'OpenClaw follow-up (daily 10am CT)' },
  { agentName: 'OpenclawContentResponse', hardcodedSchedule: '10,40 * * * *', runner: runOpenclawContentResponse, label: 'OpenClaw content response' },
  { agentName: 'OpenclawQualityGate', hardcodedSchedule: '12,42 * * * *', runner: runOpenclawQualityGate, label: 'OpenClaw quality gate' },
  { agentName: 'OpenclawBrowserWorker', hardcodedSchedule: '15,45 * * * *', runner: runOpenclawBrowserWorker, label: 'OpenClaw browser worker' },
  { agentName: 'OpenclawLearningOptimization', hardcodedSchedule: '0 */4 * * *', runner: runOpenclawLearningOptimization, label: 'OpenClaw learning optimization' },
  { agentName: 'OpenclawInfrastructureMonitor', hardcodedSchedule: '*/5 * * * *', runner: runOpenclawInfraMonitor, label: 'OpenClaw infra monitor' },
  { agentName: 'OpenclawTechResearch', hardcodedSchedule: '0 6 * * *', runner: runOpenclawTechResearch, label: 'OpenClaw tech research' },
  { agentName: 'OpenclawLinkedInCommentMonitor', hardcodedSchedule: '0 8,12,16 * * 1-5', runner: runOpenclawLinkedInCommentMonitor, label: 'OpenClaw LinkedIn comment monitor' },

  // Skool community engagement agents
  { agentName: 'SkoolSupervisor', hardcodedSchedule: '*/5 * * * *', runner: runSkoolSupervisorAgent, label: 'Skool supervisor' },
  { agentName: 'SkoolSignalDetection', hardcodedSchedule: '3,33 * * * *', runner: runSkoolSignalDetectionAgent, label: 'Skool signal detection' },
  { agentName: 'SkoolContentResponse', hardcodedSchedule: '8,28,48 * * * *', runner: runSkoolContentResponseAgent, label: 'Skool content response' },
  { agentName: 'SkoolQualityGate', hardcodedSchedule: '11,31,51 * * * *', runner: runSkoolQualityGateAgent, label: 'Skool quality gate' },
  { agentName: 'SkoolBrowserWorker', hardcodedSchedule: '14,34,54 * * * *', runner: runSkoolBrowserWorkerAgent, label: 'Skool browser worker' },
  { agentName: 'SkoolNotificationResponse', hardcodedSchedule: '0,30 * * * *', runner: runSkoolNotificationResponseAgent, label: 'Skool notification auto-reply' },

  // Weekly report (Sunday 8 AM CT = 13:00 UTC)
  { agentName: 'WeeklyReport', hardcodedSchedule: '0 13 * * 0', runner: runWeeklyReportAgent, label: 'Weekly report email to Ali' },

  // Company layer agents
  { agentName: 'WorkforceIntelligence', hardcodedSchedule: '0 */6 * * *', runner: runWorkforceIntelligenceAgent, label: 'Workforce intelligence analysis' },
  // Runs 15 minutes after each analysis pass (offset only — the two are independent:
  // analysis creates tickets from current stats, this closes existing tickets from
  // current stats; the offset just avoids simultaneous DB load, not a real ordering
  // dependency). See workforceTicketAutoResolver.ts for the re-check/close logic.
  { agentName: 'WorkforceTicketAutoResolver', hardcodedSchedule: '15 */6 * * *', runner: runWorkforceTicketAutoResolverAgent, label: 'Workforce ticket auto-resolve (re-check + close on recovery)' },
  // RETIRED 2026-08-15 — second of the two CompanyStrategicCycle registrations. See note above.

  // cory-engine ticket auto-resolve. Offset (`:25`) is deliberate spacing from
  // AutonomousEngine's own 10-minute detection cycle and WorkforceTicketAutoResolver's
  // `:15` slot, not a real ordering dependency — same spacing rationale as that entry's
  // own comment. Registered `enabled: false` at seed time in agentRegistrySeed.ts (see
  // that entry's comment and this run's execution-contract.md §3b) — the cron tick will
  // fire on schedule per this entry, but runAgent()'s own `AiAgent.enabled` gate keeps
  // it a no-op until a human flips it on after the reviewed historical bulk-clear.
  { agentName: 'CoryEngineTicketAutoResolver', hardcodedSchedule: '25 */6 * * *', runner: runCoryEngineTicketAutoResolverAgent, label: 'cory-engine ticket auto-resolve (re-check + close on recovery)' },
  { agentName: 'CoryBrainInitiativeTicketAutoResolver', hardcodedSchedule: '40 */6 * * *', runner: runCoryBrainInitiativeTicketAutoResolverAgent, label: 'CoryBrain initiative-linked ticket sync (re-check + close on initiative terminal state)' },
  // InboxCaseEngine source-completion reconciliation. Hourly (`:19`), not `*/6h` like
  // the two entries above — matches the cadence of the existing hourly
  // `InboxCaseAutoSync` cron (schedulerService.ts) it complements, since Basecamp/email
  // state changes continuously, not every 6h. `:19` was chosen by computing actual
  // per-minute collision density across every schedule in this file and
  // schedulerService.ts (both already register a `*/1 * * * *` catch-all, so no minute
  // is free of ALL overlap) rather than by exact-string matching alone — see this run's
  // execution-contract.md for the full comparison. Registered `enabled: false` at seed
  // time in agentRegistrySeed.ts (see that entry's comment and this run's
  // execution-contract.md) — the cron tick will fire on schedule per this entry, but
  // runAgent()'s own `AiAgent.enabled` gate keeps it a no-op until a human flips it on
  // after the reviewed historical bulk-clear.
  { agentName: 'InboxCaseSourceCompletionResolver', hardcodedSchedule: '19 * * * *', runner: runInboxCaseSourceCompletionResolverAgent, label: 'InboxCaseEngine source-completion reconciliation (Basecamp to-do completion signal + general closure-guard sweep)' },

  // Department Strategy Architects (every 6 hours, staggered)
  { agentName: 'ExecutiveStrategyArchitect', hardcodedSchedule: '0 */6 * * *', runner: runExecutiveStrategyArchitect, label: 'Executive strategy architect' },
  { agentName: 'GovernanceStrategyArchitect', hardcodedSchedule: '2 */6 * * *', runner: runGovernanceStrategyArchitect, label: 'Governance strategy architect' },
  { agentName: 'StrategyFuturesArchitect', hardcodedSchedule: '4 */6 * * *', runner: runStrategyFuturesArchitect, label: 'Strategy futures architect' },
  { agentName: 'FinanceIntelligenceArchitect', hardcodedSchedule: '6 */6 * * *', runner: runFinanceIntelligenceArchitect, label: 'Finance intelligence architect' },
  { agentName: 'OperationsOptimizationArchitect', hardcodedSchedule: '8 */6 * * *', runner: runOperationsOptimizationArchitect, label: 'Operations optimization architect' },
  { agentName: 'OrchestrationEcosystemArchitect', hardcodedSchedule: '10 */6 * * *', runner: runOrchestrationEcosystemArchitect, label: 'Orchestration ecosystem architect' },
  { agentName: 'InsightArchitect', hardcodedSchedule: '12 */6 * * *', runner: runInsightArchitect, label: 'Insight architect' },
  { agentName: 'PartnershipExpansionArchitect', hardcodedSchedule: '14 */6 * * *', runner: runPartnershipExpansionArchitect, label: 'Partnership expansion architect' },
  { agentName: 'GrowthExperimentArchitect', hardcodedSchedule: '16 */6 * * *', runner: runGrowthExperimentArchitect, label: 'Growth experiment architect' },
  { agentName: 'MarketingAutomationArchitect', hardcodedSchedule: '18 */6 * * *', runner: runMarketingAutomationArchitect, label: 'Marketing automation architect' },
  { agentName: 'AdmissionsConversionArchitect', hardcodedSchedule: '20 */6 * * *', runner: runAdmissionsConversionArchitect, label: 'Admissions conversion architect' },
  { agentName: 'InfrastructureEvolutionArchitect', hardcodedSchedule: '22 */6 * * *', runner: runInfrastructureEvolutionArchitect, label: 'Infrastructure evolution architect' },
  { agentName: 'PlatformInnovationArchitect', hardcodedSchedule: '24 */6 * * *', runner: runPlatformInnovationArchitect, label: 'Platform innovation architect' },
  { agentName: 'LearningInnovationArchitect', hardcodedSchedule: '26 */6 * * *', runner: runLearningInnovationArchitect, label: 'Learning innovation architect' },
  { agentName: 'StudentSuccessArchitect', hardcodedSchedule: '28 */6 * * *', runner: runStudentSuccessArchitect, label: 'Student success architect' },
  { agentName: 'AlumniNetworkArchitect', hardcodedSchedule: '30 */6 * * *', runner: runAlumniNetworkArchitect, label: 'Alumni network architect' },

  // Security Operations
  { agentName: 'SecurityDirectorAgent', hardcodedSchedule: '*/10 * * * *', runner: runSecurityDirector, label: 'Security director' },
  { agentName: 'SecretDetectionAgent', hardcodedSchedule: '0 */4 * * *', runner: runSecretDetection, label: 'Secret detection' },
  { agentName: 'CodeSecurityAuditAgent', hardcodedSchedule: '0 3 * * *', runner: runCodeSecurityAudit, label: 'Code security audit' },
  { agentName: 'DependencySecurityAgent', hardcodedSchedule: '0 4 * * *', runner: runDependencySecurity, label: 'Dependency security' },
  { agentName: 'RuntimeThreatMonitorAgent', hardcodedSchedule: '*/5 * * * *', runner: runRuntimeThreatMonitor, label: 'Runtime threat monitor' },
  { agentName: 'AccessControlGuardianAgent', hardcodedSchedule: '0 5 * * *', runner: runAccessControlGuardian, label: 'Access control guardian' },
  { agentName: 'AISafetyMonitorAgent', hardcodedSchedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *', runner: runAiSafetyMonitor, label: 'AI safety monitor' },
  { agentName: 'AgentBehaviorMonitorAgent', hardcodedSchedule: '5,15,25,35,45,55 * * * *', runner: runAgentBehaviorMonitor, label: 'Agent behavior monitor' },

  // Admissions knowledge
  { agentName: 'AdmissionsKnowledgeSyncAgent', hardcodedSchedule: '0 3 * * *', runner: runAdmissionsKnowledgeSync, label: 'Admissions knowledge sync' },

  // Offer routing
  { agentName: 'OfferRoutingAgent', hardcodedSchedule: '30 */6 * * *', runner: runOfferRouting, label: 'Offer routing and classification' },

  // Governance cleanup
  { agentName: 'ProposalCleanupService', hardcodedSchedule: '0 2 * * *', runner: async () => { await expireStaleProposals(); return null as any; }, label: 'Proposal expiration cleanup' },

  // Department super agents (staggered every 30 min)
  { agentName: 'CampaignOpsSuperAgent', hardcodedSchedule: '3,33 * * * *', runner: runCampaignOpsSuperAgent, label: 'Campaign Ops super agent' },
  { agentName: 'LeadIntelligenceSuperAgent', hardcodedSchedule: '5,35 * * * *', runner: runLeadIntelligenceSuperAgent, label: 'Lead Intelligence super agent' },
  { agentName: 'ContentEngineSuperAgent', hardcodedSchedule: '7,37 * * * *', runner: runContentEngineSuperAgent, label: 'Content Engine super agent' },
  { agentName: 'AnalyticsEngineSuperAgent', hardcodedSchedule: '9,39 * * * *', runner: runAnalyticsEngineSuperAgent, label: 'Analytics Engine super agent' },
  { agentName: 'SystemResilienceSuperAgent', hardcodedSchedule: '11,41 * * * *', runner: runSystemResilienceSuperAgent, label: 'System Resilience super agent' },
  { agentName: 'AdmissionsSuperAgent', hardcodedSchedule: '13,43 * * * *', runner: runAdmissionsSuperAgent, label: 'Admissions super agent' },
  { agentName: 'PartnershipSuperAgent', hardcodedSchedule: '15,45 * * * *', runner: runPartnershipSuperAgent, label: 'Partnership super agent' },
  { agentName: 'FinanceSuperAgent', hardcodedSchedule: '17,47 * * * *', runner: runFinanceSuperAgent, label: 'Finance super agent' },

  // Cory self-evolution cycle (every 6 hours, offset from strategic cycle)
  { agentName: 'CoryEvolutionCycle', hardcodedSchedule: '20 */6 * * *', runner: () => trackAgentRun('CoryEvolutionCycle', runSelfEvolution), label: 'Cory self-evolution cycle' },

  // AI Workforce directors (orgRegistry.ts) — one tool + one action each. All
  // seed disabled (agentRegistrySeed.ts); each runner is a no-op via the
  // workforceAgentRuntime gate until turned on. Marketing is deliberately NOT
  // here — it is manual-trigger only, invoked from the admin dashboard.
  { agentName: 'WorkforceStudentSuccessDirector', hardcodedSchedule: '0 6 * * *', runner: async () => { const { runStudentSuccessDirector } = await import('./workforce/directorActions'); return runStudentSuccessDirector(); }, label: 'AI Workforce: Student Success director' },
  { agentName: 'WorkforceCurriculumDirector', hardcodedSchedule: '10 6 * * *', runner: async () => { const { runCurriculumDirector } = await import('./workforce/directorActions'); return runCurriculumDirector(); }, label: 'AI Workforce: Curriculum director' },
  { agentName: 'WorkforceCareerDirector', hardcodedSchedule: '20 6 * * *', runner: async () => { const { runCareerDirector } = await import('./workforce/directorActions'); return runCareerDirector(); }, label: 'AI Workforce: Career director' },
  { agentName: 'WorkforceCertificationDirector', hardcodedSchedule: '30 6 * * *', runner: async () => { const { runCertificationDirector } = await import('./workforce/directorActions'); return runCertificationDirector(); }, label: 'AI Workforce: Certification director' },
  { agentName: 'WorkforceFinanceDirector', hardcodedSchedule: '40 6 * * *', runner: async () => { const { runFinanceDirector } = await import('./workforce/directorActions'); return runFinanceDirector(); }, label: 'AI Workforce: Finance director' },
  { agentName: 'WorkforceOperationsDirector', hardcodedSchedule: '*/15 * * * *', runner: async () => { const { runOperationsDirector } = await import('./workforce/directorActions'); return runOperationsDirector(); }, label: 'AI Workforce: Operations director' },
  { agentName: 'WorkforceCommunityDirector', hardcodedSchedule: '50 6 * * *', runner: async () => { const { runCommunityDirector } = await import('./workforce/directorActions'); return runCommunityDirector(); }, label: 'AI Workforce: Community director' },
  { agentName: 'WorkforceTechnologyDirector', hardcodedSchedule: '7,22,37,52 * * * *', runner: async () => { const { runTechnologyDirector } = await import('./workforce/directorActions'); return runTechnologyDirector(); }, label: 'AI Workforce: Technology director' },
  { agentName: 'WorkforceResearchDirector', hardcodedSchedule: '0 7 * * 0', runner: async () => { const { runResearchDirector } = await import('./workforce/directorActions'); return runResearchDirector(); }, label: 'AI Workforce: Research director (weekly)' },
];

// Executive briefings use dynamic imports, registered separately.
// BC #10099862873 P1 item 1: dynamicImport is now async (returns a Promise
// instead of firing an internal .then()/.catch()) so the registration loop
// below can wrap each call in instrumentCronJob() — none of these self-track
// against the AiAgent registry the way the SCHEDULE_REGISTRY runners above do.
interface DynamicScheduleEntry {
  agentName: string;
  hardcodedSchedule: string;
  dynamicImport: () => Promise<void>;
  label: string;
}

const DYNAMIC_SCHEDULE_REGISTRY: DynamicScheduleEntry[] = [
  {
    agentName: 'DailyExecutiveBriefing',
    hardcodedSchedule: '45 6 * * *',
    dynamicImport: async () => {
      const { generateDailyBriefing } = await import('./executiveBriefingService');
      await generateDailyBriefing();
    },
    label: 'Executive daily briefing',
  },
  {
    agentName: 'WeeklyStrategicBriefing',
    hardcodedSchedule: '45 6 * * 1',
    dynamicImport: async () => {
      const { generateWeeklyStrategicBriefing } = await import('./executiveBriefingService');
      await generateWeeklyStrategicBriefing();
    },
    label: 'Executive weekly briefing',
  },
  // REMOVED 2026-06-05 (CC-20260603-v7da, Ali approved): this morning
  // digest fires at 45 6 * * * — the same minute as DailyExecutiveBriefing
  // above. Ali was getting two copies of the morning brief. Keeping the
  // evening digest (different schedule) and DailyExecutiveBriefing.
  // To restore, re-add the entry below the WeeklyStrategicBriefing block.
  {
    agentName: 'ExecutiveAwarenessEveningDigest',
    hardcodedSchedule: '0 18 * * *',
    dynamicImport: async () => {
      const { generateExecutiveDigest } = await import('./executiveBriefingService');
      await generateExecutiveDigest('evening');
    },
    label: 'Executive awareness evening digest',
  },
  {
    agentName: 'StrategicMetricCapture',
    hardcodedSchedule: '*/15 * * * *',
    dynamicImport: async () => {
      const { captureStrategicSnapshot } = await import('./strategic-intelligence/strategicStateStore');
      await captureStrategicSnapshot();
    },
    label: 'Strategic metric capture (15min)',
  },
  {
    agentName: 'StrategicTrendAnalysis',
    hardcodedSchedule: '5,35 * * * *',
    dynamicImport: async () => {
      const { detectAndEmitAnomalies } = await import('./strategic-intelligence/anomalyDetectionEngine');
      await detectAndEmitAnomalies();
    },
    label: 'Strategic trend + anomaly analysis',
  },
  {
    agentName: 'StrategicRecommendationCycle',
    hardcodedSchedule: '10,40 * * * *',
    dynamicImport: async () => {
      const [
        { getStrategicMetrics },
        { analyzeStrategicTrends },
        { detectAnomalies },
        { generateInferences },
        { generateRecommendations, persistRecommendations },
      ] = await Promise.all([
        import('./strategic-intelligence/metricCollector'),
        import('./strategic-intelligence/trendAnalyzer'),
        import('./strategic-intelligence/anomalyDetectionEngine'),
        import('./strategic-intelligence/strategicInferenceEngine'),
        import('./strategic-intelligence/recommendationEngine'),
      ]);
      const [metrics, trends, anomalies] = await Promise.all([
        getStrategicMetrics(),
        analyzeStrategicTrends(),
        detectAnomalies(),
      ]);
      const inferences = await generateInferences(trends, anomalies, metrics);
      const recommendations = await generateRecommendations(inferences, metrics);
      await persistRecommendations(recommendations);
    },
    label: 'Strategic inference + recommendation cycle',
  },
  {
    agentName: 'CampaignTrafficEnforcement',
    hardcodedSchedule: '0 */2 * * *',
    dynamicImport: async () => {
      const { flagUnregisteredTraffic } = await import('./campaignLinkService');
      await flagUnregisteredTraffic();
    },
    label: 'Campaign traffic enforcement',
  },
  {
    agentName: 'IntelligenceRetentionCycle',
    hardcodedSchedule: '15 3 * * *',
    dynamicImport: async () => {
      const { runRetentionCycle } = await import('./cory/intelligenceRetention');
      await runRetentionCycle();
    },
    label: 'Intelligence data retention (daily 03:15)',
  },
];

/** Create + register the cron task for a standard registry entry. */
function startStandardTask(entry: ScheduleEntry, schedule: string): void {
  const task = cron.schedule(schedule, () => {
    const execute = UNINSTRUMENTED_AGENTS.has(entry.agentName)
      ? () => instrumentCronJob(entry.agentName, async () => { await entry.runner(); })
      : () => entry.runner();
    wrapWithDeadLetter(entry.agentName, entry.label, execute).catch((err) => {
      // wrapWithDeadLetter itself never throws (it swallows both the job's error and
      // its own DLQ-write error) — this catch exists only as a last-resort guard.
      console.error(`[AI Ops] ${entry.label} cron error (dead-letter wrapper itself threw):`, err);
    });
  }, { timezone: 'America/Chicago' });

  trackTask(entry.agentName, task, schedule);
}

/** Create + register the cron task for a dynamic-import registry entry. */
function startDynamicTask(entry: DynamicScheduleEntry, schedule: string): void {
  const task = cron.schedule(schedule, () => {
    instrumentCronJob(entry.agentName, entry.dynamicImport).catch((err) => {
      console.error(`[AI Ops] ${entry.label} cron error:`, err);
    });
  }, { timezone: 'America/Chicago' });

  trackTask(entry.agentName, task, schedule);
}

/** Append a task to an agent's task list (never replace — see activeTasks note). */
function trackTask(agentName: string, task: ScheduledTask, schedule: string): void {
  const existing = activeTasks.get(agentName);
  if (existing) existing.push({ task, schedule });
  else activeTasks.set(agentName, [{ task, schedule }]);
}

/** Stop and forget EVERY task for an agent. Safe to call for an agent that isn't running. */
async function stopTasks(agentName: string): Promise<boolean> {
  const running = activeTasks.get(agentName);
  if (!running || running.length === 0) return false;
  for (const { task } of running) {
    try {
      await task.stop();
      await task.destroy();
    } catch (err: any) {
      // A task that fails to stop cleanly must not wedge the reload for every
      // other agent — drop our reference either way and keep going.
      console.error(`[AI Ops] Failed to stop task ${agentName}: ${err.message}`);
    }
  }
  activeTasks.delete(agentName);
  return true;
}

/**
 * Re-read cron_schedule_configs and reconcile the running tasks against it.
 *
 * This is what makes the Governance Command Center's enable/disable and
 * schedule edits take effect immediately instead of at the next deploy.
 * Idempotent: reloading with no config change is a no-op that reports
 * everything as unchanged.
 */
export async function reloadAIOpsSchedules(): Promise<ScheduleReloadResult> {
  const result: ScheduleReloadResult = { started: [], stopped: [], rescheduled: [], unchanged: 0 };

  // If the DB read fails, change NOTHING. Reconciling against an empty map
  // would fall back to hardcoded defaults and silently re-enable jobs an
  // operator had deliberately switched off.
  const dbSchedules = await resolveAllCronSchedules();

  // Group by agent_name FIRST. A duplicated agent_name (see the activeTasks
  // note) must be reconciled as one unit — reconciling each entry separately
  // made the two CompanyStrategicCycle registrations stop and restart each
  // other on every reload, flapping its schedule back and forth forever.
  interface Reconcilable {
    label: string;
    hardcodedSchedule: string;
    start: (schedule: string) => void;
  }
  const byAgent = new Map<string, Reconcilable[]>();
  const add = (agentName: string, item: Reconcilable) => {
    const list = byAgent.get(agentName);
    if (list) list.push(item);
    else byAgent.set(agentName, [item]);
  };

  for (const entry of SCHEDULE_REGISTRY) {
    add(entry.agentName, {
      label: entry.label,
      hardcodedSchedule: entry.hardcodedSchedule,
      start: (s) => startStandardTask(entry, s),
    });
  }
  for (const entry of DYNAMIC_SCHEDULE_REGISTRY) {
    add(entry.agentName, {
      label: entry.label,
      hardcodedSchedule: entry.hardcodedSchedule,
      start: (s) => startDynamicTask(entry, s),
    });
  }

  for (const [agentName, entries] of byAgent) {
    const dbEntry = dbSchedules.get(agentName);
    const enabled = dbEntry?.enabled ?? true;
    // One governance row can cover several registrations; the DB schedule
    // overrides all of them, otherwise each keeps its own hardcoded default.
    const desired = entries.map((e) => dbEntry?.schedule || e.hardcodedSchedule);
    const running = activeTasks.get(agentName) || [];
    const label = entries.map((e) => e.label).join(' + ');

    if (!enabled) {
      if (running.length > 0) {
        await stopTasks(agentName);
        result.stopped.push(agentName);
        console.log(`[AI Ops] Reload: STOPPED ${label} (disabled in governance DB)`);
      } else {
        result.unchanged++;
      }
      continue;
    }

    if (running.length === 0) {
      entries.forEach((e, i) => e.start(desired[i]));
      result.started.push(agentName);
      console.log(`[AI Ops] Reload: STARTED ${label}: ${desired.join(', ')}`);
      continue;
    }

    const runningSchedules = running.map((r) => r.schedule).join('|');
    if (runningSchedules !== desired.join('|')) {
      await stopTasks(agentName);
      entries.forEach((e, i) => e.start(desired[i]));
      result.rescheduled.push(agentName);
      console.log(`[AI Ops] Reload: RESCHEDULED ${label}: ${runningSchedules} -> ${desired.join('|')}`);
      continue;
    }

    result.unchanged++;
  }

  return result;
}

/**
 * Start all AI Operations cron jobs.
 * Reads schedules from governance DB (cron_schedule_configs table).
 * Falls back to hardcoded schedules if DB is unavailable.
 * Called from schedulerService.startScheduler() to keep scheduling isolated.
 */
export async function startAIOpsScheduler(): Promise<void> {
  // Seed 18 departments on startup (idempotent)
  seedDepartments().catch((err) => {
    console.error('[AI Ops] Failed to seed departments:', err.message);
  });

  // Seed full agent registry on startup (idempotent — 176 agents)
  seedAgentRegistry().catch((err) => {
    console.error('[AI Ops] Failed to seed agent registry:', err.message);
  });

  // Seed admissions knowledge base on startup (idempotent)
  seedAdmissionsKnowledge().catch((err) => {
    console.error('[AI Ops] Failed to seed admissions knowledge:', err.message);
  });

  // Seed ops alert channel routing on startup (idempotent, BC #10099862873 P0)
  import('./opsAlertSubscriptionSeed').then(({ seedOpsAlertSubscriptions }) => {
    seedOpsAlertSubscriptions().catch((err) => {
      console.error('[AI Ops] Failed to seed ops alert subscriptions:', err.message);
    });
  });

  // Seed AI Company layer (idempotent, behind feature flag)
  import('./company/companySeedService').then(({ seedDefaultCompany }) => {
    seedDefaultCompany().catch((err) => {
      console.error('[AI Ops] Failed to seed company layer:', err.message);
    });
  }).catch(() => {});

  // Seed executive notification policy on startup (idempotent)
  import('./executiveAwarenessSeed').then(({ seedExecutiveNotificationPolicy }) => {
    seedExecutiveNotificationPolicy().catch((err) => {
      console.error('[AI Ops] Failed to seed executive notification policy:', err.message);
    });
  });

  // Load all cron schedules from governance DB
  let dbSchedules = new Map<string, ResolvedCronSchedule>();
  try {
    dbSchedules = await resolveAllCronSchedules();
    if (dbSchedules.size > 0) {
      console.log(`[AI Ops] Loaded ${dbSchedules.size} cron schedules from governance DB`);
    }
  } catch (err: any) {
    console.warn('[AI Ops] Failed to load cron schedules from DB, using hardcoded defaults:', err.message);
  }

  let scheduledCount = 0;
  let skippedCount = 0;

  // Schedule standard agents
  for (const entry of SCHEDULE_REGISTRY) {
    const dbEntry = dbSchedules.get(entry.agentName);
    const schedule = dbEntry?.schedule || entry.hardcodedSchedule;
    const enabled = dbEntry?.enabled ?? true;
    const source = dbEntry ? 'DB' : 'hardcoded';

    if (!enabled) {
      console.log(`[AI Ops]   SKIP ${entry.label} (disabled in governance DB)`);
      skippedCount++;
      continue;
    }

    startStandardTask(entry, schedule);

    console.log(`[AI Ops]   ${entry.label}: ${schedule} [${source}]`);
    scheduledCount++;
  }

  // Schedule dynamic-import agents (executive briefings)
  for (const entry of DYNAMIC_SCHEDULE_REGISTRY) {
    const dbEntry = dbSchedules.get(entry.agentName);
    const schedule = dbEntry?.schedule || entry.hardcodedSchedule;
    const enabled = dbEntry?.enabled ?? true;
    const source = dbEntry ? 'DB' : 'hardcoded';

    if (!enabled) {
      console.log(`[AI Ops]   SKIP ${entry.label} (disabled in governance DB)`);
      skippedCount++;
      continue;
    }

    startDynamicTask(entry, schedule);

    console.log(`[AI Ops]   ${entry.label}: ${schedule} [${source}]`);
    scheduledCount++;
  }

  // System auto-response — runs every minute
  cron.schedule('* * * * *', async () => {
    try {
      const { evaluateAndRespond } = await import('./systemAutoResponseService');
      await evaluateAndRespond();
    } catch (err: any) {
      console.error('[AI Ops] Auto-response error:', err.message);
    }
  }, { timezone: 'America/Chicago' });
  console.log('[AI Ops]   System Auto-Response: * * * * * [hardcoded]');
  scheduledCount++;

  console.log(`[AI Ops] Scheduler started: ${scheduledCount} agents scheduled, ${skippedCount} disabled`);
}
