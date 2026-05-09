/**
 * rollbackSurvivabilityComparator — Phase 30. Per-archetype rollback
 * survivability metrics. Side-by-side comparison.
 *
 * Architectural commitment:
 *   - `engine_never_ranks: true` typed-as-literal.
 *   - `heuristic_only: true` typed-as-literal.
 *   - No aggregate score, no recommendation.
 *   - Rows ordered alphabetically by archetype_id.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  RollbackSurvivabilityComparison, RollbackSurvivabilityRow,
} from './recoveryForesightTypes';
import { MAX_SURVIVABILITY_PER_PARTITION, FORESIGHT_CONFIDENCE_CAP } from './recoveryForesightTypes';
import { listArchetypes } from '../stabilizationIntelligence/recoveryArchetypeRegistry';
import { listRollbackPlans } from '../executionSubstrate/rollbackExecutionCoordinator';
import { listTopologyRecoveryPlans } from '../topology/topologyRecoveryOrchestrator';
import { listRecoveryPlans } from '../distributedRuntime/distributedRecoveryEngine';

interface PartitionStore {
  comparisons: RollbackSurvivabilityComparison[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { comparisons: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildSurvivabilityInput {
  readonly organization_id: string;
  readonly archetype_ids?: ReadonlyArray<string>;
}

/**
 * Per-archetype rollback survivability heuristic. Reads Phase 21/22/23
 * plan counts and computes per-archetype survivability metrics:
 *   - rollback_chain_source_phase: which phase's chain backs this action
 *   - rollback_steps_count: heuristic from plan counts
 *   - inherited_confidence: capped at 80
 *   - uncertainty_bounds: ±40% around expected
 */
export function buildRollbackSurvivabilityComparison(
  input: BuildSurvivabilityInput,
): RollbackSurvivabilityComparison {
  const all = listArchetypes(input.organization_id);
  const filtered = input.archetype_ids
    ? all.filter(a => input.archetype_ids!.includes(a.archetype_id))
    : all;
  const sorted = [...filtered].sort((a, b) => a.archetype_id.localeCompare(b.archetype_id));

  const phase23 = listRollbackPlans(input.organization_id);
  const phase22 = listTopologyRecoveryPlans(input.organization_id);
  const phase21 = listRecoveryPlans();
  const total_plans = phase21.length + phase22.length + phase23.length;

  const rows: RollbackSurvivabilityRow[] = sorted.map(arch => {
    const source_phase = inferRollbackSourcePhase(arch.archetype_id);
    const rollback_steps_count = total_plans === 0 ? 4 : Math.max(1, Math.round(
      // Heuristic — built-in archetypes correlate 1.5x baseline,
      // operator-set archetypes 1.0x.
      (total_plans / Math.max(1, sorted.length)) * (arch.is_built_in ? 1.5 : 1.0),
    ));

    const drivers: string[] = [];
    drivers.push(`source_phase=${source_phase}`);
    drivers.push(`phase_21_plans=${phase21.length}`);
    drivers.push(`phase_22_plans=${phase22.length}`);
    drivers.push(`phase_23_plans=${phase23.length}`);
    drivers.push(`provenance=${arch.provenance}`);

    const base_confidence = arch.is_built_in ? 50 : 40;
    const confidence = Math.min(
      FORESIGHT_CONFIDENCE_CAP,
      base_confidence + total_plans * 5,
    );

    const expected = rollback_steps_count * 250;        // 250ms heuristic per step
    const low = Math.max(0, Math.round(expected * 0.6));
    const high = Math.round(expected * 1.4);

    const row_hash = deterministicHash(
      `${arch.archetype_id}::${source_phase}::${rollback_steps_count}::${confidence}::${expected}`,
    );

    return {
      archetype_id: arch.archetype_id,
      archetype_name: arch.name,
      rollback_chain_source_phase: source_phase,
      rollback_steps_count,
      inherited_confidence: { score: confidence, drivers },
      uncertainty_bounds: { low, expected, high },
      deterministic_hash: row_hash,
    };
  });

  const built_at = new Date().toISOString();
  const survivability_hash = deterministicHash(
    `${input.organization_id}::${rows.map(r => r.deterministic_hash).join('::')}`,
  );

  const comparison: RollbackSurvivabilityComparison = {
    comparison_id: `rsv_${randomUUID()}`,
    organization_id: input.organization_id,
    rows,
    engine_never_ranks: true,
    heuristic_only: true,
    survivability_hash,
    built_at,
  };

  const store = ensure(input.organization_id);
  store.comparisons.push(comparison);
  if (store.comparisons.length > MAX_SURVIVABILITY_PER_PARTITION) store.comparisons.shift();

  return comparison;
}

function inferRollbackSourcePhase(archetype_id: string): RollbackSurvivabilityRow['rollback_chain_source_phase'] {
  if (archetype_id.includes('broker')) return 'phase_21_runtime';
  if (archetype_id.includes('topology')) return 'phase_22_topology';
  if (archetype_id.includes('execution_isolation') || archetype_id.includes('execution_substrate')) return 'phase_23_execution_substrate';
  if (archetype_id.includes('continuity_replay')) return 'phase_21_runtime';
  if (archetype_id.includes('distributed')) return 'phase_21_runtime';
  return 'none';
}

export function listSurvivabilityComparisons(
  organization_id: string,
): ReadonlyArray<RollbackSurvivabilityComparison> {
  return [...(partitions.get(organization_id)?.comparisons ?? [])].reverse();
}

export function recentSurvivabilityCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.comparisons ?? [];
    total += arr.filter(c => Date.parse(c.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetSurvivabilityComparatorForTests(): void {
  partitions.clear();
}
