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
];

/**
 * Seed the full agent registry (16 agents). Idempotent — uses findOrCreate
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
