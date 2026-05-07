/**
 * remediationGovernanceInsights — generates 5 insight categories that
 * give operators a remediation governance view across clusters and
 * outcomes. Read-only — no policy mutation.
 *
 * Categories:
 *   - recurring_unstable_clusters: signatures recurring AND with low
 *     average effectiveness
 *   - high_confidence_chains: cluster_signatures with sustained high
 *     confidence over recent window (consider auto-applying remediation)
 *   - high_risk_ux_zones: page_routes with the most cluster activity
 *     in the window (regardless of resolution)
 *   - low_success_patterns: prompt_target × cluster_type combos with
 *     very low avg_score
 *   - regression_heavy_workflows: page_routes where regressions
 *     dominate resolutions
 *
 * Phase 11 §K.
 */

import { detectRegressionPronePatterns } from './regressionProneFixDetector';
import { aggregateUXOutcomes } from './remediationEffectivenessAnalyzer';
import { learnRemediationStrategies } from './remediationStrategyLearner';

export interface UnstableCluster {
  cluster_signature: string;
  cluster_type: string;
  recurrence_count: number;
  avg_score: number;
  recommended_action: string;
}

export interface HighConfidenceChain {
  cluster_signature: string;
  cluster_type: string;
  sustained_score: number;
  occurrence_count: number;
  recommended_action: string;
}

export interface UXRiskZone {
  page_route: string;
  cluster_count: number;
  total_outcomes: number;
  worst_cluster_type: string;
  recommended_action: string;
}

export interface LowSuccessPattern {
  cluster_type: string;
  prompt_target: string;
  avg_score: number;
  attempts: number;
  recommended_action: string;
}

export interface RegressionHeavyWorkflow {
  page_route: string;
  regression_count: number;
  resolution_count: number;
  ratio: number;
  recommended_action: string;
}

export interface RemediationGovernanceInsights {
  recurring_unstable_clusters: ReadonlyArray<UnstableCluster>;
  high_confidence_chains: ReadonlyArray<HighConfidenceChain>;
  high_risk_ux_zones: ReadonlyArray<UXRiskZone>;
  low_success_patterns: ReadonlyArray<LowSuccessPattern>;
  regression_heavy_workflows: ReadonlyArray<RegressionHeavyWorkflow>;
  generated_at: string;
}

export async function generateGovernanceInsights(opts: {
  project_id?: string;
  window_days?: number;
}): Promise<RemediationGovernanceInsights> {
  const window = opts.window_days ?? 30;
  const generated_at = new Date().toISOString();

  const [regression, aggregate, strategies] = await Promise.all([
    detectRegressionPronePatterns({ project_id: opts.project_id, lookback_days: window }),
    aggregateUXOutcomes({ project_id: opts.project_id, since_days: window }),
    learnRemediationStrategies({ project_id: opts.project_id, window_days: window }),
  ]);

  const recurring_unstable_clusters: UnstableCluster[] = regression.patterns
    .filter(p => (aggregate.historical_success_rate_by_type[p.cluster_type] ?? 50) < 50)
    .map(p => ({
      cluster_signature: p.cluster_signature,
      cluster_type: p.cluster_type,
      recurrence_count: p.recurrence_count,
      avg_score: aggregate.historical_success_rate_by_type[p.cluster_type] ?? 0,
      recommended_action: p.recommended_alternative,
    }));

  const high_confidence_chains: HighConfidenceChain[] = strategies.per_cluster_type
    .filter(c => (c.best_strategy?.avg_score ?? 0) >= 75)
    .map(c => ({
      cluster_signature: `${c.cluster_type}:*`,
      cluster_type: c.cluster_type,
      sustained_score: c.best_strategy!.avg_score,
      occurrence_count: c.best_strategy!.attempts,
      recommended_action: `Consider standardizing on ${c.best_strategy!.key.prompt_target} for ${c.cluster_type} clusters.`,
    }));

  const ux_zone_data = await aggregateOutcomesByRoute(opts.project_id, window);
  const high_risk_ux_zones: UXRiskZone[] = ux_zone_data
    .filter(z => z.total_outcomes >= 3)
    .sort((a, b) => b.cluster_count - a.cluster_count)
    .slice(0, 10)
    .map(z => ({
      page_route: z.page_route,
      cluster_count: z.cluster_count,
      total_outcomes: z.total_outcomes,
      worst_cluster_type: z.worst_cluster_type,
      recommended_action: `Audit ${z.page_route}: ${z.cluster_count} distinct clusters detected, dominant type ${z.worst_cluster_type}.`,
    }));

  const low_success_patterns: LowSuccessPattern[] = [];
  for (const ct of strategies.per_cluster_type) {
    for (const obs of ct.all_observed) {
      if (obs.attempts >= 3 && obs.avg_score < 40) {
        low_success_patterns.push({
          cluster_type: obs.key.cluster_type,
          prompt_target: obs.key.prompt_target,
          avg_score: obs.avg_score,
          attempts: obs.attempts,
          recommended_action: obs.recommendation,
        });
      }
    }
  }

  const regression_heavy_workflows: RegressionHeavyWorkflow[] = ux_zone_data
    .filter(z => z.regression_count > z.resolution_count && z.regression_count >= 2)
    .map(z => ({
      page_route: z.page_route,
      regression_count: z.regression_count,
      resolution_count: z.resolution_count,
      ratio: z.resolution_count > 0 ? Math.round((z.regression_count / z.resolution_count) * 100) / 100 : Infinity,
      recommended_action: `Pause autonomous remediation on ${z.page_route} — regressions outpace resolutions ${z.regression_count}:${z.resolution_count}.`,
    }));

  return {
    recurring_unstable_clusters,
    high_confidence_chains,
    high_risk_ux_zones,
    low_success_patterns,
    regression_heavy_workflows,
    generated_at,
  };
}

interface RouteAggregate {
  page_route: string;
  cluster_count: number;
  total_outcomes: number;
  worst_cluster_type: string;
  resolution_count: number;
  regression_count: number;
}

async function aggregateOutcomesByRoute(projectId: string | undefined, windowDays: number): Promise<RouteAggregate[]> {
  try {
    const { Op } = await import('sequelize');
    const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
    const { default: UIElementFeedback } = await import('../../../models/UIElementFeedback');
    const since = new Date(Date.now() - windowDays * 86400 * 1000);
    const where: any = { observed_at: { [Op.gte]: since } };
    if (projectId) where.project_id = projectId;
    const rows: any[] = await UXRemediationOutcome.findAll({ where });
    if (rows.length === 0) return [];
    // Resolve route per capability_id by joining the most recent feedback row
    const routeByCap = new Map<string, string>();
    const capIds = Array.from(new Set(rows.map(r => r.capability_id)));
    if (capIds.length > 0) {
      const fb: any[] = await UIElementFeedback.findAll({
        where: { capability_id: { [Op.in]: capIds } },
        order: [['created_at', 'DESC']],
      });
      for (const f of fb) {
        if (!routeByCap.has(f.capability_id) && f.page_route) routeByCap.set(f.capability_id, f.page_route);
      }
    }
    const byRoute = new Map<string, { signatures: Set<string>; total: number; types: Map<string, number>; resolved: number; regressed: number }>();
    for (const r of rows) {
      const route = routeByCap.get(r.capability_id) || 'unknown';
      const slot = byRoute.get(route) || { signatures: new Set<string>(), total: 0, types: new Map<string, number>(), resolved: 0, regressed: 0 };
      slot.signatures.add(r.cluster_signature);
      slot.total++;
      slot.types.set(r.cluster_type, (slot.types.get(r.cluster_type) || 0) + 1);
      slot.resolved += r.issues_resolved_count || 0;
      slot.regressed += r.issues_regressed_count || 0;
      byRoute.set(route, slot);
    }
    return Array.from(byRoute.entries()).map(([page_route, slot]) => {
      const worst = Array.from(slot.types.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      return {
        page_route,
        cluster_count: slot.signatures.size,
        total_outcomes: slot.total,
        worst_cluster_type: worst,
        resolution_count: slot.resolved,
        regression_count: slot.regressed,
      };
    });
  } catch (err: any) {
    console.warn('[remediationGovernanceInsights] route aggregation failed:', err?.message);
    return [];
  }
}
