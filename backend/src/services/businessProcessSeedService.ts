/**
 * Business Process Seed Service
 * Seeds platform-level business processes as Capability rows with process_type = 'platform_process'.
 */
import Capability from '../models/Capability';

// Sentinel project_id for platform processes (well-known UUID)
export const SYSTEM_PLATFORM_PROJECT_ID = '00000000-0000-0000-0000-000000000001';

const PLATFORM_PROCESSES = [
  {
    name: 'Lead Acquisition Pipeline',
    description: 'End-to-end lead capture, scoring, and qualification from website visitors through to sales-ready prospects.',
    linked_agents: ['openclaw_supervisor', 'lead_scoring', 'visitor_tracking'],
    linked_backend_services: ['leadService', 'visitorService', 'apolloService', 'icpProfileService'],
    linked_frontend_components: ['LeadCaptureForm', 'VisitorPage', 'LeadsTab'],
    strength_scores: { determinism: 70, reliability: 75, observability: 60, ux_exposure: 80, automation: 65, ai_maturity: 55, human_dependency: 40 },
    autonomy_level: 'assisted',
  },
  {
    name: 'Campaign Orchestration',
    description: 'Automated multi-channel campaign management including email sequences, SMS, and cold outbound with A/B testing.',
    linked_agents: ['campaign_orchestrator', 'content_generation', 'ab_test_agent'],
    linked_backend_services: ['campaignService', 'emailService', 'schedulerService', 'contentGenerationService'],
    linked_frontend_components: ['CampaignsPage', 'CampaignDetailPage', 'SequencesPage'],
    strength_scores: { determinism: 80, reliability: 70, observability: 65, ux_exposure: 85, automation: 80, ai_maturity: 60, human_dependency: 30 },
    autonomy_level: 'supervised',
  },
  {
    name: 'Student Curriculum Delivery',
    description: 'Personalized AI-native curriculum with content generation, assessments, knowledge checks, and mentor guidance.',
    linked_agents: ['content_generation_agent', 'mentor_agent', 'assessment_agent'],
    linked_backend_services: ['contentGenerationService', 'curriculumService', 'variableService', 'mentorService'],
    linked_frontend_components: ['PortalLessonPage', 'ConceptLesson', 'PromptTemplate', 'ImplementationTask'],
    strength_scores: { determinism: 60, reliability: 80, observability: 70, ux_exposure: 90, automation: 75, ai_maturity: 85, human_dependency: 25 },
    autonomy_level: 'supervised',
  },
  {
    name: 'Autonomous Decision Pipeline',
    description: 'Full autonomous decision loop: problem discovery → root cause → action planning → execution → monitoring → audit.',
    linked_agents: ['problem_discovery', 'root_cause', 'action_planner', 'execution', 'monitor', 'audit'],
    linked_backend_services: ['autonomousEngine', 'coryDecisionEngine', 'riskOrchestrator'],
    linked_frontend_components: ['IntelligenceOSPage', 'CoryPanel', 'SituationalAwarenessPanel'],
    strength_scores: { determinism: 50, reliability: 65, observability: 80, ux_exposure: 70, automation: 90, ai_maturity: 95, human_dependency: 20 },
    autonomy_level: 'supervised',
  },
  {
    name: 'Executive Intelligence Briefing',
    description: 'AI-generated executive summaries, KPI dashboards, strategic recommendations, and forecasting.',
    linked_agents: ['strategic_intelligence', 'executive_briefing', 'revenue_optimization'],
    linked_backend_services: ['executiveSummaryService', 'kpiService', 'predictiveAnalyticsService', 'narrativeService'],
    linked_frontend_components: ['IntelligenceOSPage', 'IntelligenceAnalyticsGrid', 'ChartRenderer'],
    strength_scores: { determinism: 45, reliability: 70, observability: 85, ux_exposure: 75, automation: 70, ai_maturity: 80, human_dependency: 35 },
    autonomy_level: 'assisted',
  },
  {
    name: 'Self-Healing & Repair',
    description: 'Automated detection and correction of system issues including prompt quality, variable failures, and flow adjustments.',
    linked_agents: ['self_healing_engine', 'diagnostics_agent'],
    linked_backend_services: ['selfHealingService', 'diagnosticsService', 'autoRepairService', 'postExecutionAnalyticsService'],
    linked_frontend_components: ['SelfHealingTab', 'HealthDashboardTab'],
    strength_scores: { determinism: 75, reliability: 60, observability: 70, ux_exposure: 50, automation: 85, ai_maturity: 70, human_dependency: 45 },
    autonomy_level: 'assisted',
  },
  {
    name: 'Revenue Optimization',
    description: 'AI-driven revenue analysis, pricing strategy, cost optimization, and growth experiment management.',
    linked_agents: ['revenue_optimization', 'cost_optimization', 'growth_experiment'],
    linked_backend_services: ['revenueService', 'costOptimizationService', 'growthExperimentService'],
    linked_frontend_components: ['RevenuePage', 'PipelinePage', 'OpportunitiesPage'],
    strength_scores: { determinism: 55, reliability: 65, observability: 60, ux_exposure: 70, automation: 50, ai_maturity: 60, human_dependency: 55 },
    autonomy_level: 'manual',
  },
  {
    name: 'Governance & Compliance',
    description: 'AI governance, policy enforcement, audit trails, and compliance monitoring across all autonomous operations.',
    linked_agents: ['governance_agent', 'audit_agent', 'risk_evaluator'],
    linked_backend_services: ['governanceService', 'auditService', 'riskAnalysisService'],
    linked_frontend_components: ['GovernancePage', 'AuditLogPage'],
    strength_scores: { determinism: 85, reliability: 80, observability: 90, ux_exposure: 40, automation: 60, ai_maturity: 50, human_dependency: 60 },
    autonomy_level: 'manual',
  },
  {
    name: 'User Journey Maps',
    description: 'End-to-end user journey tracking across awareness, consideration, onboarding, engagement, and evaluation phases with funnel analytics and stall detection.',
    linked_agents: ['visitor_tracking', 'lead_scoring'],
    linked_backend_services: ['UserJourneyMapsService', 'journeyTimelineService'],
    linked_frontend_components: ['JourneyTimeline', 'MapsTab'],
    strength_scores: { determinism: 65, reliability: 70, observability: 75, ux_exposure: 60, automation: 55, ai_maturity: 50, human_dependency: 40 },
    autonomy_level: 'assisted',
  },
  {
    name: 'Analytics and Reporting',
    description: 'Business intelligence, KPI tracking, insight discovery, executive briefings, campaign analytics, visitor analytics, and predictive forecasting.',
    linked_agents: ['insight_discovery', 'trend_analysis', 'narrative_agent', 'executive_briefing', 'agent_performance_analytics', 'revenue_opportunity', 'knowledge_graph_builder'],
    linked_backend_services: ['kpiService', 'insightDiscoveryService', 'narrativeService', 'predictiveAnalyticsService', 'campaignAnalyticsService', 'visitorAnalyticsService', 'dashboardService', 'agentPerformanceService'],
    linked_frontend_components: ['IntelligenceOSPage', 'IntelligenceAnalyticsGrid', 'ChartRenderer', 'MapsTab'],
    strength_scores: { determinism: 75, reliability: 80, observability: 90, ux_exposure: 85, automation: 80, ai_maturity: 75, human_dependency: 25 },
    autonomy_level: 'supervised',
  },
  {
    name: 'Deployment and Infrastructure',
    description: 'Application deployment management, landing page configuration, system health monitoring, scheduler control, and infrastructure observability.',
    linked_agents: ['orchestration_health', 'self_healing_engine', 'runtime_threat_monitor'],
    linked_backend_services: ['deploymentController', 'schedulerControlService', 'orchestrationHealthService', 'selfHealingService'],
    linked_frontend_components: ['DeploymentPage', 'SchedulerControlPanel', 'SystemHealthDashboard'],
    strength_scores: { determinism: 80, reliability: 75, observability: 85, ux_exposure: 50, automation: 70, ai_maturity: 55, human_dependency: 35 },
    autonomy_level: 'supervised',
  },
];

export async function seedBusinessProcesses(): Promise<{ created: number; skipped: number }> {
  let created = 0, skipped = 0;

  // Ensure sentinel project exists (create minimal if not)
  const { Project } = await import('../models');
  const [project] = await Project.findOrCreate({
    where: { id: SYSTEM_PLATFORM_PROJECT_ID },
    defaults: {
      id: SYSTEM_PLATFORM_PROJECT_ID,
      enrollment_id: '00000000-0000-0000-0000-000000000001', // sentinel
      program_id: '00000000-0000-0000-0000-000000000001', // sentinel
      organization_name: 'Colaberry Platform',
      project_stage: 'implementation',
      project_variables: {},
    } as any,
  });

  for (let i = 0; i < PLATFORM_PROCESSES.length; i++) {
    const proc = PLATFORM_PROCESSES[i];
    const existing = await Capability.findOne({
      where: { project_id: SYSTEM_PLATFORM_PROJECT_ID, name: proc.name },
    });

    if (existing) { skipped++; continue; }

    await Capability.create({
      project_id: SYSTEM_PLATFORM_PROJECT_ID,
      name: proc.name,
      description: proc.description,
      status: 'active',
      priority: 'high',
      sort_order: i,
      source: 'manual',
      process_type: 'platform_process',
      autonomy_level: proc.autonomy_level,
      linked_agents: proc.linked_agents,
      linked_backend_services: proc.linked_backend_services,
      linked_frontend_components: proc.linked_frontend_components,
      strength_scores: proc.strength_scores,
      hitl_config: {
        approval_before_execution: true,
        approval_after_generation: false,
        approval_before_external_action: true,
        auto_approve_confidence_threshold: 0.9,
        auto_approve_risk_threshold: 0.3,
      },
      autonomy_history: [],
    } as any);
    created++;
  }

  return { created, skipped };
}
