/**
 * Process Discovery Engine
 * Maps real backend services, agents, routes, and models into business process categories.
 * Evidence-based — every capability is linked to an actual file/component.
 */
import AiAgent from '../models/AiAgent';

export interface DiscoveredCapability {
  name: string;
  type: 'service' | 'agent' | 'route' | 'model' | 'scheduler' | 'analytics';
  file_path: string;
  status: 'active';
}

export interface DiscoveredProcess {
  slug: string;
  name: string;
  description: string;
  source_type: 'discovered';
  capabilities: DiscoveredCapability[];
  agent_names: string[]; // actual AiAgent.agent_name values
  agent_count: number;
  service_count: number;
  route_count: number;
  model_count: number;
  strength_scores: Record<string, number>;
  autonomy_level: string;
}

// ─── Curated Capability Registry ─────────────────────────────────────────────
// Every entry maps a real file to a business process category.
// Categories are derived from what actually exists in the codebase.

interface RegistryEntry {
  path: string;
  name: string;
  category: string;
  type: DiscoveredCapability['type'];
}

const CAPABILITY_REGISTRY: RegistryEntry[] = [
  // ═══ Campaign & Customer Acquisition ═══
  { path: 'services/campaignService.ts', name: 'Campaign Service', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/campaignBuilderService.ts', name: 'Campaign Builder', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/campaignLifecycleService.ts', name: 'Campaign Lifecycle', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/campaignStrategyService.ts', name: 'Campaign Strategy', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/campaignContextService.ts', name: 'Campaign Context', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/campaignActivationAuditService.ts', name: 'Activation Audit', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/campaignApprovalService.ts', name: 'Campaign Approval', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/campaignLinkService.ts', name: 'Campaign Links', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/sequenceService.ts', name: 'Sequence Engine', category: 'campaign_acquisition', type: 'service' },
  { path: 'services/emailService.ts', name: 'Email Service', category: 'campaign_acquisition', type: 'service' },
  { path: 'models/Campaign.ts', name: 'Campaign Model', category: 'campaign_acquisition', type: 'model' },
  { path: 'models/CampaignLead.ts', name: 'Campaign Lead Model', category: 'campaign_acquisition', type: 'model' },
  { path: 'models/CampaignVariant.ts', name: 'Campaign Variant Model', category: 'campaign_acquisition', type: 'model' },
  { path: 'models/CampaignDeployment.ts', name: 'Campaign Deployment Model', category: 'campaign_acquisition', type: 'model' },
  { path: 'models/CampaignExperiment.ts', name: 'Campaign Experiment Model', category: 'campaign_acquisition', type: 'model' },
  { path: 'routes/admin/campaignRoutes.ts', name: 'Campaign API Routes', category: 'campaign_acquisition', type: 'route' },

  // ═══ Campaign Intelligence & Optimization ═══
  { path: 'services/campaignAnalyticsService.ts', name: 'Campaign Analytics', category: 'campaign_intelligence', type: 'analytics' },
  { path: 'services/campaignHealthScanner.ts', name: 'Campaign Health Scanner', category: 'campaign_intelligence', type: 'analytics' },
  { path: 'services/campaignOptimizationService.ts', name: 'Campaign Optimization', category: 'campaign_intelligence', type: 'service' },
  { path: 'services/campaignEvolutionService.ts', name: 'Campaign Evolution', category: 'campaign_intelligence', type: 'service' },
  { path: 'services/campaignWatchdogService.ts', name: 'Campaign Watchdog', category: 'campaign_intelligence', type: 'service' },
  { path: 'services/campaignKnowledgeService.ts', name: 'Campaign Knowledge', category: 'campaign_intelligence', type: 'service' },
  { path: 'services/campaignRecoveryService.ts', name: 'Campaign Recovery', category: 'campaign_intelligence', type: 'service' },
  { path: 'services/campaignRebuildService.ts', name: 'Campaign Rebuild', category: 'campaign_intelligence', type: 'service' },
  { path: 'models/CampaignHealth.ts', name: 'Campaign Health Model', category: 'campaign_intelligence', type: 'model' },
  { path: 'models/CampaignInsight.ts', name: 'Campaign Insight Model', category: 'campaign_intelligence', type: 'model' },
  { path: 'routes/admin/campaignIntelligenceRoutes.ts', name: 'Campaign Intelligence API', category: 'campaign_intelligence', type: 'route' },

  // ═══ Lead Management & Engagement ═══
  { path: 'services/leadService.ts', name: 'Lead Service', category: 'lead_management', type: 'service' },
  { path: 'services/leadScoringEngine.ts', name: 'Lead Scoring Engine', category: 'lead_management', type: 'service' },
  { path: 'services/leadClassificationService.ts', name: 'Lead Classification', category: 'lead_management', type: 'service' },
  { path: 'services/leadIntelligenceService.ts', name: 'Lead Intelligence', category: 'lead_management', type: 'service' },
  { path: 'services/intentScoringService.ts', name: 'Intent Scoring', category: 'lead_management', type: 'service' },
  { path: 'services/icpProfileService.ts', name: 'ICP Profiling', category: 'lead_management', type: 'service' },
  { path: 'services/apolloService.ts', name: 'Apollo Integration', category: 'lead_management', type: 'service' },
  { path: 'models/Lead.ts', name: 'Lead Model', category: 'lead_management', type: 'model' },
  { path: 'models/LeadRecommendation.ts', name: 'Lead Recommendation Model', category: 'lead_management', type: 'model' },
  { path: 'routes/admin/leadRoutes.ts', name: 'Lead API Routes', category: 'lead_management', type: 'route' },

  // ═══ Admissions & Conversion ═══
  { path: 'services/admissionsWorkflowService.ts', name: 'Admissions Workflow', category: 'admissions', type: 'service' },
  { path: 'services/admissionsMayaService.ts', name: 'Maya Admissions AI', category: 'admissions', type: 'service' },
  { path: 'services/admissionsKnowledgeService.ts', name: 'Admissions Knowledge', category: 'admissions', type: 'service' },
  { path: 'services/admissionsMemoryService.ts', name: 'Admissions Memory', category: 'admissions', type: 'service' },
  { path: 'services/appointmentService.ts', name: 'Appointment Scheduling', category: 'admissions', type: 'service' },
  { path: 'services/chatService.ts', name: 'Chat Service', category: 'admissions', type: 'service' },
  { path: 'models/AdmissionsActionLog.ts', name: 'Admissions Log Model', category: 'admissions', type: 'model' },
  { path: 'routes/admin/admissionsRoutes.ts', name: 'Admissions API', category: 'admissions', type: 'route' },

  // ═══ Visitor Tracking & Behavioral Intelligence ═══
  { path: 'services/visitorTrackingService.ts', name: 'Visitor Tracking', category: 'visitor_intelligence', type: 'service' },
  { path: 'services/visitorAnalyticsService.ts', name: 'Visitor Analytics', category: 'visitor_intelligence', type: 'analytics' },
  { path: 'services/behavioralSignalService.ts', name: 'Behavioral Signals', category: 'visitor_intelligence', type: 'service' },
  { path: 'services/behavioralTriggerService.ts', name: 'Behavioral Triggers', category: 'visitor_intelligence', type: 'service' },
  { path: 'services/journeyTimelineService.ts', name: 'Journey Timeline', category: 'visitor_intelligence', type: 'service' },
  { path: 'models/Visitor.ts', name: 'Visitor Model', category: 'visitor_intelligence', type: 'model' },
  { path: 'models/VisitorSession.ts', name: 'Visitor Session Model', category: 'visitor_intelligence', type: 'model' },

  // ═══ Curriculum & Learning Delivery ═══
  { path: 'services/contentGenerationService.ts', name: 'Content Generation', category: 'curriculum_delivery', type: 'service' },
  { path: 'services/curriculumService.ts', name: 'Curriculum Service', category: 'curriculum_delivery', type: 'service' },
  { path: 'services/curriculumGenerationService.ts', name: 'Curriculum Generation', category: 'curriculum_delivery', type: 'service' },
  { path: 'services/variableService.ts', name: 'Variable Service', category: 'curriculum_delivery', type: 'service' },
  { path: 'services/mentorService.ts', name: 'AI Mentor', category: 'curriculum_delivery', type: 'service' },
  { path: 'services/promptService.ts', name: 'Prompt Service', category: 'curriculum_delivery', type: 'service' },
  { path: 'services/gatingService.ts', name: 'Gating Service', category: 'curriculum_delivery', type: 'service' },
  { path: 'services/skillGenomeService.ts', name: 'Skill Genome', category: 'curriculum_delivery', type: 'service' },
  { path: 'services/artifactService.ts', name: 'Artifact Service', category: 'curriculum_delivery', type: 'service' },
  { path: 'routes/admin/orchestrationRoutes.ts', name: 'Orchestration API', category: 'curriculum_delivery', type: 'route' },

  // ═══ Autonomous Decision Pipeline ═══
  { path: 'intelligence/agents/ProblemDiscoveryAgent.ts', name: 'Problem Discovery', category: 'autonomous_decisions', type: 'agent' },
  { path: 'intelligence/agents/RootCauseAgent.ts', name: 'Root Cause Analysis', category: 'autonomous_decisions', type: 'agent' },
  { path: 'intelligence/agents/ActionPlannerAgent.ts', name: 'Action Planner', category: 'autonomous_decisions', type: 'agent' },
  { path: 'intelligence/agents/ExecutionAgent.ts', name: 'Execution Agent', category: 'autonomous_decisions', type: 'agent' },
  { path: 'intelligence/agents/MonitorAgent.ts', name: 'Monitor Agent', category: 'autonomous_decisions', type: 'agent' },
  { path: 'intelligence/agents/AuditAgent.ts', name: 'Audit Agent', category: 'autonomous_decisions', type: 'agent' },
  { path: 'intelligence/agents/RiskEvaluatorAgent.ts', name: 'Risk Evaluator', category: 'autonomous_decisions', type: 'agent' },
  { path: 'intelligence/agents/ImpactEstimatorAgent.ts', name: 'Impact Estimator', category: 'autonomous_decisions', type: 'agent' },
  { path: 'models/IntelligenceDecision.ts', name: 'Decision Model', category: 'autonomous_decisions', type: 'model' },
  { path: 'models/IntelligenceMemory.ts', name: 'Intelligence Memory', category: 'autonomous_decisions', type: 'model' },

  // ═══ Executive Intelligence & Analytics ═══
  { path: 'intelligence/agents/StrategicIntelligenceAgent.ts', name: 'Strategic Intelligence', category: 'executive_intelligence', type: 'agent' },
  { path: 'intelligence/agents/CoryStrategicAgent.ts', name: 'Cory Strategic Agent', category: 'executive_intelligence', type: 'agent' },
  { path: 'services/executiveBriefingService.ts', name: 'Executive Briefing', category: 'executive_intelligence', type: 'service' },
  { path: 'services/executiveAwarenessService.ts', name: 'Executive Awareness', category: 'executive_intelligence', type: 'service' },
  { path: 'services/situationalAwarenessService.ts', name: 'Situational Awareness', category: 'executive_intelligence', type: 'service' },
  { path: 'services/dashboardService.ts', name: 'Dashboard Service', category: 'executive_intelligence', type: 'service' },
  { path: 'services/marketingAnalyticsService.ts', name: 'Marketing Analytics', category: 'executive_intelligence', type: 'analytics' },
  { path: 'routes/admin/intelligenceRoutes.ts', name: 'Intelligence API', category: 'executive_intelligence', type: 'route' },

  // ═══ Revenue Operations ═══
  { path: 'intelligence/agents/RevenueOptimizationAgent.ts', name: 'Revenue Optimization', category: 'revenue_ops', type: 'agent' },
  { path: 'intelligence/agents/CostOptimizationAgent.ts', name: 'Cost Optimization', category: 'revenue_ops', type: 'agent' },
  { path: 'intelligence/agents/GrowthExperimentAgent.ts', name: 'Growth Experiments', category: 'revenue_ops', type: 'agent' },
  { path: 'services/revenueDashboardService.ts', name: 'Revenue Dashboard', category: 'revenue_ops', type: 'service' },
  { path: 'services/pipelineService.ts', name: 'Pipeline Service', category: 'revenue_ops', type: 'service' },
  { path: 'services/opportunityScoringService.ts', name: 'Opportunity Scoring', category: 'revenue_ops', type: 'service' },

  // ═══ Self-Healing & Reliability ═══
  { path: 'services/selfHealingService.ts', name: 'Self-Healing Engine', category: 'self_healing', type: 'service' },
  { path: 'services/autoRepairService.ts', name: 'Auto-Repair', category: 'self_healing', type: 'service' },
  { path: 'services/diagnosticsService.ts', name: 'Diagnostics', category: 'self_healing', type: 'service' },
  { path: 'services/postExecutionAnalyticsService.ts', name: 'Post-Execution Analytics', category: 'self_healing', type: 'analytics' },
  { path: 'services/postExecutionRecommendationService.ts', name: 'Post-Execution Recommendations', category: 'self_healing', type: 'service' },
  { path: 'services/qualityScoringService.ts', name: 'Quality Scoring', category: 'self_healing', type: 'service' },
  { path: 'models/HealingPlan.ts', name: 'Healing Plan Model', category: 'self_healing', type: 'model' },

  // ═══ Governance & Compliance ═══
  { path: 'intelligence/agents/GovernanceAgent.ts', name: 'Governance Agent', category: 'governance', type: 'agent' },
  { path: 'services/governanceService.ts', name: 'Governance Service', category: 'governance', type: 'service' },
  { path: 'services/communicationSafetyService.ts', name: 'Communication Safety', category: 'governance', type: 'service' },
  { path: 'services/unsubscribeEnforcementService.ts', name: 'Unsubscribe Enforcement', category: 'governance', type: 'service' },
  { path: 'services/messageValidatorService.ts', name: 'Message Validation', category: 'governance', type: 'service' },
  { path: 'services/agentSafetyAlertService.ts', name: 'Agent Safety Alerts', category: 'governance', type: 'service' },
  { path: 'services/agentPermissionService.ts', name: 'Agent Permissions', category: 'governance', type: 'service' },
  { path: 'models/Alert.ts', name: 'Alert Model', category: 'governance', type: 'model' },
  { path: 'routes/admin/governanceRoutes.ts', name: 'Governance API', category: 'governance', type: 'route' },

  // ═══ Operations & Scheduling ═══
  { path: 'services/schedulerService.ts', name: 'Scheduler', category: 'operations', type: 'scheduler' },
  { path: 'services/aiOpsScheduler.ts', name: 'AI Ops Scheduler', category: 'operations', type: 'scheduler' },
  { path: 'services/aiOpsService.ts', name: 'AI Ops Service', category: 'operations', type: 'service' },
  { path: 'services/systemHealthService.ts', name: 'System Health', category: 'operations', type: 'service' },
  { path: 'services/systemControlService.ts', name: 'System Control', category: 'operations', type: 'service' },
  { path: 'services/deploymentService.ts', name: 'Deployment Service', category: 'operations', type: 'service' },
  { path: 'services/ticketService.ts', name: 'Ticket System', category: 'operations', type: 'service' },
  { path: 'models/Ticket.ts', name: 'Ticket Model', category: 'operations', type: 'model' },
  { path: 'models/AiAgent.ts', name: 'AI Agent Model', category: 'operations', type: 'model' },

  // ═══ Alumni & Community ═══
  { path: 'services/alumniCampaignService.ts', name: 'Alumni Campaigns', category: 'alumni', type: 'service' },
  { path: 'services/alumniDataService.ts', name: 'Alumni Data', category: 'alumni', type: 'service' },
  { path: 'services/alumniReferralService.ts', name: 'Alumni Referrals', category: 'alumni', type: 'service' },
  { path: 'services/alumniContextEngine.ts', name: 'Alumni Context', category: 'alumni', type: 'service' },
  { path: 'routes/admin/alumniRoutes.ts', name: 'Alumni API', category: 'alumni', type: 'route' },
];

const PROCESS_DEFINITIONS: Record<string, { name: string; description: string; autonomy: string }> = {
  campaign_acquisition: {
    name: 'Campaign & Customer Acquisition',
    description: 'End-to-end campaign management: building, deploying, sequencing, A/B testing, and multi-channel outreach across email, SMS, and cold outbound.',
    autonomy: 'supervised',
  },
  campaign_intelligence: {
    name: 'Campaign Intelligence & Optimization',
    description: 'Campaign health monitoring, analytics, watchdog scanning, recovery, evolution, and AI-driven optimization of campaign performance.',
    autonomy: 'assisted',
  },
  lead_management: {
    name: 'Lead Engagement & Pipeline',
    description: 'Lead scoring, classification, ICP profiling, intent analysis, and pipeline management from first touch through qualification.',
    autonomy: 'assisted',
  },
  admissions: {
    name: 'Admissions & Conversion',
    description: 'AI-powered admissions workflow with Maya conversational agent, knowledge base, appointment scheduling, and memory-driven personalization.',
    autonomy: 'supervised',
  },
  visitor_intelligence: {
    name: 'Visitor Tracking & Behavioral Intelligence',
    description: 'Website visitor identification, session tracking, behavioral signal detection, trigger-based actions, and journey timeline mapping.',
    autonomy: 'assisted',
  },
  curriculum_delivery: {
    name: 'Curriculum & Learning Delivery',
    description: 'AI-native personalized curriculum with 7-layer prompt composition, content generation, mentor guidance, gating, skills assessment, and artifact management.',
    autonomy: 'supervised',
  },
  autonomous_decisions: {
    name: 'Autonomous Decision Pipeline',
    description: 'Full autonomous loop: problem discovery → root cause analysis → action planning → execution → monitoring → audit with risk evaluation and memory-driven learning.',
    autonomy: 'supervised',
  },
  executive_intelligence: {
    name: 'Executive Intelligence & Analytics',
    description: 'Cory AI COO, strategic briefings, situational awareness, marketing analytics, KPI dashboards, and predictive forecasting.',
    autonomy: 'assisted',
  },
  revenue_ops: {
    name: 'Revenue Operations',
    description: 'Revenue optimization, cost analysis, growth experiments, opportunity scoring, and pipeline velocity tracking.',
    autonomy: 'manual',
  },
  self_healing: {
    name: 'Self-Healing & Reliability',
    description: 'Automated prompt quality detection, variable failure repair, post-execution analytics, diagnostic scanning, and healing plan generation.',
    autonomy: 'assisted',
  },
  governance: {
    name: 'Governance, Safety & Compliance',
    description: 'AI governance enforcement, communication safety, unsubscribe compliance, message validation, agent safety alerts, and permission management.',
    autonomy: 'manual',
  },
  operations: {
    name: 'Operations & Infrastructure',
    description: 'Scheduling, AI ops orchestration, system health monitoring, deployment management, ticket system, and agent lifecycle control.',
    autonomy: 'assisted',
  },
  alumni: {
    name: 'Alumni & Community',
    description: 'Alumni engagement campaigns, referral programs, community data management, and alumni context-driven outreach.',
    autonomy: 'manual',
  },
};

// Agent name mapping: file name → actual AiAgent.agent_name in DB
const AGENT_FILE_TO_DB_NAME: Record<string, string> = {
  'ProblemDiscoveryAgent.ts': 'ProblemDiscoveryAgent',
  'RootCauseAgent.ts': 'RootCauseAgent',
  'ActionPlannerAgent.ts': 'ActionPlannerAgent',
  'ExecutionAgent.ts': 'ExecutionAgent',
  'MonitorAgent.ts': 'MonitorAgent',
  'AuditAgent.ts': 'AuditAgent',
  'RiskEvaluatorAgent.ts': 'RiskEvaluatorAgent',
  'ImpactEstimatorAgent.ts': 'ImpactEstimatorAgent',
  'StrategicIntelligenceAgent.ts': 'StrategicIntelligenceAgent',
  'CoryStrategicAgent.ts': 'CoryStrategicAgent',
  'RevenueOptimizationAgent.ts': 'RevenueOptimizationAgent',
  'CostOptimizationAgent.ts': 'CostOptimizationAgent',
  'GrowthExperimentAgent.ts': 'GrowthExperimentAgent',
  'GovernanceAgent.ts': 'GovernanceAgent',
};

export async function discoverPlatformProcesses(): Promise<DiscoveredProcess[]> {
  // Group capabilities by category
  const grouped: Record<string, DiscoveredCapability[]> = {};
  for (const entry of CAPABILITY_REGISTRY) {
    if (!grouped[entry.category]) grouped[entry.category] = [];
    grouped[entry.category].push({
      name: entry.name,
      type: entry.type,
      file_path: entry.path,
      status: 'active',
    });
  }

  // Get active agents from DB for enrichment
  let activeAgents: string[] = [];
  try {
    const agents = await AiAgent.findAll({ where: { status: 'active' }, attributes: ['agent_name'] });
    activeAgents = agents.map(a => a.agent_name);
  } catch {}

  const processes: DiscoveredProcess[] = [];
  for (const [slug, caps] of Object.entries(grouped)) {
    const def = PROCESS_DEFINITIONS[slug];
    if (!def) continue;

    // Resolve agent names for this category
    const agentCaps = caps.filter(c => c.type === 'agent');
    const agentNames: string[] = [];
    for (const ac of agentCaps) {
      const fileName = ac.file_path.split('/').pop() || '';
      const dbName = AGENT_FILE_TO_DB_NAME[fileName];
      if (dbName) agentNames.push(dbName);
    }

    const services = caps.filter(c => c.type === 'service');
    const routes = caps.filter(c => c.type === 'route');
    const models = caps.filter(c => c.type === 'model');
    const analytics = caps.filter(c => c.type === 'analytics');

    // Evidence-based scoring
    const serviceCount = services.length + analytics.length;
    const agentCount = agentCaps.length;
    const routeCount = routes.length;
    const modelCount = models.length;
    const total = caps.length;

    const scores: Record<string, number> = {
      determinism: Math.min(100, serviceCount * 12 + modelCount * 8 + 15),
      reliability: Math.min(100, serviceCount * 10 + (analytics.length > 0 ? 20 : 0) + 15),
      observability: Math.min(100, analytics.length * 25 + routeCount * 10 + 10),
      ux_exposure: Math.min(100, routeCount * 20 + 10),
      automation: Math.min(100, agentCount * 18 + (serviceCount > 3 ? 15 : 0) + 10),
      ai_maturity: Math.min(100, agentCount * 20 + analytics.length * 10 + 5),
      human_dependency: Math.max(0, 100 - (agentCount * 15 + serviceCount * 8)),
      overall: 0,
    };
    scores.overall = Math.round(
      Object.entries(scores).filter(([k]) => k !== 'overall').reduce((s, [, v]) => s + v, 0) / 7
    );

    processes.push({
      slug,
      name: def.name,
      description: def.description,
      source_type: 'discovered',
      capabilities: caps,
      agent_names: agentNames,
      agent_count: agentCount,
      service_count: serviceCount,
      route_count: routeCount,
      model_count: modelCount,
      strength_scores: scores,
      autonomy_level: def.autonomy,
    });
  }

  // Sort by total capability count descending
  processes.sort((a, b) => b.capabilities.length - a.capabilities.length);
  return processes;
}
