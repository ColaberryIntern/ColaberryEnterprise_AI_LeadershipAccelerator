// ─── Audit Agent ─────────────────────────────────────────────────────────────
// Daily audit: verifies decisions have monitor results, computes success rates,
// and stores a summary for governance reporting.

import IntelligenceDecision from '../../models/IntelligenceDecision';
import { getVectorMemory } from '../memory/vectorMemory';
import { batchLearnFromDecisions } from '../memory/learningEngine';
import { registerAgent } from './agentRegistry';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditSummary {
  period: string;
  total_decisions: number;
  executed: number;
  completed: number;
  rolled_back: number;
  failed: number;
  proposed_pending: number;
  success_rate: number;
  avg_risk_score: number;
  avg_confidence_score: number;
  missing_monitor_results: number;
  actions_breakdown: Record<string, number>;
}

// ─── Audit Logic ─────────────────────────────────────────────────────────────

/**
 * Run a daily audit of all autonomous decisions.
 */
export async function runDailyAudit(): Promise<AuditSummary> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const period = since.toISOString().slice(0, 10);

  // Count decisions by status
  const statusCounts: any[] = await sequelize.query(
    `SELECT execution_status, COUNT(*) as count
     FROM intelligence_decisions
     WHERE timestamp >= :since
     GROUP BY execution_status`,
    { replacements: { since }, type: 'SELECT' as any },
  ).catch(() => []);

  const counts: Record<string, number> = {};
  for (const row of (statusCounts as any[])) {
    counts[row.execution_status] = Number(row.count);
  }

  const totalDecisions = Object.values(counts).reduce((a, b) => a + b, 0);
  const executed = (counts.executed || 0) + (counts.monitoring || 0) + (counts.completed || 0) + (counts.rolled_back || 0);
  const completed = counts.completed || 0;
  const rolledBack = counts.rolled_back || 0;
  const failed = counts.failed || 0;
  const proposedPending = counts.proposed || 0;
  const successRate = executed > 0 ? Math.round((completed / executed) * 100) : 0;

  // Average scores
  const scores: any[] = await sequelize.query(
    `SELECT AVG(risk_score) as avg_risk, AVG(confidence_score) as avg_confidence
     FROM intelligence_decisions
     WHERE timestamp >= :since`,
    { replacements: { since }, type: 'SELECT' as any },
  ).catch(() => []);

  const avgRiskScore = Math.round(Number(scores[0]?.avg_risk) || 0);
  const avgConfidenceScore = Math.round(Number(scores[0]?.avg_confidence) || 0);

  // Check for missing monitor results
  const missingMonitor: number = await (IntelligenceDecision.count({
    where: {
      execution_status: 'monitoring',
      monitor_results: null as any,
      executed_at: { [Op.lte]: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
  }) as Promise<number>).catch(() => 0);

  // Action breakdown
  const actionCounts: any[] = await sequelize.query(
    `SELECT recommended_action, COUNT(*) as count
     FROM intelligence_decisions
     WHERE timestamp >= :since AND recommended_action IS NOT NULL
     GROUP BY recommended_action`,
    { replacements: { since }, type: 'SELECT' as any },
  ).catch(() => []);

  const actionsBreakdown: Record<string, number> = {};
  for (const row of (actionCounts as any[])) {
    actionsBreakdown[row.recommended_action] = Number(row.count);
  }

  const summary: AuditSummary = {
    period,
    total_decisions: totalDecisions,
    executed,
    completed,
    rolled_back: rolledBack,
    failed,
    proposed_pending: proposedPending,
    success_rate: successRate,
    avg_risk_score: avgRiskScore,
    avg_confidence_score: avgConfidenceScore,
    missing_monitor_results: missingMonitor,
    actions_breakdown: actionsBreakdown,
  };

  // Store audit summary in vector memory
  try {
    const memory = getVectorMemory();
    await memory.store('insight', `Daily Audit ${period}: ${totalDecisions} decisions, ${successRate}% success rate, avg risk ${avgRiskScore}`, {
      type: 'daily_audit',
      ...summary,
    });
  } catch {
    // Non-critical
  }

  // Batch learn from completed decisions
  try {
    await batchLearnFromDecisions();
  } catch {
    // Non-critical
  }

  console.log(`[AuditAgent] Daily audit: ${totalDecisions} decisions, ${successRate}% success, ${missingMonitor} missing monitors`);

  return summary;
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'AuditAgent',
  category: 'operations',
  description: 'Daily decision audit with success rate tracking and governance reporting',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const summary = await runDailyAudit();
      return {
        agent_name: 'AuditAgent',
        campaigns_processed: 0,
        entities_processed: summary.total_decisions,
        actions_taken: [{
          campaign_id: 'system',
          action: 'daily_audit',
          reason: `Audited ${summary.total_decisions} decisions: ${summary.success_rate}% success rate`,
          confidence: 1,
          before_state: null,
          after_state: summary as any,
          result: 'success' as const,
          entity_type: 'system' as const,
        }],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'AuditAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
