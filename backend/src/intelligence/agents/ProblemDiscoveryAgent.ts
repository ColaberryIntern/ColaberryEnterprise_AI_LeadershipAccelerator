// ─── Problem Discovery Agent ─────────────────────────────────────────────────
// Scans business metrics for anomalies, drops, spikes, and failures.
// Produces a list of detected problems for the autonomous engine to investigate.

import { sequelize } from '../../config/database';
import AiAgent from '../../models/AiAgent';
import { getVectorMemory } from '../memory/vectorMemory';
import { registerAgent } from './agentRegistry';
import type { AgentExecutionResult } from '../../services/agents/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DetectedProblem {
  type: 'kpi_anomaly' | 'conversion_drop' | 'error_spike' | 'engagement_decline' | 'agent_failure' | 'pipeline_bottleneck';
  severity: 'low' | 'medium' | 'high' | 'critical';
  entity_type?: string;
  entity_id?: string;
  description: string;
  metrics: Record<string, any>;
  detected_at: Date;
}

// ─── Detection Logic ─────────────────────────────────────────────────────────

/**
 * Scan for agent failures: agents with status='error' or high error rates.
 */
async function detectAgentFailures(): Promise<DetectedProblem[]> {
  const problems: DetectedProblem[] = [];

  const failedAgents = await AiAgent.findAll({
    where: { status: 'error', enabled: true },
    attributes: ['id', 'agent_name', 'error_count', 'last_error', 'last_error_at'],
  });

  for (const agent of failedAgents) {
    problems.push({
      type: 'agent_failure',
      severity: (agent.error_count || 0) > 5 ? 'high' : 'medium',
      entity_type: 'agent',
      entity_id: agent.id,
      description: `Agent "${agent.agent_name}" is in error state: ${agent.last_error || 'unknown'}`,
      metrics: {
        error_count: agent.error_count,
        last_error: agent.last_error,
        last_error_at: agent.last_error_at,
      },
      detected_at: new Date(),
    });
  }

  return problems;
}

/**
 * Scan for conversion drops: 48h conversion rate vs 7-day average.
 */
async function detectConversionDrops(): Promise<DetectedProblem[]> {
  const problems: DetectedProblem[] = [];

  try {
    const [results]: any = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '48 hours') AS recent_count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') / NULLIF(7, 0) AS daily_avg
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);

    if (results?.[0]) {
      const recent = Number(results[0].recent_count) || 0;
      const dailyAvg = Number(results[0].daily_avg) || 0;
      const expected48h = dailyAvg * 2;

      if (expected48h > 0 && recent < expected48h * 0.6) {
        const dropPct = Math.round((1 - recent / expected48h) * 100);
        problems.push({
          type: 'conversion_drop',
          severity: dropPct > 50 ? 'high' : 'medium',
          description: `Lead generation dropped ${dropPct}% in last 48h (${recent} vs expected ${Math.round(expected48h)})`,
          metrics: { recent_count: recent, expected: Math.round(expected48h), drop_pct: dropPct },
          detected_at: new Date(),
        });
      }
    }
  } catch {
    // Table may not exist — skip silently
  }

  return problems;
}

/**
 * Scan for error spikes in system processes (last hour vs rolling average).
 */
async function detectErrorSpikes(): Promise<DetectedProblem[]> {
  const problems: DetectedProblem[] = [];

  try {
    const [results]: any = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'error' AND updated_at >= NOW() - INTERVAL '1 hour') AS recent_errors,
        COUNT(*) FILTER (WHERE status = 'error' AND updated_at >= NOW() - INTERVAL '24 hours') / NULLIF(24, 0) AS hourly_avg
      FROM system_processes
      WHERE updated_at >= NOW() - INTERVAL '24 hours'
    `);

    if (results?.[0]) {
      const recentErrors = Number(results[0].recent_errors) || 0;
      const hourlyAvg = Number(results[0].hourly_avg) || 0;

      if (hourlyAvg > 0 && recentErrors > hourlyAvg * 3) {
        problems.push({
          type: 'error_spike',
          severity: recentErrors > hourlyAvg * 5 ? 'critical' : 'high',
          description: `Error spike: ${recentErrors} errors in last hour (avg: ${Math.round(hourlyAvg)}/hr)`,
          metrics: { recent_errors: recentErrors, hourly_avg: Math.round(hourlyAvg) },
          detected_at: new Date(),
        });
      }
    }
  } catch {
    // Table may not exist
  }

  return problems;
}

// ─── Main Discovery ──────────────────────────────────────────────────────────

/**
 * Run all detection checks and return unique problems.
 * Deduplicates against recent vector memory to avoid re-reporting known issues.
 */
export async function discoverProblems(): Promise<DetectedProblem[]> {
  const [agentFailures, conversionDrops, errorSpikes] = await Promise.allSettled([
    detectAgentFailures(),
    detectConversionDrops(),
    detectErrorSpikes(),
  ]);

  const allProblems: DetectedProblem[] = [
    ...(agentFailures.status === 'fulfilled' ? agentFailures.value : []),
    ...(conversionDrops.status === 'fulfilled' ? conversionDrops.value : []),
    ...(errorSpikes.status === 'fulfilled' ? errorSpikes.value : []),
  ];

  // Deduplicate against recent memory (last 2 hours)
  const memory = getVectorMemory();
  const deduped: DetectedProblem[] = [];

  for (const problem of allProblems) {
    try {
      const similar = await memory.search(problem.description, 'investigation', 1);
      const recentDuplicate = similar.length > 0 &&
        similar[0].similarity !== undefined &&
        similar[0].similarity > 0.9 &&
        Date.now() - similar[0].created_at.getTime() < 2 * 60 * 60 * 1000;

      if (!recentDuplicate) {
        deduped.push(problem);
      }
    } catch {
      // If memory search fails, include the problem anyway
      deduped.push(problem);
    }
  }

  return deduped;
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'ProblemDiscoveryAgent',
  category: 'operations',
  description: 'Scans for anomalies, conversion drops, error spikes, and agent failures',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const problems = await discoverProblems();
      return {
        agent_name: 'ProblemDiscoveryAgent',
        campaigns_processed: 0,
        entities_processed: problems.length,
        actions_taken: problems.map((p) => ({
          campaign_id: p.entity_id || 'system',
          action: `detected_${p.type}`,
          reason: p.description,
          confidence: p.severity === 'critical' ? 0.95 : p.severity === 'high' ? 0.85 : 0.7,
          before_state: null,
          after_state: null,
          result: 'success' as const,
          entity_type: (p.entity_type as any) || 'system',
          entity_id: p.entity_id,
        })),
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'ProblemDiscoveryAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
