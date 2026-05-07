/**
 * confidenceEvolutionTracker — turns per-cluster confidence over time into
 * two surfaces: value drift (computed on the fly) + tier transitions
 * (persisted in RemediationTierTransition for durable signal).
 *
 * Why split: tier transitions are durable events ("low → moderate") the UI
 * can celebrate or warn on. Value drift is volatile — useful for the
 * engine to measure recent direction but not worth persisting because it
 * ages out daily.
 *
 * Phase 11 §I.
 */

import { computeRemediationConfidence, type RemediationConfidence } from './remediationConfidenceEngine';
import { aggregateUXOutcomes } from './remediationEffectivenessAnalyzer';

export interface ConfidenceDriftPoint {
  observed_at: string;       // ISO
  confidence: number;        // 0-100
  tier: 'low' | 'moderate' | 'high';
}

export interface ClusterConfidenceEvolution {
  cluster_signature: string;
  current: RemediationConfidence;
  /** value drift from oldest in window to current. Positive = improved. */
  value_drift: number;
  /** Series points across the window — used by the frontend to draw a sparkline. */
  series: ReadonlyArray<ConfidenceDriftPoint>;
  /** Persisted tier transitions for this signature in window. */
  tier_transitions: ReadonlyArray<{ from_tier: string; to_tier: string; recorded_at: string; trigger: string }>;
}

const DEFAULT_WINDOW_DAYS = 7;
const MAX_SERIES_POINTS = 30;

/**
 * Compute current confidence + drift for a single cluster signature.
 * Reads UXRemediationOutcome rows in the window, derives a confidence
 * series, computes drift, returns transitions.
 */
export async function trackClusterConfidence(opts: {
  project_id: string;
  cluster_signature: string;
  window_days?: number;
}): Promise<ClusterConfidenceEvolution> {
  const window = opts.window_days ?? DEFAULT_WINDOW_DAYS;
  const series = await deriveConfidenceSeries(opts.project_id, opts.cluster_signature, window);
  const transitions = await loadTierTransitions(opts.project_id, opts.cluster_signature, window);

  const current = series.length > 0
    ? { confidence: series[series.length - 1].confidence, tier: series[series.length - 1].tier, reasons: [], contributions: {} } as any
    : computeRemediationConfidence({
        historical_success_rate: 50, regression_risk: 30,
        cognition_stability: 50, behavioral_improvement: 50, unresolved_related_count: 0,
      });

  const value_drift = series.length >= 2
    ? series[series.length - 1].confidence - series[0].confidence
    : 0;

  return {
    cluster_signature: opts.cluster_signature,
    current,
    value_drift,
    series,
    tier_transitions: transitions,
  };
}

/**
 * Recompute confidence after an outcome is recorded; if the tier changed
 * vs the most recent tier in our log, persist a new transition row.
 *
 * Called from recordPhase10_5Outcomes immediately after the outcome row
 * is written.
 */
export async function recordConfidenceRecompute(opts: {
  project_id: string;
  cluster_signature: string;
  trigger: string;
  current_confidence: RemediationConfidence;
}): Promise<{ transition_recorded: boolean }> {
  try {
    const { default: RemediationTierTransition } = await import('../../../models/RemediationTierTransition');
    const last: any = await RemediationTierTransition.findOne({
      where: { project_id: opts.project_id, cluster_signature: opts.cluster_signature },
      order: [['recorded_at', 'DESC']],
    });
    const lastTier = last?.to_tier || null;
    if (lastTier === opts.current_confidence.tier) {
      return { transition_recorded: false };
    }
    await RemediationTierTransition.create({
      project_id: opts.project_id,
      cluster_signature: opts.cluster_signature,
      from_tier: lastTier || 'unknown',
      to_tier: opts.current_confidence.tier,
      confidence_value: opts.current_confidence.confidence,
      trigger: opts.trigger,
      recorded_at: new Date(),
    } as any);
    return { transition_recorded: true };
  } catch (err: any) {
    console.warn('[confidenceEvolutionTracker] transition write failed:', err?.message);
    return { transition_recorded: false };
  }
}

async function deriveConfidenceSeries(projectId: string, signature: string, windowDays: number): Promise<ConfidenceDriftPoint[]> {
  try {
    const { Op } = await import('sequelize');
    const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
    const since = new Date(Date.now() - windowDays * 86400 * 1000);
    const rows: any[] = await UXRemediationOutcome.findAll({
      where: { project_id: projectId, cluster_signature: signature, observed_at: { [Op.gte]: since } },
      order: [['observed_at', 'ASC']],
      limit: MAX_SERIES_POINTS,
    });
    const cumulative: ConfidenceDriftPoint[] = [];
    let runningSuccess = 50; // baseline
    let runningRegression = 30;
    let n = 0;
    for (const r of rows) {
      n++;
      const sample = r.issues_resolved_count > 0 && r.issues_regressed_count === 0 ? 90 : 30;
      runningSuccess = (runningSuccess * (n - 1) + sample) / n;
      runningRegression = r.issues_regressed_count > 0
        ? Math.min(95, runningRegression + 8)
        : Math.max(5, runningRegression - 1);
      const conf = computeRemediationConfidence({
        historical_success_rate: runningSuccess,
        regression_risk: runningRegression,
        cognition_stability: r.cognition_delta != null ? Math.max(0, Math.min(100, 50 + r.cognition_delta)) : 50,
        behavioral_improvement: r.ux_debt_delta != null ? Math.max(0, Math.min(100, 50 + r.ux_debt_delta)) : 50,
        unresolved_related_count: 0,
      });
      cumulative.push({
        observed_at: new Date(r.observed_at).toISOString(),
        confidence: conf.confidence,
        tier: conf.tier,
      });
    }
    return cumulative;
  } catch (err: any) {
    console.warn('[confidenceEvolutionTracker] series derivation failed:', err?.message);
    return [];
  }
}

async function loadTierTransitions(projectId: string, signature: string, windowDays: number): Promise<Array<{ from_tier: string; to_tier: string; recorded_at: string; trigger: string }>> {
  try {
    const { Op } = await import('sequelize');
    const { default: RemediationTierTransition } = await import('../../../models/RemediationTierTransition');
    const since = new Date(Date.now() - windowDays * 86400 * 1000);
    const rows: any[] = await RemediationTierTransition.findAll({
      where: { project_id: projectId, cluster_signature: signature, recorded_at: { [Op.gte]: since } },
      order: [['recorded_at', 'ASC']],
    });
    return rows.map(r => ({
      from_tier: r.from_tier,
      to_tier: r.to_tier,
      recorded_at: new Date(r.recorded_at).toISOString(),
      trigger: r.trigger,
    }));
  } catch (err: any) {
    console.warn('[confidenceEvolutionTracker] transitions read failed:', err?.message);
    return [];
  }
}

// Avoid unused-import warning when DB isn't wired in dev
void aggregateUXOutcomes;
