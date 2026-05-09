/**
 * topologyForecastEngine — Phase 22. Heuristic single-step lookahead
 * forecast of next likely fragmentation tier.
 *
 * Architectural commitment:
 *   - Single-step lookahead (next 30/60min). No multi-step Markov chains.
 *   - No ML, no probabilistic simulation, no recursive prediction.
 *   - Every forecast carries explicit `PropagationConfidenceBounds`.
 *   - Bounded horizon at FORECAST_MAX_HORIZON_MINUTES=120.
 */

import type {
  TopologyForecastProfile, FragmentationTier, PropagationConfidenceBounds,
} from './topologyTypes';
import {
  FORECAST_DEFAULT_HORIZON_MINUTES, FORECAST_MAX_HORIZON_MINUTES,
} from './topologyTypes';
import { buildTopologyFragmentationProfile } from './topologyFragmentationDetector';
import { listAttributionsForOrg } from '../distributedRuntime/brokerOperationAttribution';

export interface BuildForecastInput {
  readonly organization_id: string;
  readonly horizon_minutes?: number;
}

export function buildTopologyForecast(input: BuildForecastInput): TopologyForecastProfile {
  const horizon = clampHorizon(input.horizon_minutes ?? FORECAST_DEFAULT_HORIZON_MINUTES);
  const fragmentation = buildTopologyFragmentationProfile(input.organization_id);
  const current_tier = fragmentation.tier;

  // Heuristic: forecast based on recent failure trend in attribution
  // buffer + current cluster depth.
  const ops = listAttributionsForOrg(input.organization_id);
  const cutoff = Date.now() - horizon * 60_000;
  const recentOps = ops.filter(o => Date.parse(o.observed_at) >= cutoff);
  const recentFailures = recentOps.filter(o => o.outcome !== 'success').length;
  const failureRate = recentOps.length === 0 ? 0 : recentFailures / recentOps.length;

  const drivers: string[] = [];
  let forecast_tier: FragmentationTier = current_tier;

  // Escalation rule: if current is cohesive but recent failure rate ≥ 5%,
  // forecast partial; ≥ 20%, forecast fragmented.
  if (current_tier === 'cohesive') {
    if (failureRate >= 0.2) { forecast_tier = 'fragmented'; drivers.push('high_recent_failure_rate'); }
    else if (failureRate >= 0.05) { forecast_tier = 'partial'; drivers.push('moderate_recent_failure_rate'); }
  } else if (current_tier === 'partial') {
    if (failureRate >= 0.2 || fragmentation.isolated_dependency_clusters.length > 0) { forecast_tier = 'fragmented'; drivers.push('partial_to_fragmented_pressure'); }
  } else if (current_tier === 'fragmented') {
    if (fragmentation.fragmentation_pressure_score >= 70) { forecast_tier = 'shattered'; drivers.push('fragmentation_pressure_above_threshold'); }
  } else if (current_tier === 'shattered') {
    forecast_tier = 'shattered';
    drivers.push('already_at_shattered_tier');
  }

  // De-escalation rule: if no recent failures AND no isolations, forecast cohesive.
  if (fragmentation.active_isolation_count === 0 && failureRate === 0 && current_tier !== 'cohesive') {
    forecast_tier = 'cohesive';
    drivers.push('no_recent_failures_and_no_active_isolations');
  }

  const observed_signal_strength = Math.min(100, recentOps.length * 2 + fragmentation.fragmentation_pressure_score);
  const half_band = drivers.length === 0 ? 5 : 10 + drivers.length * 4;
  const center = forecastConfidenceCenter(current_tier, forecast_tier);
  const bounds: PropagationConfidenceBounds = {
    forecast_horizon_minutes: horizon,
    confidence_low: Math.max(0, center - half_band),
    confidence_high: Math.min(100, center + half_band),
    uncertainty_drivers: drivers.length === 0 ? ['stable_observed_signal'] : drivers,
    observed_signal_strength,
  };

  return {
    organization_id: input.organization_id,
    partition_id: input.organization_id,
    current_tier,
    forecast_tier,
    forecast_horizon_minutes: horizon,
    bounds,
    drivers,
    built_at: new Date().toISOString(),
  };
}

function clampHorizon(h: number): number {
  if (!Number.isFinite(h) || h < 1) return FORECAST_DEFAULT_HORIZON_MINUTES;
  return Math.min(FORECAST_MAX_HORIZON_MINUTES, Math.max(1, Math.round(h)));
}

function forecastConfidenceCenter(current: FragmentationTier, forecast: FragmentationTier): number {
  if (current === forecast) return 75;        // staying put = high confidence
  // Single-step transitions keep moderate confidence; larger jumps lower it.
  const tierIndex: Record<FragmentationTier, number> = { cohesive: 0, partial: 1, fragmented: 2, shattered: 3 };
  const jump = Math.abs(tierIndex[forecast] - tierIndex[current]);
  if (jump <= 1) return 60;
  return 40;
}
