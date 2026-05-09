/**
 * continuityRestorationForecaster — Phase 29. Heuristic-only continuity
 * restoration forecasting.
 *
 * Architectural commitment:
 *   - HEURISTIC linear extrapolation. No ML, no probabilistic
 *     optimization, no inferred recovery desirability.
 *   - `heuristic_only: true` typed-as-literal — structural commitment.
 *   - `uncertainty_bounds` (low/expected/high) mandatory output.
 *   - `inherited_confidence` lineage capped at FORECAST_CONFIDENCE_CAP
 *     (80) to preserve heuristic humility.
 *   - Deterministic: same archetype + same observable counters → same
 *     forecast_hash.
 *   - Cross-organization isolation absolute.
 */

import { createHash } from 'crypto';
import type {
  ContinuityRestorationForecast,
} from './stabilizationIntelligenceTypes';
import {
  FORECAST_HORIZON_MS, MAX_FORECASTS_PER_PARTITION,
  FORECAST_CONFIDENCE_CAP,
} from './stabilizationIntelligenceTypes';
import { getArchetype } from './recoveryArchetypeRegistry';
import { listRollbackPlans } from '../executionSubstrate/rollbackExecutionCoordinator';
import { listTopologyRecoveryPlans } from '../topology/topologyRecoveryOrchestrator';
import { listRecoveryPlans } from '../distributedRuntime/distributedRecoveryEngine';
import { recentReplayCount24h as recentContinuityReplayCount24h } from '../distributedRuntime/runtimeContinuityReplay';

interface PartitionStore {
  forecasts: ContinuityRestorationForecast[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { forecasts: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildForecastInput {
  readonly organization_id: string;
  readonly archetype_id: string;
}

export type BuildForecastResult =
  | { built: true; forecast: ContinuityRestorationForecast }
  | { built: false; reason: string };

/**
 * Heuristic linear extrapolation:
 *   - Per-step duration heuristic: 250ms baseline + 100ms per existing
 *     plan in the relevant phase (more plans → more replay overhead)
 *   - Total duration: step count × per-step heuristic
 *   - Partition strain: bounded sum of recent rollback chain count + 5
 *     per active continuity replay observation
 *   - Confidence: 40 + 5 per observed plan, capped at 80
 *   - Uncertainty: ±40% around expected
 */
export function buildContinuityRestorationForecast(input: BuildForecastInput): BuildForecastResult {
  const archetype = getArchetype(input.organization_id, input.archetype_id);
  if (!archetype) return { built: false, reason: 'archetype_not_found' };

  // Read observable plan counts (read-only).
  const phase23 = listRollbackPlans(input.organization_id);
  const phase22 = listTopologyRecoveryPlans(input.organization_id);
  const phase21 = listRecoveryPlans();
  const continuity_replays_24h = recentContinuityReplayCount24h();
  const total_plans = phase23.length + phase22.length + phase21.length;

  const per_step_baseline_ms = 250;
  const per_step_overhead_ms = total_plans * 50;
  const per_step_ms = per_step_baseline_ms + per_step_overhead_ms;
  const expected = archetype.steps.length * per_step_ms;
  const low = Math.max(0, Math.round(expected * 0.6));
  const high = Math.round(expected * 1.4);

  const partition_strain_pressure_raw =
    Math.min(40, total_plans * 4) +
    Math.min(20, continuity_replays_24h * 5);
  const estimated_partition_strain_pressure = Math.min(100, partition_strain_pressure_raw);

  const drivers: string[] = [];
  drivers.push(`archetype=${archetype.archetype_id}`);
  drivers.push(`steps=${archetype.steps.length}`);
  drivers.push(`phase_23_plans=${phase23.length}`);
  drivers.push(`phase_22_plans=${phase22.length}`);
  drivers.push(`phase_21_plans=${phase21.length}`);
  drivers.push(`continuity_replays_24h=${continuity_replays_24h}`);

  // Confidence: 40 base + 5/plan, capped at 80. Built-in archetypes
  // start at 50; operator-set start at 40 (less historical lineage).
  const base_confidence = archetype.is_built_in ? 50 : 40;
  const confidence_score = Math.min(
    FORECAST_CONFIDENCE_CAP,
    base_confidence + total_plans * 5,
  );

  const built_at = new Date().toISOString();
  const forecast_hash = deterministicHash(
    `${input.organization_id}::${archetype.deterministic_hash}::${expected}::${estimated_partition_strain_pressure}::${confidence_score}`,
  );

  const forecast: ContinuityRestorationForecast = {
    organization_id: input.organization_id,
    archetype_id: archetype.archetype_id,
    forecast_horizon_ms: FORECAST_HORIZON_MS,
    estimated_total_duration_ms: expected,
    estimated_partition_strain_pressure,
    uncertainty_bounds: { low, expected, high },
    inherited_confidence: {
      score: confidence_score,
      source_phase: 'phase_29_stabilization',
      drivers,
    },
    heuristic_only: true,
    forecast_hash,
    built_at,
  };

  const store = ensure(input.organization_id);
  store.forecasts.push(forecast);
  if (store.forecasts.length > MAX_FORECASTS_PER_PARTITION) store.forecasts.shift();

  return { built: true, forecast };
}

export function listForecasts(
  organization_id: string,
): ReadonlyArray<ContinuityRestorationForecast> {
  return [...(partitions.get(organization_id)?.forecasts ?? [])].reverse();
}

export function recentForecastCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.forecasts ?? [];
    total += arr.filter(f => Date.parse(f.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetForecasterForTests(): void {
  partitions.clear();
}
