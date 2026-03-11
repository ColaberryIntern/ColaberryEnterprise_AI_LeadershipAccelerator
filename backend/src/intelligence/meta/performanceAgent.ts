// ─── Performance Agent ───────────────────────────────────────────────────────
// Aggregates AiAgent run stats + AiAgentActivityLog into
// agent_performance_metrics. Identifies degrading trends.

import AiAgent from '../../models/AiAgent';
import AiAgentActivityLog from '../../models/AiAgentActivityLog';
import AgentPerformanceMetric from '../../models/AgentPerformanceMetric';
import { registerAgent } from '../agents/agentRegistry';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PerformanceSummary {
  agents_analyzed: number;
  metrics_created: number;
  degrading_agents: string[];
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Aggregate performance metrics for all agents over the last hour.
 */
export async function aggregatePerformanceMetrics(): Promise<PerformanceSummary> {
  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - 60 * 60 * 1000);
  const degradingAgents: string[] = [];
  let metricsCreated = 0;

  const agents = await AiAgent.findAll({
    where: { enabled: true },
    attributes: ['id', 'agent_name', 'run_count', 'avg_duration_ms', 'error_count'],
  });

  for (const agent of agents) {
    try {
      // Get activity logs for this period
      const logs = await AiAgentActivityLog.findAll({
        where: {
          agent_id: agent.id,
          created_at: { [Op.between]: [periodStart, periodEnd] },
        },
        attributes: ['result', 'duration_ms', 'details'],
      });

      if (logs.length === 0) continue;

      const successCount = logs.filter((l) => l.get('result') === 'success').length;
      const failureCount = logs.filter((l) => l.get('result') === 'failed').length;
      const skipCount = logs.filter((l) => l.get('result') === 'skipped').length;
      const durations = logs.map((l) => l.get('duration_ms') as number || 0).filter((d) => d > 0);

      const avgDuration = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

      // P95 duration
      const sorted = [...durations].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95Duration = sorted[p95Index] || avgDuration;

      const successRate = logs.length > 0 ? successCount / logs.length : 0;

      // Count total actions from details
      let totalActions = 0;
      let totalErrors = 0;
      for (const log of logs) {
        const details = log.get('details') as Record<string, any> | null;
        totalActions += details?.actions_taken || 0;
        totalErrors += details?.errors?.length || 0;
      }

      await AgentPerformanceMetric.create({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        period_start: periodStart,
        period_end: periodEnd,
        execution_count: logs.length,
        success_count: successCount,
        failure_count: failureCount,
        skip_count: skipCount,
        avg_duration_ms: avgDuration,
        p95_duration_ms: p95Duration,
        success_rate: Math.round(successRate * 1000) / 1000,
        total_actions: totalActions,
        total_errors: totalErrors,
      });

      metricsCreated++;

      // Detect degradation: compare with previous period
      const prevMetric = await AgentPerformanceMetric.findOne({
        where: {
          agent_name: agent.agent_name,
          period_end: { [Op.lt]: periodStart },
        },
        order: [['period_end', 'DESC']],
      });

      if (prevMetric) {
        const prevSuccessRate = prevMetric.get('success_rate') as number || 0;
        const prevAvgDuration = prevMetric.get('avg_duration_ms') as number || 0;

        // Degradation: success rate dropped >20% or duration increased >50%
        if (successRate < prevSuccessRate - 0.2) {
          degradingAgents.push(`${agent.agent_name}: success rate dropped from ${Math.round(prevSuccessRate * 100)}% to ${Math.round(successRate * 100)}%`);
        }
        if (prevAvgDuration > 0 && avgDuration > prevAvgDuration * 1.5) {
          degradingAgents.push(`${agent.agent_name}: duration increased from ${prevAvgDuration}ms to ${avgDuration}ms`);
        }
      }
    } catch (err: any) {
      console.warn(`[PerformanceAgent] Error processing ${agent.agent_name}:`, err?.message);
    }
  }

  if (degradingAgents.length > 0) {
    console.log(`[PerformanceAgent] Degrading agents: ${degradingAgents.join('; ')}`);
  }

  return {
    agents_analyzed: agents.length,
    metrics_created: metricsCreated,
    degrading_agents: degradingAgents,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'PerformanceAgent',
  category: 'meta',
  description: 'Aggregate agent performance metrics and detect degrading trends',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const summary = await aggregatePerformanceMetrics();
      return {
        agent_name: 'PerformanceAgent',
        campaigns_processed: 0,
        entities_processed: summary.agents_analyzed,
        actions_taken: summary.degrading_agents.map((d) => ({
          campaign_id: 'system',
          action: 'degradation_detected',
          reason: d,
          confidence: 0.8,
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
        agent_name: 'PerformanceAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
