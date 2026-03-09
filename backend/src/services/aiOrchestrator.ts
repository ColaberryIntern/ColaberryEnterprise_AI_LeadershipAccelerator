import AiAgent from '../models/AiAgent';
import { scanAllCampaigns } from './campaignHealthScanner';
import { runCampaignRepairAgent } from './agents/campaignRepairAgent';
import { runContentOptimizationAgent } from './agents/contentOptimizationAgent';
import { runConversationOptimizationAgent } from './agents/conversationOptimizationAgent';
import { logAiEvent } from './aiEventService';
import type { AgentExecutionResult } from './agents/types';

/**
 * Seed the 3 AI agent records on first run (idempotent).
 */
export async function seedAgents(): Promise<void> {
  const agents = [
    {
      agent_name: 'CampaignRepairAgent',
      agent_type: 'repair' as const,
      config: {
        auto_retry_enabled: true,
        max_retry_attempts: 3,
        retry_delay_minutes: 30,
        auto_resolve_stale_days: 7,
      },
    },
    {
      agent_name: 'ContentOptimizationAgent',
      agent_type: 'content_optimization' as const,
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
      agent_type: 'conversation_optimization' as const,
      config: {
        auto_enhance_enabled: true,
        max_auto_actions_per_hour: 5,
        dropoff_threshold: 0.80,
        min_sent_per_step: 5,
        cooldown_minutes: 1440,
      },
    },
  ];

  for (const agent of agents) {
    const [, created] = await AiAgent.findOrCreate({
      where: { agent_name: agent.agent_name },
      defaults: agent,
    });
    if (created) {
      console.log(`[AI Ops] Seeded agent: ${agent.agent_name}`);
    }
  }
}

/**
 * Run health scans for all active campaigns.
 */
export async function runHealthScans(): Promise<void> {
  try {
    await scanAllCampaigns();
  } catch (err: any) {
    console.error('[AI Ops] Health scan failed:', err.message);
    await logAiEvent('orchestrator', 'health_scan_error', undefined, undefined, {
      error: err.message,
    });
  }
}

/**
 * Run a specific agent by name, checking its status first.
 */
async function runAgent(
  agentName: string,
  executor: (agentId: string, config: Record<string, any>) => Promise<AgentExecutionResult>,
): Promise<AgentExecutionResult | null> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) {
    console.error(`[AI Ops] Agent not found: ${agentName}`);
    return null;
  }

  if (agent.status === 'paused') {
    console.log(`[AI Ops] Agent ${agentName} is paused, skipping`);
    return null;
  }

  try {
    await agent.update({ status: 'running', updated_at: new Date() });

    const result = await executor(agent.id, agent.config || {});

    await agent.update({
      status: 'idle',
      last_run_at: new Date(),
      last_result: {
        campaigns_processed: result.campaigns_processed,
        actions_taken: result.actions_taken.length,
        errors: result.errors.length,
        duration_ms: result.duration_ms,
        timestamp: new Date().toISOString(),
      },
      updated_at: new Date(),
    });

    if (result.actions_taken.length > 0 || result.errors.length > 0) {
      console.log(
        `[AI Ops] ${agentName}: ${result.campaigns_processed} campaigns, ` +
          `${result.actions_taken.length} actions, ${result.errors.length} errors ` +
          `(${result.duration_ms}ms)`,
      );
    }

    return result;
  } catch (err: any) {
    await agent.update({ status: 'error', updated_at: new Date() });
    console.error(`[AI Ops] ${agentName} failed:`, err.message);
    await logAiEvent('orchestrator', 'agent_error', 'agent', agent.id, {
      agent_name: agentName,
      error: err.message,
    });
    return null;
  }
}

/**
 * Run the Campaign Repair Agent.
 */
export async function runRepairAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('CampaignRepairAgent', runCampaignRepairAgent);
}

/**
 * Run the Content Optimization Agent.
 */
export async function runContentOptimization(): Promise<AgentExecutionResult | null> {
  return runAgent('ContentOptimizationAgent', runContentOptimizationAgent);
}

/**
 * Run the Conversation Optimization Agent.
 */
export async function runConversationOptimization(): Promise<AgentExecutionResult | null> {
  return runAgent('ConversationOptimizationAgent', runConversationOptimizationAgent);
}
