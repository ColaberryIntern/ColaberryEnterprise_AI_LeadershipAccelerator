// ─── Revenue Optimization Agent ──────────────────────────────────────────────
// Analyzes the lead → enrollment conversion funnel and identifies bottlenecks.
// Prioritizes problems by estimated revenue impact.

import { sequelize } from '../../config/database';
import { registerAgent } from './agentRegistry';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FunnelStage {
  stage: string;
  count: number;
  conversion_rate: number; // 0-100
}

export interface RevenueInsight {
  funnel_stages: FunnelStage[];
  bottleneck: string | null;
  estimated_revenue_at_risk: number;
  recommendations: string[];
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/**
 * Analyze the conversion funnel and identify revenue optimization opportunities.
 */
export async function analyzeRevenueFunnel(): Promise<RevenueInsight> {
  const stages: FunnelStage[] = [];
  let bottleneck: string | null = null;
  let revenueAtRisk = 0;
  const recommendations: string[] = [];

  try {
    // Count leads by status to build funnel
    const [results]: any = await sequelize.query(`
      SELECT status, COUNT(*) as count
      FROM leads
      GROUP BY status
      ORDER BY count DESC
    `);

    if (results && results.length > 0) {
      const total = results.reduce((sum: number, r: any) => sum + Number(r.count), 0);

      for (const row of results) {
        const count = Number(row.count);
        stages.push({
          stage: row.status || 'unknown',
          count,
          conversion_rate: total > 0 ? Math.round((count / total) * 100) : 0,
        });
      }

      // Find the biggest drop-off between funnel stages
      // Expected funnel: new → contacted → qualified → enrolled
      const funnelOrder = ['new', 'contacted', 'qualified', 'enrolled', 'converted'];
      const orderedStages = funnelOrder
        .map((s) => stages.find((st) => st.stage.toLowerCase().includes(s)))
        .filter(Boolean) as FunnelStage[];

      let worstDropoff = 0;
      for (let i = 1; i < orderedStages.length; i++) {
        if (orderedStages[i - 1].count > 0) {
          const dropoff = 1 - orderedStages[i].count / orderedStages[i - 1].count;
          if (dropoff > worstDropoff) {
            worstDropoff = dropoff;
            bottleneck = `${orderedStages[i - 1].stage} → ${orderedStages[i].stage} (${Math.round(dropoff * 100)}% drop)`;
          }
        }
      }

      if (bottleneck && worstDropoff > 0.7) {
        recommendations.push(`Focus on ${bottleneck} — significant conversion bottleneck`);
        revenueAtRisk = Math.round(total * worstDropoff * 0.1); // rough estimate
      }
    }
  } catch {
    // Table may not exist
  }

  // General recommendations based on funnel shape
  if (stages.length > 0 && stages[0].count > 100 && stages.length < 3) {
    recommendations.push('Funnel has few stages — consider adding qualification steps');
  }

  return {
    funnel_stages: stages,
    bottleneck,
    estimated_revenue_at_risk: revenueAtRisk,
    recommendations,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'RevenueOptimizationAgent',
  category: 'strategy',
  description: 'Lead → enrollment conversion funnel analysis and revenue optimization',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const insight = await analyzeRevenueFunnel();
      return {
        agent_name: 'RevenueOptimizationAgent',
        campaigns_processed: 0,
        actions_taken: insight.recommendations.map((r) => ({
          campaign_id: 'system',
          action: 'revenue_recommendation',
          reason: r,
          confidence: 0.7,
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
        agent_name: 'RevenueOptimizationAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
