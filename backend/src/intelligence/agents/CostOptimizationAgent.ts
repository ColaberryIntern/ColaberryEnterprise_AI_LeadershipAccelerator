// ─── Cost Optimization Agent ─────────────────────────────────────────────────
// Analyzes agent efficiency: identifies agents with high run_count but low
// action_rate, long durations, or high error rates.

import AiAgent from '../../models/AiAgent';
import { registerAgent } from './agentRegistry';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CostInsight {
  inefficient_agents: AgentEfficiency[];
  total_compute_minutes: number;
  recommendations: string[];
}

interface AgentEfficiency {
  agent_name: string;
  run_count: number;
  avg_duration_ms: number;
  error_rate: number;
  action_rate: number; // actions per run
  issue: string;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/**
 * Identify cost optimization opportunities across the agent fleet.
 */
export async function analyzeCostEfficiency(): Promise<CostInsight> {
  const inefficientAgents: AgentEfficiency[] = [];
  const recommendations: string[] = [];
  let totalComputeMinutes = 0;

  const agents = await AiAgent.findAll({
    where: { enabled: true },
    attributes: ['agent_name', 'run_count', 'avg_duration_ms', 'error_count', 'last_result'],
  });

  for (const agent of agents) {
    const runCount = agent.run_count || 0;
    const avgDuration = agent.avg_duration_ms || 0;
    const errorCount = agent.error_count || 0;
    const lastResult = agent.last_result as Record<string, any> | null;

    totalComputeMinutes += (runCount * avgDuration) / 60000;

    if (runCount < 5) continue; // Not enough data

    const errorRate = runCount > 0 ? errorCount / runCount : 0;
    const actionsPerRun = lastResult?.actions_taken ?? 0;

    // High error rate (>20%)
    if (errorRate > 0.2) {
      inefficientAgents.push({
        agent_name: agent.agent_name,
        run_count: runCount,
        avg_duration_ms: avgDuration,
        error_rate: Math.round(errorRate * 100) / 100,
        action_rate: actionsPerRun,
        issue: `High error rate: ${Math.round(errorRate * 100)}%`,
      });
    }

    // High run count but no actions (>80% idle runs)
    if (runCount > 20 && actionsPerRun === 0) {
      inefficientAgents.push({
        agent_name: agent.agent_name,
        run_count: runCount,
        avg_duration_ms: avgDuration,
        error_rate: Math.round(errorRate * 100) / 100,
        action_rate: 0,
        issue: 'High run count with zero actions — consider reducing frequency',
      });
    }

    // Slow execution (>30s average)
    if (avgDuration > 30000) {
      inefficientAgents.push({
        agent_name: agent.agent_name,
        run_count: runCount,
        avg_duration_ms: avgDuration,
        error_rate: Math.round(errorRate * 100) / 100,
        action_rate: actionsPerRun,
        issue: `Slow execution: ${Math.round(avgDuration / 1000)}s average`,
      });
    }
  }

  if (inefficientAgents.length > 0) {
    recommendations.push(`${inefficientAgents.length} agent(s) flagged for efficiency review`);
  }
  if (totalComputeMinutes > 60) {
    recommendations.push(`Total agent compute: ${Math.round(totalComputeMinutes)} minutes — consider schedule optimization`);
  }

  return {
    inefficient_agents: inefficientAgents,
    total_compute_minutes: Math.round(totalComputeMinutes * 10) / 10,
    recommendations,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'CostOptimizationAgent',
  category: 'strategy',
  description: 'Agent fleet efficiency analysis and cost optimization',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const insight = await analyzeCostEfficiency();
      return {
        agent_name: 'CostOptimizationAgent',
        campaigns_processed: 0,
        entities_processed: insight.inefficient_agents.length,
        actions_taken: insight.recommendations.map((r) => ({
          campaign_id: 'system',
          action: 'cost_recommendation',
          reason: r,
          confidence: 0.75,
          before_state: null,
          after_state: null,
          result: 'success' as const,
          entity_type: 'system' as const,
        })),
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'CostOptimizationAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
