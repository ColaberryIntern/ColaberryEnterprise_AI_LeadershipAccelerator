import AiAgent from '../models/AiAgent';
import type { AiAgentType, AiAgentTriggerType, AiAgentCategory } from '../models/AiAgent';

interface AgentSeedEntry {
  agent_name: string;
  agent_type: AiAgentType;
  module: string;
  source_file: string;
  trigger_type: AiAgentTriggerType;
  schedule: string;
  category: AiAgentCategory;
  description: string;
  config?: Record<string, any>;
}

const AGENT_REGISTRY: AgentSeedEntry[] = [
  // --- schedulerService.ts cron jobs ---
  {
    agent_name: 'ScheduledActionsProcessor',
    agent_type: 'scheduled_processor',
    module: 'schedulerService',
    source_file: 'backend/src/services/schedulerService.ts',
    trigger_type: 'cron',
    schedule: '*/5 * * * *',
    category: 'outbound',
    description:
      'Processes pending ScheduledEmail records across all channels (email, voice, SMS). Applies AI content generation at send time, handles test mode overrides, and enforces pacing/rate limits per campaign.',
  },
  {
    agent_name: 'NoShowDetector',
    agent_type: 'scheduled_processor',
    module: 'schedulerService',
    source_file: 'backend/src/services/schedulerService.ts',
    trigger_type: 'cron',
    schedule: '*/15 * * * *',
    category: 'outbound',
    description:
      'Detects strategy calls >30 minutes past scheduled time still marked "scheduled". Marks as no_show, auto-completes CampaignLead, cancels prep nudges, and enrolls lead in recovery sequence.',
  },
  {
    agent_name: 'ICPInsightComputer',
    agent_type: 'insight_computer',
    module: 'schedulerService',
    source_file: 'backend/src/services/icpInsightService.ts',
    trigger_type: 'cron',
    schedule: '0 2 * * *',
    category: 'behavioral',
    description:
      'Computes aggregated ICP insights from 90 days of interaction data. Analyzes by industry, title, company size, and source type. Uses Wilson score confidence intervals. Auto-refreshes active ICP profile stats.',
  },
  {
    agent_name: 'BehavioralSignalDetector',
    agent_type: 'signal_detector',
    module: 'schedulerService',
    source_file: 'backend/src/services/behavioralSignalService.ts',
    trigger_type: 'cron',
    schedule: '*/10 * * * *',
    category: 'behavioral',
    description:
      'Detects 16 buying signal types from PageEvent data on closed visitor sessions. Signals include pricing page visits, enrollment CTA clicks, deep scrolls, form submissions, and multi-category research patterns.',
  },
  {
    agent_name: 'IntentScoreRecomputer',
    agent_type: 'intent_scorer',
    module: 'schedulerService',
    source_file: 'backend/src/services/intentScoringService.ts',
    trigger_type: 'cron',
    schedule: '7,22,37,52 * * * *',
    category: 'behavioral',
    description:
      'Recomputes intent scores for visitors with recent behavioral signals. Uses time-decay weighting (7-day half-life) to prioritize recent activity. Maps to intent levels: low, medium, high, very high.',
  },
  {
    agent_name: 'BehavioralTriggerEvaluator',
    agent_type: 'trigger_evaluator',
    module: 'schedulerService',
    source_file: 'backend/src/services/behavioralTriggerService.ts',
    trigger_type: 'cron',
    schedule: '5,15,25,35,45,55 * * * *',
    category: 'behavioral',
    description:
      'Evaluates behavioral trigger rules and automatically enrolls qualifying leads in behavior-triggered campaigns. Creates CampaignLead records and queues initial outreach actions.',
  },
  {
    agent_name: 'PageEventCleanup',
    agent_type: 'maintenance',
    module: 'schedulerService',
    source_file: 'backend/src/services/schedulerService.ts',
    trigger_type: 'cron',
    schedule: '0 3 * * *',
    category: 'maintenance',
    description:
      'Data retention: deletes PageEvent records older than 90 days to manage database size.',
  },
  {
    agent_name: 'ChatMessageCleanup',
    agent_type: 'maintenance',
    module: 'schedulerService',
    source_file: 'backend/src/services/schedulerService.ts',
    trigger_type: 'cron',
    schedule: '30 3 * * *',
    category: 'maintenance',
    description:
      'Data retention: deletes ChatMessage records older than 180 days to manage database size.',
  },
  {
    agent_name: 'OpportunityScoreRecomputer',
    agent_type: 'opportunity_scorer',
    module: 'schedulerService',
    source_file: 'backend/src/services/opportunityScoringService.ts',
    trigger_type: 'cron',
    schedule: '3,23,43 * * * *',
    category: 'behavioral',
    description:
      'Recomputes opportunity scores for active leads based on behavioral signals, intent scores, ICP alignment, and campaign engagement metrics.',
  },
  {
    agent_name: 'EmailDigest',
    agent_type: 'digest',
    module: 'schedulerService',
    source_file: 'backend/src/services/schedulerService.ts',
    trigger_type: 'cron',
    schedule: '0 * * * *',
    category: 'outbound',
    description:
      'Checks if email digest is enabled. Compiles and sends daily/weekly digest emails at the configured hour and day to admin recipients.',
  },
  {
    agent_name: 'SessionReminders',
    agent_type: 'reminder',
    module: 'schedulerService',
    source_file: 'backend/src/services/schedulerService.ts',
    trigger_type: 'cron',
    schedule: '*/30 * * * *',
    category: 'accelerator',
    description:
      'Sends 24-hour and 1-hour reminder emails to enrolled participants for upcoming live sessions.',
  },
  {
    agent_name: 'SessionLifecycle',
    agent_type: 'session_manager',
    module: 'schedulerService',
    source_file: 'backend/src/services/schedulerService.ts',
    trigger_type: 'cron',
    schedule: '*/5 * * * *',
    category: 'accelerator',
    description:
      'Manages session state transitions: marks sessions as "live" 15 min before start and "completed" 30 min after end. Post-completion: detects absent participants, sends session recaps, and recomputes readiness scores.',
  },
  // --- aiOpsScheduler.ts agents ---
  {
    agent_name: 'CampaignHealthScanner',
    agent_type: 'health_scanner',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/campaignHealthScanner.ts',
    trigger_type: 'cron',
    schedule: '*/15 * * * *',
    category: 'ai_ops',
    description:
      'Scans all active campaigns and computes health scores (0-100) based on channel connectivity, delivery rate, AI generation success, engagement metrics, and error rate. Upserts CampaignHealth records.',
  },
  {
    agent_name: 'CampaignRepairAgent',
    agent_type: 'repair',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/campaignRepairAgent.ts',
    trigger_type: 'cron',
    schedule: '8,28,48 * * * *',
    category: 'ai_ops',
    description:
      'Detects and repairs broken campaign automations. Retries failed ScheduledEmail sends (up to 3 attempts with 30min backoff). Detects stalled campaigns with active leads but no pending actions. Auto-resolves errors older than 7 days.',
    config: {
      auto_retry_enabled: true,
      max_retry_attempts: 3,
      retry_delay_minutes: 30,
      auto_resolve_stale_days: 7,
    },
  },
  {
    agent_name: 'ContentOptimizationAgent',
    agent_type: 'content_optimization',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/contentOptimizationAgent.ts',
    trigger_type: 'cron',
    schedule: '0 */6 * * *',
    category: 'ai_ops',
    description:
      'Detects campaigns with low engagement (open rate <10% or reply rate <1% over 48h) and rewrites pending email subjects and bodies using AI. Rate-limited to 10 rewrites per run with 6-hour cooldown.',
    config: {
      auto_rewrite_enabled: true,
      max_auto_actions_per_hour: 10,
      open_rate_threshold: 0.10,
      reply_rate_threshold: 0.01,
      min_sample_size: 10,
      cooldown_minutes: 360,
    },
  },
  {
    agent_name: 'ConversationOptimizationAgent',
    agent_type: 'conversation_optimization',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/conversationOptimizationAgent.ts',
    trigger_type: 'cron',
    schedule: '0 4 * * *',
    category: 'ai_ops',
    description:
      'Detects step-level conversation dropoffs (>80% reply rate decline between steps) and enhances AI instructions for future sends. Rate-limited to 5 enhancements per run with 24-hour cooldown.',
    config: {
      auto_enhance_enabled: true,
      max_auto_actions_per_hour: 5,
      dropoff_threshold: 0.80,
      min_sent_per_step: 5,
      cooldown_minutes: 1440,
    },
  },
  // --- Orchestration monitoring agents ---
  {
    agent_name: 'OrchestrationHealthAgent',
    agent_type: 'orchestration_health',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/orchestrationHealthAgent.ts',
    trigger_type: 'cron',
    schedule: '*/5 * * * *',
    category: 'accelerator',
    description:
      'Computes orchestration health score (0-100) from curriculum, prompt, artifact, student, and gating checks. Stores time-series snapshots and detects status changes (healthy/degraded/critical).',
  },
  {
    agent_name: 'StudentProgressMonitor',
    agent_type: 'student_monitor',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/studentProgressMonitor.ts',
    trigger_type: 'cron',
    schedule: '*/2 * * * *',
    category: 'accelerator',
    description:
      'Monitors active enrollments for stuck students (>48h on a lesson), missing required artifacts, and gating deadlocks where prerequisites are met but gates remain locked.',
  },
  {
    agent_name: 'PromptMonitorAgent',
    agent_type: 'prompt_monitor',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/promptMonitorAgent.ts',
    trigger_type: 'cron',
    schedule: '*/1 * * * *',
    category: 'accelerator',
    description:
      'Detects inactive prompts still referenced by mini-sections, broken FK references to non-existent prompt templates, and recent prompt execution errors.',
  },
  {
    agent_name: 'OrchestrationAutoRepairAgent',
    agent_type: 'orchestration_repair',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/orchestrationAutoRepairAgent.ts',
    trigger_type: 'cron',
    schedule: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
    category: 'accelerator',
    description:
      'Reads recent findings from monitoring agents and applies safe auto-repairs: re-activating inactive prompts still in use, nullifying broken FK references. Max 10 repairs per run.',
    config: {
      max_repairs_per_run: 10,
    },
  },
  // --- Campaign QA & Self-Healing agents ---
  {
    agent_name: 'CampaignQAAgent',
    agent_type: 'campaign_qa',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/campaignQAAgent.ts',
    trigger_type: 'cron',
    schedule: '0 */6 * * *',
    category: 'ai_ops',
    description:
      'Runs end-to-end tests on all active campaigns every 6 hours. Creates test leads, tests email/SMS/voice channels, verifies AI generation, and computes QA scores (0-100).',
  },
  {
    agent_name: 'AutonomousRampEvaluator',
    agent_type: 'scheduled_processor',
    module: 'schedulerService',
    source_file: 'backend/src/services/autonomousRampService.ts',
    trigger_type: 'cron',
    schedule: '0 */2 * * *',
    category: 'outbound',
    description:
      'Evaluates health scores for active autonomous campaigns every 2 hours. Advances ramp phases when health >= 70, holds at 50-69, and pauses for review below 50.',
  },
  {
    agent_name: 'CampaignEvolutionEngine',
    agent_type: 'scheduled_processor',
    module: 'schedulerService',
    source_file: 'backend/src/services/campaignEvolutionService.ts',
    trigger_type: 'cron',
    schedule: '0 */4 * * *',
    category: 'outbound',
    description:
      'Generates and evaluates AI message variants for autonomous campaigns every 4 hours. Creates A/B test variants, scores performance, promotes winners, and retires underperformers.',
  },
  {
    agent_name: 'ApolloLeadIntelligenceAgent',
    agent_type: 'lead_intelligence',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/apolloLeadIntelligenceAgent.ts',
    trigger_type: 'cron',
    schedule: '0 */6 * * *',
    category: 'outbound',
    description:
      'Discovers leads from Apollo using ICP profiles on autonomous campaigns. Creates lead recommendations pending admin approval. Scores program fit (0-100) and estimates ROI.',
    config: {
      max_leads_per_profile: 50,
      min_program_fit_score: 40,
      avg_deal_value: 25000,
    },
  },
  {
    agent_name: 'CampaignSelfHealingAgent',
    agent_type: 'self_healing',
    module: 'aiOpsScheduler',
    source_file: 'backend/src/services/agents/campaignSelfHealingAgent.ts',
    trigger_type: 'cron',
    schedule: '15,45 * * * *',
    category: 'ai_ops',
    description:
      'Detects failures from QA test runs and attempts repairs: retries failed emails, re-triggers SMS/voice, and re-tests after repair. Runs every 30 minutes offset from repair agent.',
    config: {
      auto_heal_enabled: true,
      max_retry_attempts: 3,
    },
  },
  // --- Intelligence Layer Agents (Autonomous Operations) ---
  {
    agent_name: 'ProblemDiscoveryAgent',
    agent_type: 'problem_discovery',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/ProblemDiscoveryAgent.ts',
    trigger_type: 'cron',
    schedule: '5,15,25,35,45,55 * * * *',
    category: 'autonomous',
    description: 'Scans for anomalies, conversion drops, error spikes, and agent failures every 10 minutes.',
  },
  {
    agent_name: 'RootCauseAgent',
    agent_type: 'root_cause',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/RootCauseAgent.ts',
    trigger_type: 'on_demand',
    schedule: '',
    category: 'autonomous',
    description: 'Root cause analysis via activity logs, knowledge graph, and vector memory. On-demand.',
  },
  {
    agent_name: 'ActionPlannerAgent',
    agent_type: 'action_planner',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/ActionPlannerAgent.ts',
    trigger_type: 'on_demand',
    schedule: '',
    category: 'autonomous',
    description: 'Maps root causes to safe executable actions from an allowlist. On-demand.',
  },
  {
    agent_name: 'ImpactEstimatorAgent',
    agent_type: 'impact_estimator',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/ImpactEstimatorAgent.ts',
    trigger_type: 'on_demand',
    schedule: '',
    category: 'autonomous',
    description: 'Predicts metric changes from proposed actions using historical outcomes. On-demand.',
  },
  {
    agent_name: 'RiskEvaluatorAgent',
    agent_type: 'risk_evaluator',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/RiskEvaluatorAgent.ts',
    trigger_type: 'on_demand',
    schedule: '',
    category: 'autonomous',
    description: 'Deterministic risk + confidence scoring for action gating. On-demand.',
  },
  {
    agent_name: 'ExecutionAgent',
    agent_type: 'execution',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/ExecutionAgent.ts',
    trigger_type: 'on_demand',
    schedule: '',
    category: 'autonomous',
    description: 'Execute safe actions with before/after state snapshots. On-demand.',
  },
  {
    agent_name: 'MonitorAgent',
    agent_type: 'monitor',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/MonitorAgent.ts',
    trigger_type: 'cron',
    schedule: '5,15,25,35,45,55 * * * *',
    category: 'autonomous',
    description: 'Track decision outcomes at 1h/6h/24h checkpoints with auto-rollback.',
  },
  {
    agent_name: 'AuditAgent',
    agent_type: 'audit',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/AuditAgent.ts',
    trigger_type: 'cron',
    schedule: '0 1 * * *',
    category: 'autonomous',
    description: 'Daily decision audit with success rate tracking and governance reporting.',
  },
  // --- Strategic Agents ---
  {
    agent_name: 'StrategicIntelligenceAgent',
    agent_type: 'strategic_intelligence',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/StrategicIntelligenceAgent.ts',
    trigger_type: 'cron',
    schedule: '0,30 * * * *',
    category: 'strategic',
    description: 'Cross-entity KPI aggregation and systemic pattern detection.',
  },
  {
    agent_name: 'RevenueOptimizationAgent',
    agent_type: 'revenue_optimization',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/RevenueOptimizationAgent.ts',
    trigger_type: 'cron',
    schedule: '0,30 * * * *',
    category: 'strategic',
    description: 'Lead → enrollment conversion funnel analysis and revenue optimization.',
  },
  {
    agent_name: 'CostOptimizationAgent',
    agent_type: 'cost_optimization',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/CostOptimizationAgent.ts',
    trigger_type: 'cron',
    schedule: '0,30 * * * *',
    category: 'strategic',
    description: 'Agent fleet efficiency analysis and cost optimization.',
  },
  {
    agent_name: 'GrowthExperimentAgent',
    agent_type: 'growth_experiment',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/GrowthExperimentAgent.ts',
    trigger_type: 'cron',
    schedule: '0,30 * * * *',
    category: 'strategic',
    description: 'Propose A/B tests from uncertain recommendations.',
  },
  {
    agent_name: 'GovernanceAgent',
    agent_type: 'governance',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/agents/GovernanceAgent.ts',
    trigger_type: 'cron',
    schedule: '5,15,25,35,45,55 * * * *',
    category: 'strategic',
    description: 'Enforce guardrails: max actions/hour, risk budget, resource caps.',
  },
  // --- Memory Agents ---
  {
    agent_name: 'MemoryAgent',
    agent_type: 'memory',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/memory/vectorMemory.ts',
    trigger_type: 'on_demand',
    schedule: '',
    category: 'memory',
    description: 'Store and retrieve semantic memories via pgvector. On-demand.',
  },
  {
    agent_name: 'KnowledgeGraphAgent',
    agent_type: 'memory',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/knowledge/knowledgeGraph.ts',
    trigger_type: 'on_demand',
    schedule: '',
    category: 'memory',
    description: 'Business entity relationship graph built from DatasetRegistry. On-demand.',
  },
  {
    agent_name: 'LearningAgent',
    agent_type: 'memory',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/memory/learningEngine.ts',
    trigger_type: 'on_demand',
    schedule: '',
    category: 'memory',
    description: 'Updates knowledge and memory from decision outcomes. On-demand.',
  },
  // --- Meta-Agents ---
  {
    agent_name: 'PerformanceAgent',
    agent_type: 'performance_tracker',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/meta/performanceAgent.ts',
    trigger_type: 'cron',
    schedule: '2 * * * *',
    category: 'meta',
    description: 'Aggregate agent performance metrics and detect degrading trends. Hourly.',
  },
  {
    agent_name: 'ArchitectureAgent',
    agent_type: 'architecture_analyzer',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/meta/architectureAgent.ts',
    trigger_type: 'cron',
    schedule: '2 * * * *',
    category: 'meta',
    description: 'Analyze agent fleet for schedule overlaps, idle agents, and error cascades. Hourly.',
  },
  {
    agent_name: 'PromptOptimizationAgent',
    agent_type: 'prompt_optimizer',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/meta/promptOptimizationAgent.ts',
    trigger_type: 'cron',
    schedule: '2 * * * *',
    category: 'meta',
    description: 'Detect weak reasoning patterns and propose prompt improvements. Hourly.',
  },
  {
    agent_name: 'ExperimentAgent',
    agent_type: 'experiment_runner',
    module: 'intelligence',
    source_file: 'backend/src/intelligence/meta/experimentAgent.ts',
    trigger_type: 'cron',
    schedule: '2 * * * *',
    category: 'meta',
    description: 'Controlled experiments with safety guardrails for agent improvement. Hourly.',
  },
  // --- Website Intelligence Agents ---
  {
    agent_name: 'WebsiteUIVisibilityAgent',
    agent_type: 'website_ui',
    module: 'websiteIntelligence',
    source_file: 'backend/src/services/agents/websiteUIVisibilityAgent.ts',
    trigger_type: 'cron',
    schedule: '0 */6 * * *',
    category: 'website_intelligence',
    description:
      'Scans all public pages for accessibility issues: missing alt text, aria-hidden interactive content, unlabeled form fields, and low-contrast text.',
  },
  {
    agent_name: 'WebsiteBrokenLinkAgent',
    agent_type: 'website_links',
    module: 'websiteIntelligence',
    source_file: 'backend/src/services/agents/websiteBrokenLinkAgent.ts',
    trigger_type: 'cron',
    schedule: '0 */6 * * *',
    category: 'website_intelligence',
    description:
      'Crawls all public pages checking internal links against known routes and external links via HEAD requests. Detects empty hrefs, unknown routes, and HTTP errors.',
  },
  {
    agent_name: 'WebsiteConversionFlowAgent',
    agent_type: 'website_conversion',
    module: 'websiteIntelligence',
    source_file: 'backend/src/services/agents/websiteConversionFlowAgent.ts',
    trigger_type: 'cron',
    schedule: '0 */12 * * *',
    category: 'website_intelligence',
    description:
      'Maps CTA destinations per page and validates expected conversion flows. Detects dead-end pages, missing expected paths, and circular navigation loops.',
  },
  {
    agent_name: 'WebsiteUXHeuristicAgent',
    agent_type: 'website_ux',
    module: 'websiteIntelligence',
    source_file: 'backend/src/services/agents/websiteUXHeuristicAgent.ts',
    trigger_type: 'cron',
    schedule: '0 0 * * *',
    category: 'website_intelligence',
    description:
      'Evaluates pages against UX heuristics: form field count, CTA density, heading hierarchy, word count, and content depth.',
  },
  {
    agent_name: 'WebsiteBehaviorAgent',
    agent_type: 'website_behavior',
    module: 'websiteIntelligence',
    source_file: 'backend/src/services/agents/websiteBehaviorAgent.ts',
    trigger_type: 'cron',
    schedule: '0 */12 * * *',
    category: 'website_intelligence',
    description:
      'Analyzes PageEvent data to detect low-traffic pages, form abandonment patterns, and engagement anomalies across the public website.',
  },
  {
    agent_name: 'WebsiteAutoRepairAgent',
    agent_type: 'website_repair',
    module: 'websiteIntelligence',
    source_file: 'backend/src/services/agents/websiteAutoRepairAgent.ts',
    trigger_type: 'event_driven',
    schedule: '',
    category: 'website_intelligence',
    description:
      'Processes open WebsiteIssue records. Routes through COO decision layer: auto-resolves high-confidence (>=0.95), COO approval (0.80-0.94), CEO review (<0.80).',
  },
  {
    agent_name: 'WebsiteImprovementStrategist',
    agent_type: 'website_strategist',
    module: 'websiteIntelligence',
    source_file: 'backend/src/services/agents/websiteImprovementStrategist.ts',
    trigger_type: 'cron',
    schedule: '0 0 * * *',
    category: 'website_intelligence',
    description:
      'Generates strategic improvement recommendations: missing social proof, weak CTA copy, absent trust signals, missing urgency, and SEO gaps.',
  },
];

/**
 * Seed the full agent registry (52 agents). Idempotent — uses findOrCreate
 * and updates existing rows with registry metadata.
 */
export async function seedAgentRegistry(): Promise<void> {
  for (const entry of AGENT_REGISTRY) {
    const [agent, created] = await AiAgent.findOrCreate({
      where: { agent_name: entry.agent_name },
      defaults: entry,
    });

    if (!created) {
      // Update registry fields on existing agents (preserves status, config, run stats)
      await agent.update({
        agent_type: entry.agent_type,
        module: entry.module,
        source_file: entry.source_file,
        trigger_type: entry.trigger_type,
        schedule: entry.schedule,
        category: entry.category,
        description: entry.description,
        // Only set config if it wasn't customized (still empty)
        ...(Object.keys(agent.config || {}).length === 0 && entry.config ? { config: entry.config } : {}),
      });
    } else {
      console.log(`[AI Ops] Registered agent: ${entry.agent_name}`);
    }
  }
}
