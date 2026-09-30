/**
 * agentRegistryAuditClassification — the enumerated result of the 2026-07-31 ai_agents
 * registry audit. Pure data + a lookup function, shared by the annotation script
 * (backend/src/scripts/auditAgentRegistryStatus.ts) and the dashboard read path
 * (trustMetricsService.getRegistryHealth) so both always agree on the same buckets.
 *
 * Deliberately NOT auto-discovered at runtime (e.g. by re-running the file-existence/
 * grep sweep against the live filesystem) — the classification is the audit's finding,
 * a point-in-time judgment call about code that's been read, not a live computation.
 * Re-running the underlying investigation is how this list gets updated, not code.
 */

export type RegistryAuditStatus = 'confirmed_dead' | 'internal_pipeline_step';

export interface RegistryAuditEntry {
  status: RegistryAuditStatus;
  note: string;
  parentAgent?: string; // only for internal_pipeline_step
  disable: boolean; // true only for confirmed_dead
}

// 22 agents with no source file at all (registry row exists, code was never written).
const NO_SOURCE_FILE = [
  'Enterprise_Opportunity_Agent', 'Analytics_Agent', 'Data_Intelligence_Agent',
  'Alumni_Outreach_Agent', 'Alumni_Reengagement_Agent', 'Alumni_Referral_Agent',
  'Opportunity_Detection_Agent', 'Trend_Detection_Agent', 'Organization_Health_Agent',
  'Approval_Agent', 'Policy_Agent', 'Risk_Agent', 'Deployment_Agent',
  'Performance_Monitoring_Agent', 'Content_Marketing_Agent', 'Corporate_Training_Agent',
  'Employer_Relationship_Agent', 'Enterprise_Partnership_Agent',
  'Human_Learning_Strategy_Agent', 'Product_Strategy_Agent', 'Program_Evolution_Agent',
  'UX_Optimization_Agent',
];

// 17 Reporting agents: source exists, referenced ONLY by the seed file that registers
// them — no cron entry, no route, no caller anywhere else in the codebase.
const REPORTING_UNWIRED = [
  'AdmissionsReportingAgent', 'AgentPerformanceAnalyticsAgent', 'AlumniReportingAgent',
  'EducationReportingAgent', 'ExecutiveBriefingReportingAgent',
  'ExperimentRecommendationAgent', 'InsightDiscoveryAgent', 'KnowledgeGraphBuilderAgent',
  'MarketingReportingAgent', 'NarrativeAgent', 'PartnershipsReportingAgent',
  'PlatformReportingAgent', 'ReportingIntelligenceAgent', 'RevenueOpportunityAgent',
  'StudentSuccessReportingAgent', 'TrendAnalysisAgent', 'VisualizationAgent',
];

// 7 Website Intelligence agents: same unwired pattern as Reporting.
const WEBSITE_INTELLIGENCE_UNWIRED = [
  'WebsiteAutoRepairAgent', 'WebsiteBehaviorAgent', 'WebsiteBrokenLinkAgent',
  'WebsiteConversionFlowAgent', 'WebsiteImprovementStrategist',
  'WebsiteUIVisibilityAgent', 'WebsiteUXHeuristicAgent',
];

// 11 Admissions on-demand agents: exported wrapper functions in aiOrchestrator.ts, but
// the ONLY caller of each (outside its own definition) is aiOrchestrator-Ali-AI.ts, the
// known unconsolidated duplicate file — never a route, never chatService.ts, never any
// live application code. Confirmed via git grep per function name (2026-07-31 audit).
const ADMISSIONS_ON_DEMAND_UNWIRED = [
  'AdmissionsCEORecognitionAgent', 'AdmissionsConversationPlanningAgent',
  'AdmissionsKnowledgeAgent', 'AdmissionsPageContextAgent',
  'AdmissionsVisitorIdentityAgent', 'AdmissionsAppointmentSchedulingAgent',
  'AdmissionsCallGovernanceAgent', 'AdmissionsDocumentDeliveryAgent',
  'AdmissionsEmailAgent', 'AdmissionsSMSAgent', 'AdmissionsSynthflowCallAgent',
];

// Meta sub-agents: called internally by runMetaAgentLoop's 4 steps (aggregatePerformanceMetrics/
// analyzeArchitecture/analyzePromptQuality/runExperimentCycle) — proven alive (515 real
// intelligence_memory rows) but never independently scheduled, so they will always show
// run_count=0 on their own row. MetaAgentLoop itself is wired in T002.
const META_PIPELINE_STEPS: Array<[string, string]> = [
  ['ArchitectureAgent', 'analyzeArchitecture() step'],
  ['ExperimentAgent', 'runExperimentCycle() step'],
  ['PerformanceAgent', 'aggregatePerformanceMetrics() step'],
  ['PromptOptimizationAgent', 'analyzePromptQuality() step'],
];

// Autonomous sub-agents: the problem->root cause->plan->execute->monitor->audit pipeline
// invoked internally by runAutonomousCycle (wired in T002). Same "alive as a sub-step,
// invisible independently" pattern as the Meta cluster.
const AUTONOMOUS_PIPELINE_STEPS = [
  'ActionPlannerAgent', 'AuditAgent', 'ExecutionAgent', 'ImpactEstimatorAgent',
  'MonitorAgent', 'ProblemDiscoveryAgent', 'RiskEvaluatorAgent', 'RootCauseAgent',
];

// Memory/Learning cluster: imported and called by the scheduled agents above
// (autonomousEngine.ts, aiCOO.ts, metaAgentLoop.ts) as shared infrastructure, not as
// independently-scheduled agents in their own right.
const MEMORY_PIPELINE_STEPS = ['KnowledgeGraphAgent', 'LearningAgent', 'MemoryAgent'];

// Strategic cluster: called internally by the Cory/AI-COO strategic cycle
// (runCoryStrategicCycle, wired in T002 as AICOOStrategicCycle).
const STRATEGIC_PIPELINE_STEPS = [
  'CostOptimizationAgent', 'GovernanceAgent', 'GrowthExperimentAgent',
  'RevenueOptimizationAgent', 'StrategicIntelligenceAgent',
];

const CONFIRMED_DEAD = new Map<string, RegistryAuditEntry>();
for (const name of NO_SOURCE_FILE) {
  CONFIRMED_DEAD.set(name, {
    status: 'confirmed_dead',
    note: 'Registry row exists; no source file was ever written at the path it references.',
    disable: true,
  });
}
for (const name of REPORTING_UNWIRED) {
  CONFIRMED_DEAD.set(name, {
    status: 'confirmed_dead',
    note: 'Source exists but is referenced only by the agent-registry seed file — no cron entry, route, or caller anywhere else in the codebase.',
    disable: true,
  });
}
for (const name of WEBSITE_INTELLIGENCE_UNWIRED) {
  CONFIRMED_DEAD.set(name, {
    status: 'confirmed_dead',
    note: 'Source exists but is referenced only by the agent-registry seed file — no cron entry, route, or caller anywhere else in the codebase.',
    disable: true,
  });
}
for (const name of ADMISSIONS_ON_DEMAND_UNWIRED) {
  CONFIRMED_DEAD.set(name, {
    status: 'confirmed_dead',
    note: 'Exported runner exists in aiOrchestrator.ts, but its only caller outside its own definition is aiOrchestrator-Ali-AI.ts (the unconsolidated duplicate file) — never a route or live application code path.',
    disable: true,
  });
}

const PIPELINE_STEPS = new Map<string, RegistryAuditEntry>();
for (const [name, note] of META_PIPELINE_STEPS) {
  PIPELINE_STEPS.set(name, { status: 'internal_pipeline_step', note, parentAgent: 'MetaAgentLoop', disable: false });
}
for (const name of AUTONOMOUS_PIPELINE_STEPS) {
  PIPELINE_STEPS.set(name, {
    status: 'internal_pipeline_step',
    note: 'Internal step of the AutonomousEngine problem-discovery pipeline; not independently scheduled.',
    parentAgent: 'AutonomousEngine',
    disable: false,
  });
}
for (const name of MEMORY_PIPELINE_STEPS) {
  PIPELINE_STEPS.set(name, {
    status: 'internal_pipeline_step',
    note: 'Shared memory/learning infrastructure called by AutonomousEngine, AICOOStrategicCycle, and MetaAgentLoop; not independently scheduled.',
    parentAgent: 'AutonomousEngine',
    disable: false,
  });
}
for (const name of STRATEGIC_PIPELINE_STEPS) {
  PIPELINE_STEPS.set(name, {
    status: 'internal_pipeline_step',
    note: 'Internal step of the Cory/AI-COO strategic cycle; not independently scheduled.',
    parentAgent: 'AICOOStrategicCycle',
    disable: false,
  });
}

/** Looks up the 2026-07-31 audit's classification for one agent. Returns null for any
 *  agent this audit did not enumerate (e.g. genuinely live agents, or ones not yet
 *  investigated — see trustMetricsService.getRegistryHealth's 'unclassified' bucket). */
export function classifyAgent(agentName: string): RegistryAuditEntry | null {
  return CONFIRMED_DEAD.get(agentName) ?? PIPELINE_STEPS.get(agentName) ?? null;
}

export function allClassifiedAgentNames(): string[] {
  return [...CONFIRMED_DEAD.keys(), ...PIPELINE_STEPS.keys()];
}

export const REGISTRY_AUDIT_DATE = '2026-07-31';
