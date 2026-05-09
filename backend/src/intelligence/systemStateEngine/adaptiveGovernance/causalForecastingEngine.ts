/**
 * causalForecastingEngine — Phase 17. Bounded heuristic projection of
 * causal stability signals over a ≤4-hour horizon.
 *
 * Architectural commitment (per Phase 17 stress-test + addendum):
 *   - This is HEURISTIC PROJECTION, NOT time-series ML.
 *   - Forecasts expose ForecastConfidenceBounds (low/high/range +
 *     uncertainty drivers) so the dashboard never shows false precision.
 *   - Horizon is hard-capped at MAX_FORECAST_HORIZON_MS (4h).
 *   - Inputs are observed trajectories from in-memory + audit-row
 *     summaries; nothing is generated/imagined.
 *
 * Five signals (per the addendum):
 *   - rollback_rate_trend
 *   - validator_divergence_trend
 *   - trust_decay_trajectory
 *   - contradiction_amplification_trend
 *   - arbitration_instability_projection
 *
 * Every entry has a `direction` ('improving' / 'flat' / 'degrading')
 * and a deterministic rationale string.
 */

import type {
  CausalStabilityForecast, CausalStabilityForecastEntry,
  ForecastConfidenceBounds, ForecastSignal,
} from './adaptiveGovernanceTypes';
import { MAX_FORECAST_HORIZON_MS } from './adaptiveGovernanceTypes';

export interface BuildForecastInput {
  readonly project_id: string;
  /** Horizon in milliseconds; clamped to [0, MAX_FORECAST_HORIZON_MS]. */
  readonly horizon_ms?: number;
  /** Observed signals at evaluation time. */
  readonly current: {
    readonly rollback_rate_per_hour: number;
    readonly validator_divergence_pct: number;
    readonly avg_inherited_trust_decay: number;
    readonly contradiction_count: number;
    readonly arbitration_escalation_rate_pct: number;
  };
  /** Same signals N minutes ago, so we can compute a trend slope. */
  readonly prior?: {
    readonly observed_at_ms: number;
    readonly rollback_rate_per_hour: number;
    readonly validator_divergence_pct: number;
    readonly avg_inherited_trust_decay: number;
    readonly contradiction_count: number;
    readonly arbitration_escalation_rate_pct: number;
  };
  readonly now_ms?: number;
}

export function buildCausalStabilityForecast(input: BuildForecastInput): CausalStabilityForecast {
  const now = input.now_ms ?? Date.now();
  const horizon = Math.max(0, Math.min(MAX_FORECAST_HORIZON_MS, input.horizon_ms ?? MAX_FORECAST_HORIZON_MS));
  const elapsed = input.prior ? Math.max(60_000, now - input.prior.observed_at_ms) : 0;

  const entries: CausalStabilityForecastEntry[] = [];

  entries.push(makeEntry(
    'rollback_rate_trend',
    input.current.rollback_rate_per_hour,
    input.prior?.rollback_rate_per_hour,
    horizon,
    elapsed,
    'rollbacks/hr',
    /*invertImproving*/ true,    // higher rate = degrading
  ));
  entries.push(makeEntry(
    'validator_divergence_trend',
    input.current.validator_divergence_pct,
    input.prior?.validator_divergence_pct,
    horizon,
    elapsed,
    '% divergence',
    /*invertImproving*/ true,
  ));
  entries.push(makeEntry(
    'trust_decay_trajectory',
    input.current.avg_inherited_trust_decay,
    input.prior?.avg_inherited_trust_decay,
    horizon,
    elapsed,
    '% decay',
    /*invertImproving*/ true,
  ));
  entries.push(makeEntry(
    'contradiction_amplification_trend',
    input.current.contradiction_count,
    input.prior?.contradiction_count,
    horizon,
    elapsed,
    'contradictions',
    /*invertImproving*/ true,
  ));
  entries.push(makeEntry(
    'arbitration_instability_projection',
    input.current.arbitration_escalation_rate_pct,
    input.prior?.arbitration_escalation_rate_pct,
    horizon,
    elapsed,
    '% escalation',
    /*invertImproving*/ true,
  ));

  const degrading = entries.filter(e => e.direction === 'degrading');
  const worst = degrading.length > 0
    ? degrading.reduce((w, e) => (e.projected_value > w.projected_value ? e : w), degrading[0]).signal
    : null;

  return {
    project_id: input.project_id,
    entries,
    worst_signal: worst,
    built_at: new Date(now).toISOString(),
  };
}

function makeEntry(
  signal: ForecastSignal,
  current: number,
  prior: number | undefined,
  horizon_ms: number,
  elapsed_ms: number,
  unitLabel: string,
  invertImproving: boolean,
): CausalStabilityForecastEntry {
  // Slope: change per ms. If no prior or elapsed=0, slope = 0 (flat).
  const slope = prior !== undefined && elapsed_ms > 0
    ? (current - prior) / elapsed_ms
    : 0;
  const projectedRaw = current + slope * horizon_ms;
  const projected = clamp01ToValue(projectedRaw);
  const direction: CausalStabilityForecastEntry['direction'] =
    Math.abs(projected - current) < 1
      ? 'flat'
      : (invertImproving ? (projected > current ? 'degrading' : 'improving')
                          : (projected > current ? 'improving' : 'degrading'));

  const bounds = computeBounds(current, projected, slope, prior !== undefined, unitLabel);
  const rationale =
    prior === undefined
      ? `No prior sample → flat projection at ${current} ${unitLabel}; bounds widened.`
      : `Slope ${formatSlope(slope, unitLabel)} → ${direction} projection over ${(horizon_ms / 3600000).toFixed(1)}h.`;

  return {
    signal,
    current_value: Math.round(current * 100) / 100,
    projected_value: Math.round(projected * 100) / 100,
    horizon_ms,
    direction,
    bounds,
    rationale,
  };
}

function computeBounds(current: number, projected: number, slope: number, hasPrior: boolean, _unitLabel: string): ForecastConfidenceBounds {
  const drivers: string[] = [];
  // Base uncertainty: if no prior, very wide. If slope is tiny, narrower.
  let uncertainty = hasPrior ? 0.15 : 0.5;
  if (!hasPrior) drivers.push('no_prior_sample');
  if (Math.abs(slope) > 0) drivers.push('observed_trend');
  // If projected diverges sharply from current, widen.
  const divergence = Math.abs(projected - current);
  if (divergence > 25) {
    uncertainty += 0.10;
    drivers.push('large_projected_change');
  }
  if (current >= 80 || projected >= 80) {
    uncertainty += 0.05;
    drivers.push('value_near_ceiling');
  }
  const halfRange = Math.max(2, projected * uncertainty);
  const low = Math.max(0, Math.round(projected - halfRange));
  const high = Math.min(200, Math.round(projected + halfRange));
  return {
    low,
    high,
    confidence_range: high - low,
    uncertainty_drivers: drivers,
  };
}

function clamp01ToValue(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, v);
}

function formatSlope(slopePerMs: number, unit: string): string {
  const slopePerHour = slopePerMs * 3600 * 1000;
  return `${slopePerHour >= 0 ? '+' : ''}${slopePerHour.toFixed(2)} ${unit}/hr`;
}

export const _MAX_FORECAST_HORIZON_MS_FOR_TESTS = MAX_FORECAST_HORIZON_MS;
