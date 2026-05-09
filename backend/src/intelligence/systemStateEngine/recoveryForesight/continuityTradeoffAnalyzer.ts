/**
 * continuityTradeoffAnalyzer — Phase 30. Per-archetype tradeoff
 * analysis (duration, strain, replay amplification, topology strain).
 *
 * Architectural commitment:
 *   - `heuristic_only: true` typed-as-literal.
 *   - `engine_never_ranks: true` typed-as-literal.
 *   - No optimization, no inferred operator goals, no probabilistic
 *     weighting.
 *   - Rows ordered alphabetically by archetype_id.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  ContinuityTradeoffProfile, ContinuityTradeoffRow,
} from './recoveryForesightTypes';
import { MAX_TRADEOFFS_PER_PARTITION } from './recoveryForesightTypes';
import { listArchetypes } from '../stabilizationIntelligence/recoveryArchetypeRegistry';
import { buildContinuityRestorationForecast } from '../stabilizationIntelligence/continuityRestorationForecaster';
import { listRollbackPlans } from '../executionSubstrate/rollbackExecutionCoordinator';
import { listTopologyRecoveryPlans } from '../topology/topologyRecoveryOrchestrator';
import { listRecoveryPlans } from '../distributedRuntime/distributedRecoveryEngine';

interface PartitionStore {
  profiles: ContinuityTradeoffProfile[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { profiles: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildTradeoffInput {
  readonly organization_id: string;
  readonly archetype_ids?: ReadonlyArray<string>;
}

export function buildContinuityTradeoffProfile(
  input: BuildTradeoffInput,
): ContinuityTradeoffProfile {
  const all = listArchetypes(input.organization_id);
  const filtered = input.archetype_ids
    ? all.filter(a => input.archetype_ids!.includes(a.archetype_id))
    : all;
  const sorted = [...filtered].sort((a, b) => a.archetype_id.localeCompare(b.archetype_id));

  const phase23 = listRollbackPlans(input.organization_id);
  const phase22 = listTopologyRecoveryPlans(input.organization_id);
  const phase21 = listRecoveryPlans();
  const total_plans = phase21.length + phase22.length + phase23.length;

  const rows: ContinuityTradeoffRow[] = sorted.map(arch => {
    const fc = buildContinuityRestorationForecast({
      organization_id: input.organization_id,
      archetype_id: arch.archetype_id,
    });
    const forecast = fc.built ? fc.forecast : null;
    const estimated_duration_ms = forecast?.estimated_total_duration_ms ?? 0;
    const estimated_strain_pressure = forecast?.estimated_partition_strain_pressure ?? 0;

    // Replay amplification heuristic — bounded by step count + plan
    // counts. Each step adds 5 amplification, each existing plan adds 2.
    const estimated_replay_amplification = Math.min(100,
      arch.steps.length * 5 + total_plans * 2,
    );

    // Topology strain heuristic — bounded by topology recovery plans.
    const estimated_topology_strain = Math.min(100,
      phase22.length * 8 + arch.steps.length * 3,
    );

    const expected = estimated_duration_ms;
    const low = Math.max(0, Math.round(expected * 0.6));
    const high = Math.round(expected * 1.4);

    const row_hash = deterministicHash(
      `${arch.archetype_id}::${estimated_duration_ms}::${estimated_strain_pressure}::${estimated_replay_amplification}::${estimated_topology_strain}`,
    );

    return {
      archetype_id: arch.archetype_id,
      archetype_name: arch.name,
      estimated_duration_ms,
      estimated_strain_pressure,
      estimated_replay_amplification,
      estimated_topology_strain,
      uncertainty_bounds: { low, expected, high },
      deterministic_hash: row_hash,
    };
  });

  const built_at = new Date().toISOString();
  const tradeoff_hash = deterministicHash(
    `${input.organization_id}::${rows.map(r => r.deterministic_hash).join('::')}`,
  );

  const profile: ContinuityTradeoffProfile = {
    profile_id: `tro_${randomUUID()}`,
    organization_id: input.organization_id,
    rows,
    heuristic_only: true,
    engine_never_ranks: true,
    tradeoff_hash,
    built_at,
  };

  const store = ensure(input.organization_id);
  store.profiles.push(profile);
  if (store.profiles.length > MAX_TRADEOFFS_PER_PARTITION) store.profiles.shift();

  return profile;
}

export function listTradeoffProfiles(
  organization_id: string,
): ReadonlyArray<ContinuityTradeoffProfile> {
  return [...(partitions.get(organization_id)?.profiles ?? [])].reverse();
}

export function recentTradeoffCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.profiles ?? [];
    total += arr.filter(p => Date.parse(p.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetTradeoffAnalyzerForTests(): void {
  partitions.clear();
}
