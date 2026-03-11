import crypto from 'crypto';
import AiAgent from '../models/AiAgent';
import { scanAllCampaigns } from './campaignHealthScanner';
import { runCampaignRepairAgent } from './agents/campaignRepairAgent';
import { runContentOptimizationAgent } from './agents/contentOptimizationAgent';
import { runConversationOptimizationAgent } from './agents/conversationOptimizationAgent';
import { runOrchestrationHealthAgent } from './agents/orchestrationHealthAgent';
import { runStudentProgressMonitor } from './agents/studentProgressMonitor';
import { runPromptMonitorAgent } from './agents/promptMonitorAgent';
import { runOrchestrationAutoRepairAgent } from './agents/orchestrationAutoRepairAgent';
import { runCampaignQAAgent } from './agents/campaignQAAgent';
import { runCampaignSelfHealingAgent } from './agents/campaignSelfHealingAgent';
import { runApolloLeadIntelligenceAgent } from './agents/apolloLeadIntelligenceAgent';
import { logAiEvent, logAgentActivity } from './aiEventService';
import { seedAgentRegistry } from './agentRegistrySeed';
import type { AgentExecutionResult } from './agents/types';

// Re-export seedAgentRegistry for callers
export { seedAgentRegistry as seedAgents };

/**
 * Run health scans for all active campaigns.
 */
export async function runHealthScans(): Promise<void> {
  const agent = await AiAgent.findOne({ where: { agent_name: 'CampaignHealthScanner' } });
  const traceId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    if (agent) {
      if (!agent.enabled) {
        console.log('[AI Ops] CampaignHealthScanner is disabled, skipping');
        return;
      }
      await agent.update({ status: 'running', updated_at: new Date() });
    }

    const results = await scanAllCampaigns();

    if (agent) {
      const durationMs = Date.now() - startTime;
      const newAvg = agent.avg_duration_ms
        ? Math.round((agent.avg_duration_ms * agent.run_count + durationMs) / (agent.run_count + 1))
        : durationMs;

      await agent.update({
        status: 'idle',
        last_run_at: new Date(),
        run_count: agent.run_count + 1,
        avg_duration_ms: newAvg,
        last_result: {
          campaigns_scanned: results.length,
          healthy: results.filter((r) => r.status === 'healthy').length,
          degraded: results.filter((r) => r.status === 'degraded').length,
          critical: results.filter((r) => r.status === 'critical').length,
          duration_ms: durationMs,
          timestamp: new Date().toISOString(),
        },
        updated_at: new Date(),
      });

      await logAgentActivity({
        agent_id: agent.id,
        action: 'health_scan_completed',
        result: 'success',
        trace_id: traceId,
        duration_ms: durationMs,
        execution_context: { trigger: 'cron', schedule: agent.schedule },
        details: { campaigns_scanned: results.length },
      });
    }
  } catch (err: any) {
    console.error('[AI Ops] Health scan failed:', err.message);
    if (agent) {
      await agent.update({
        status: 'error',
        error_count: agent.error_count + 1,
        last_error: err.message,
        last_error_at: new Date(),
        updated_at: new Date(),
      });
    }
    await logAiEvent('orchestrator', 'health_scan_error', undefined, undefined, {
      error: err.message,
      trace_id: traceId,
    });
  }
}

/**
 * Run a specific agent by name, checking its status and enabled state first.
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

  if (!agent.enabled) {
    console.log(`[AI Ops] Agent ${agentName} is disabled, skipping`);
    return null;
  }

  if (agent.status === 'paused') {
    console.log(`[AI Ops] Agent ${agentName} is paused, skipping`);
    return null;
  }

  const traceId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    await agent.update({ status: 'running', updated_at: new Date() });

    const result = await executor(agent.id, agent.config || {});

    const durationMs = Date.now() - startTime;
    const newAvg = agent.avg_duration_ms
      ? Math.round((agent.avg_duration_ms * agent.run_count + durationMs) / (agent.run_count + 1))
      : durationMs;

    await agent.update({
      status: 'idle',
      last_run_at: new Date(),
      run_count: agent.run_count + 1,
      avg_duration_ms: newAvg,
      last_result: {
        campaigns_processed: result.campaigns_processed,
        actions_taken: result.actions_taken.length,
        errors: result.errors.length,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
      },
      updated_at: new Date(),
    });

    // Log the execution summary with trace — include full action details
    const actionSummary = result.actions_taken.length > 0
      ? `${result.actions_taken.length} action(s): ${[...new Set(result.actions_taken.map(a => a.action))].join(', ')}`
      : 'scan_completed_no_issues';

    await logAgentActivity({
      agent_id: agent.id,
      action: actionSummary,
      result: result.errors.length > 0 ? 'failed' : 'success',
      trace_id: traceId,
      duration_ms: durationMs,
      execution_context: {
        trigger: 'cron',
        schedule: agent.schedule,
        campaigns_processed: result.campaigns_processed,
      },
      details: {
        actions_taken: result.actions_taken.length,
        actions: result.actions_taken.slice(0, 50),
        errors: result.errors,
      },
    });

    if (result.actions_taken.length > 0 || result.errors.length > 0) {
      console.log(
        `[AI Ops] ${agentName}: ${result.campaigns_processed} campaigns, ` +
          `${result.actions_taken.length} actions, ${result.errors.length} errors ` +
          `(${durationMs}ms)`,
      );
    }

    return result;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    await agent.update({
      status: 'error',
      error_count: agent.error_count + 1,
      last_error: err.message,
      last_error_at: new Date(),
      updated_at: new Date(),
    });

    await logAgentActivity({
      agent_id: agent.id,
      action: 'agent_execution_failed',
      result: 'failed',
      trace_id: traceId,
      duration_ms: durationMs,
      execution_context: { trigger: 'cron', schedule: agent.schedule },
      stack_trace: err.stack || err.message,
    });

    console.error(`[AI Ops] ${agentName} failed:`, err.message);
    await logAiEvent('orchestrator', 'agent_error', 'agent', agent.id, {
      agent_name: agentName,
      error: err.message,
      trace_id: traceId,
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

/**
 * Run the Orchestration Health Agent.
 */
export async function runOrchestrationHealth(): Promise<AgentExecutionResult | null> {
  return runAgent('OrchestrationHealthAgent', runOrchestrationHealthAgent);
}

/**
 * Run the Student Progress Monitor.
 */
export async function runStudentProgress(): Promise<AgentExecutionResult | null> {
  return runAgent('StudentProgressMonitor', runStudentProgressMonitor);
}

/**
 * Run the Prompt Monitor Agent.
 */
export async function runPromptMonitor(): Promise<AgentExecutionResult | null> {
  return runAgent('PromptMonitorAgent', runPromptMonitorAgent);
}

/**
 * Run the Orchestration Auto-Repair Agent.
 */
export async function runOrchestrationRepair(): Promise<AgentExecutionResult | null> {
  return runAgent('OrchestrationAutoRepairAgent', runOrchestrationAutoRepairAgent);
}

/**
 * Run the Campaign QA Agent.
 */
export async function runCampaignQA(): Promise<AgentExecutionResult | null> {
  return runAgent('CampaignQAAgent', runCampaignQAAgent);
}

/**
 * Run the Campaign Self-Healing Agent.
 */
export async function runSelfHealing(): Promise<AgentExecutionResult | null> {
  return runAgent('CampaignSelfHealingAgent', runCampaignSelfHealingAgent);
}

/**
 * Run the Apollo Lead Intelligence Agent.
 */
export async function runLeadIntelligence(): Promise<AgentExecutionResult | null> {
  return runAgent('ApolloLeadIntelligenceAgent', runApolloLeadIntelligenceAgent);
}
