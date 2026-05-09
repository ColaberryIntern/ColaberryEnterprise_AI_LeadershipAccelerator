/**
 * rollbackResourceForecaster — Phase 28. Heuristic-only rollback resource
 * forecasting with explicit uncertainty + inherited confidence lineage.
 *
 * Architectural commitment:
 *   - HEURISTIC ONLY. No ML, no probabilistic optimization, no inferred
 *     stabilization guarantees.
 *   - Linear extrapolation from observable counters over a 24h horizon.
 *   - `heuristic_only: true` typed-as-literal — structural commitment.
 *   - `uncertainty_bounds` (low/expected/high) is mandatory output.
 *   - `inherited_confidence` lineage exposes the source phase + drivers.
 *   - Cross-organization isolation absolute.
 */

import { createHash } from 'crypto';
import type { RollbackResourceForecast } from './executionEconomicsTypes';
import {
  FORECAST_HORIZON_MS, MAX_FORECASTS_PER_PARTITION,
} from './executionEconomicsTypes';
import { listRollbackPlans } from '../executionSubstrate/rollbackExecutionCoordinator';
import { listTopologyRecoveryPlans } from '../topology/topologyRecoveryOrchestrator';
import { listRecoveryPlans } from '../distributedRuntime/distributedRecoveryEngine';
import { recentReplayCount24h as recentContinuityReplayCount24h } from '../distributedRuntime/runtimeContinuityReplay';

interface PartitionStore {
  forecasts: RollbackResourceForecast[];
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

/**
 * Build a heuristic forecast of rollback resource impact over the
 * default horizon. Explanation:
 *   - `estimated_rollback_chains`: count of recent rollback chains
 *     across Phase 21/22/23 plans (read-only)
 *   - `estimated_replay_duration_ms`: linear extrapolation from observed
 *     chain depths (heuristic constant of 250ms/step)
 *   - `uncertainty_bounds`: ±40% around expected
 *   - `inherited_confidence`: derived from source-phase plan counts;
 *     more plans observed → higher confidence (capped at 80, no
 *     forecast can claim ≥80 confidence to preserve heuristic humility)
 */
export function buildRollbackResourceForecast(organization_id: string): RollbackResourceForecast {
  // Gather plan counts across phases.
  const phase23 = listRollbackPlans(organization_id);
  const phase22 = listTopologyRecoveryPlans(organization_id);
  const phase21 = listRecoveryPlans();

  const chain_count = phase23.length + phase22.length + phase21.length;
  const continuity_replays = recentContinuityReplayCount24h();

  // Step depth heuristic: average steps per plan. Use 4 as fallback
  // when no plans observed.
  const totalSteps =
    phase23.reduce((acc, p) => acc + ((p as any).source_chains?.length ?? 4), 0) +
    phase22.reduce((acc, p) => acc + ((p as any).steps?.length ?? 4), 0) +
    phase21.reduce((acc, p) => acc + ((p as any).steps?.length ?? 4), 0);
  const avgSteps = chain_count === 0 ? 4 : Math.max(1, Math.round(totalSteps / chain_count));

  const ms_per_step = 250;          // heuristic constant
  const expected = chain_count * avgSteps * ms_per_step;
  const low = Math.max(0, Math.round(expected * 0.6));
  const high = Math.round(expected * 1.4);

  // Confidence: bounded heuristic — more plans → higher confidence,
  // capped at 80. If chain_count == 0, confidence is 30 (low — no
  // evidence to extrapolate from).
  const confidence_raw = chain_count === 0
    ? 30
    : Math.min(80, 40 + chain_count * 5 + Math.min(20, continuity_replays * 2));

  const drivers: string[] = [];
  drivers.push(`phase_23_chains=${phase23.length}`);
  drivers.push(`phase_22_chains=${phase22.length}`);
  drivers.push(`phase_21_chains=${phase21.length}`);
  drivers.push(`continuity_replays_24h=${continuity_replays}`);
  drivers.push(`avg_steps_per_chain=${avgSteps}`);

  const built_at = new Date().toISOString();
  const forecast_hash = deterministicHash(
    `${organization_id}::chains=${chain_count}::avgSteps=${avgSteps}::expected=${expected}::confidence=${confidence_raw}`,
  );

  const forecast: RollbackResourceForecast = {
    organization_id,
    forecast_horizon_ms: FORECAST_HORIZON_MS,
    estimated_rollback_chains: chain_count,
    estimated_replay_duration_ms: expected,
    uncertainty_bounds: { low, expected, high },
    inherited_confidence: {
      score: confidence_raw,
      source_phase: 'phase_28_economics',
      drivers,
    },
    heuristic_only: true,
    forecast_hash,
    built_at,
  };

  const store = ensure(organization_id);
  store.forecasts.push(forecast);
  if (store.forecasts.length > MAX_FORECASTS_PER_PARTITION) store.forecasts.shift();
  return forecast;
}

export function listRollbackResourceForecasts(
  organization_id: string,
): ReadonlyArray<RollbackResourceForecast> {
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
