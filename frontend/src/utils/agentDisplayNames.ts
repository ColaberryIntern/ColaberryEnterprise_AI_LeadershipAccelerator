// ─── Agent Display Names ─────────────────────────────────────────────────────
// Maps raw PascalCase agent_name values to business-friendly labels for the CEO.

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  // Scheduling & Operations
  ScheduledActionsProcessor: 'Scheduled Actions',
  NoShowDetector: 'No-Show Detection',
  SessionReminders: 'Session Reminders',
  SessionLifecycle: 'Session Lifecycle',
  EmailDigest: 'Email Digest',

  // Behavioral Intelligence
  ICPInsightComputer: 'ICP Insights',
  BehavioralSignalDetector: 'Behavioral Signals',
  IntentScoreRecomputer: 'Intent Scoring',
  BehavioralTriggerEvaluator: 'Behavioral Triggers',
  OpportunityScoreRecomputer: 'Opportunity Scoring',

  // Maintenance
  PageEventCleanup: 'Page Event Cleanup',
  ChatMessageCleanup: 'Chat Cleanup',

  // Campaign Management
  CampaignHealthScanner: 'Campaign Health',
  CampaignRepairAgent: 'Campaign Repair',
  CampaignQAAgent: 'Campaign QA',
  CampaignSelfHealingAgent: 'Campaign Self-Healing',
  CampaignEvolutionEngine: 'Campaign Evolution',
  CampaignSchedulerAgent: 'Campaign Scheduler',

  // Content & Optimization
  ContentOptimizationAgent: 'Content Optimization',
  ConversationOptimizationAgent: 'Conversation Optimization',

  // Orchestration
  OrchestrationHealthAgent: 'Orchestration Health',
  OrchestrationAutoRepairAgent: 'Orchestration Repair',

  // Student & Education
  StudentProgressMonitor: 'Student Progress',

  // Monitoring & Compliance
  PromptMonitorAgent: 'Prompt Monitor',
  AutonomousRampEvaluator: 'Autonomous Ramp Evaluator',

  // Lead Intelligence
  ApolloLeadIntelligenceAgent: 'Lead Intelligence',
  LeadScoringAgent: 'Lead Scoring',

  // Autonomy Pipeline
  ProblemDiscoveryAgent: 'Problem Detection',
  RootCauseAgent: 'Root Cause Analysis',
  ActionPlannerAgent: 'Action Planning',
  ImpactEstimatorAgent: 'Impact Estimation',
  RiskEvaluatorAgent: 'Risk Evaluation',
  ExecutionAgent: 'Execution',
  MonitorAgent: 'Monitoring',
  AuditAgent: 'Audit & Compliance',

  // Strategic Intelligence
  StrategicIntelligenceAgent: 'Strategic Intelligence',
  RevenueOptimizationAgent: 'Revenue Optimization',
  CostOptimizationAgent: 'Cost Optimization',
  GrowthExperimentAgent: 'Growth Experiments',
  GovernanceAgent: 'Governance & Compliance',

  // Memory & Learning
  MemoryAgent: 'Memory Management',
  KnowledgeGraphAgent: 'Knowledge Graph',
  LearningAgent: 'Learning Engine',

  // System Performance
  PerformanceAgent: 'Performance Monitoring',
  ArchitectureAgent: 'Architecture Analysis',
  PromptOptimizationAgent: 'Prompt Optimization',
  ExperimentAgent: 'Experiment Runner',

  // Website Intelligence
  WebsiteUIVisibilityAgent: 'Website UI Visibility',
  WebsiteBrokenLinkAgent: 'Broken Link Detection',
  WebsiteConversionFlowAgent: 'Conversion Flow Analysis',
  WebsiteUXHeuristicAgent: 'UX Heuristics',
  WebsiteBehaviorAgent: 'Website Behavior',
  WebsiteAutoRepairAgent: 'Website Auto-Repair',
  WebsiteImprovementStrategist: 'Website Improvement',

  // Admissions / Maya
  AdmissionsVisitorIdentityAgent: 'Visitor Identity',
  AdmissionsVisitorActivityAgent: 'Visitor Activity',
  AdmissionsConversationMemoryAgent: 'Conversation Memory',
  AdmissionsIntentDetectionAgent: 'Intent Detection',
  AdmissionsConversationPlanningAgent: 'Conversation Planning',
  AdmissionsKnowledgeAgent: 'Knowledge Base',
  AdmissionsProactiveOutreachAgent: 'Proactive Outreach',
  AdmissionsPageContextAgent: 'Page Context',
  AdmissionsConversationContinuityAgent: 'Conversation Continuity',
  AdmissionsHighIntentLeadAgent: 'High-Intent Lead Capture',
  AdmissionsCEORecognitionAgent: 'CEO Recognition',
  AdmissionsInsightsAgent: 'Admissions Insights',
  AdmissionsExecutiveUpdateAgent: 'Executive Updates',
  AdmissionsDocumentDeliveryAgent: 'Document Delivery',
  AdmissionsEmailAgent: 'Admissions Email',
  AdmissionsSMSAgent: 'Admissions SMS',
  AdmissionsAppointmentSchedulingAgent: 'Appointment Scheduling',
  AdmissionsSynthflowCallAgent: 'Voice Call',

  // Engines (not agent_name but sometimes shown)
  AnomalyDetectionEngine: 'Anomaly Detection',
  AutonomousEngine: 'Autonomous Operations',
};

/**
 * Convert a raw agent_name (PascalCase) to a business-friendly display label.
 * Falls back to splitting PascalCase into words if no mapping exists.
 */
export function getAgentDisplayName(agentName: string): string {
  if (!agentName || agentName === 'Unknown') return 'System';
  if (AGENT_DISPLAY_NAMES[agentName]) return AGENT_DISPLAY_NAMES[agentName];
  // Fallback: strip Agent/Engine suffix, split PascalCase
  return agentName
    .replace(/Agent$|Engine$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}
