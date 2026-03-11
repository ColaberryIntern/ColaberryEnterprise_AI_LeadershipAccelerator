// ─── Impact Estimator Agent ──────────────────────────────────────────────────
// Predicts metric changes from proposed actions by querying past decision
// outcomes. Falls back to conservative 5-15% estimates.

import IntelligenceDecision from '../../models/IntelligenceDecision';
import { registerAgent } from './agentRegistry';
import type { ActionRecommendation } from './ActionPlannerAgent';
import type { DetectedProblem } from './ProblemDiscoveryAgent';
import { Op } from 'sequelize';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImpactEstimate {
  action: string;
  metric: string;
  current_value: number;
  predicted_value: number;
  change_pct: number;
  confidence: number; // 0-1
  basis: 'historical' | 'conservative_estimate';
}

// ─── Estimation Logic ────────────────────────────────────────────────────────

/**
 * Estimate the impact of a recommended action on relevant metrics.
 */
export async function estimateImpact(
  recommendation: ActionRecommendation,
  problem: DetectedProblem,
): Promise<ImpactEstimate> {
  // Try to find similar past decisions with recorded outcomes
  let historicalEstimate: ImpactEstimate | null = null;

  try {
    const pastDecisions = await IntelligenceDecision.findAll({
      where: {
        recommended_action: recommendation.action,
        execution_status: { [Op.in]: ['completed', 'monitoring'] },
        impact_after_24h: { [Op.ne]: null as any },
      },
      order: [['timestamp', 'DESC']],
      limit: 10,
    });

    if (pastDecisions.length >= 2) {
      // Average the recorded impacts
      let totalChange = 0;
      let count = 0;

      for (const d of pastDecisions) {
        const impact = d.get('impact_after_24h') as Record<string, any> | null;
        if (impact?.change_pct !== undefined) {
          totalChange += Number(impact.change_pct);
          count++;
        }
      }

      if (count > 0) {
        const avgChange = totalChange / count;
        const currentValue = problem.metrics?.current_value ?? 0;
        historicalEstimate = {
          action: recommendation.action,
          metric: problem.metrics?.metric || problem.type,
          current_value: currentValue,
          predicted_value: currentValue * (1 + avgChange / 100),
          change_pct: Math.round(avgChange * 10) / 10,
          confidence: Math.min(0.9, 0.5 + count * 0.05),
          basis: 'historical',
        };
      }
    }
  } catch {
    // Decision table may not exist yet
  }

  if (historicalEstimate) return historicalEstimate;

  // Fallback: conservative estimate based on action type
  const conservativeChanges: Record<string, number> = {
    update_campaign_config: 10,
    adjust_lead_scoring: 8,
    launch_ab_test: 5,
    pause_campaign: -15, // short-term negative, prevents further damage
    update_agent_config: 12,
    modify_agent_schedule: 7,
  };

  const changePct = conservativeChanges[recommendation.action] ?? 5;
  const currentValue = problem.metrics?.current_value ?? 0;

  return {
    action: recommendation.action,
    metric: problem.metrics?.metric || problem.type,
    current_value: currentValue,
    predicted_value: currentValue * (1 + changePct / 100),
    change_pct: changePct,
    confidence: 0.3,
    basis: 'conservative_estimate',
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'ImpactEstimatorAgent',
  category: 'operations',
  description: 'Predicts metric changes from proposed actions using historical outcomes',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    return {
      agent_name: 'ImpactEstimatorAgent',
      campaigns_processed: 0,
      actions_taken: [],
      errors: [],
      duration_ms: Date.now() - start,
    };
  },
});
