/**
 * recoveryArchaeologyReplay — Phase 30. Read-only replay of Phase 29
 * stabilization lineage. PURELY READ-ONLY.
 *
 * Architectural commitment:
 *   - Phase 29-only scope. Reads archetypes + governance attributions
 *     + finality proofs + sequencings + forecasts + pressure samples.
 *   - `read_only: true` typed-as-literal — structural commitment.
 *   - `cross_phase_archaeology: false` typed-as-literal — v1 does NOT
 *     traverse cross-phase mutator lineage.
 *   - Cross-organization isolation absolute.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  RecoveryArchaeologyReplayTrace,
} from './recoveryForesightTypes';
import { MAX_ARCHAEOLOGY_PER_PARTITION } from './recoveryForesightTypes';
import { listArchetypes } from '../stabilizationIntelligence/recoveryArchetypeRegistry';
import {
  listGovernanceAttributions, listFinalityProofs,
} from '../stabilizationIntelligence/recoveryGovernanceSupervisor';
import { listSequencingProfiles } from '../stabilizationIntelligence/rollbackSequencingEngine';
import { listForecasts } from '../stabilizationIntelligence/continuityRestorationForecaster';
import { listPressureSamples } from '../stabilizationIntelligence/recoveryPressureAnalyzer';

interface PartitionStore {
  traces: RecoveryArchaeologyReplayTrace[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { traces: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildArchaeologyInput {
  readonly organization_id: string;
}

/**
 * Build a read-only archaeology replay trace summarizing the Phase 29
 * partition state. NEVER re-executes anything.
 */
export function buildRecoveryArchaeologyReplay(
  input: BuildArchaeologyInput,
): RecoveryArchaeologyReplayTrace {
  const archetypes = listArchetypes(input.organization_id);
  const governance = listGovernanceAttributions(input.organization_id);
  const finality_proofs = listFinalityProofs(input.organization_id);
  const sequencings = listSequencingProfiles(input.organization_id);
  const forecasts = listForecasts(input.organization_id);
  const pressure_samples = listPressureSamples(input.organization_id);

  const archaeology_hash = deterministicHash([
    `archetypes=${archetypes.length}`,
    `governance=${governance.length}`,
    `finality_proofs=${finality_proofs.length}`,
    `sequencings=${sequencings.length}`,
    `forecasts=${forecasts.length}`,
    `pressure_samples=${pressure_samples.length}`,
    // Composite of recent governance + finality proof hashes for
    // determinism — same Phase 29 state → same archaeology hash.
    governance.slice(0, 25).map(g => g.deterministic_hash).join(':'),
    finality_proofs.slice(0, 25).map(f => f.deterministic_hash).join(':'),
  ].join('::'));

  const trace: RecoveryArchaeologyReplayTrace = {
    trace_id: `arch_${randomUUID()}`,
    organization_id: input.organization_id,
    archetype_count: archetypes.length,
    governance_attribution_count: governance.length,
    finality_proof_count: finality_proofs.length,
    sequencing_count: sequencings.length,
    forecast_count: forecasts.length,
    pressure_sample_count: pressure_samples.length,
    archaeology_hash,
    read_only: true,
    cross_phase_archaeology: false,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.traces.push(trace);
  if (store.traces.length > MAX_ARCHAEOLOGY_PER_PARTITION) store.traces.shift();

  return trace;
}

export function listArchaeologyTraces(
  organization_id: string,
): ReadonlyArray<RecoveryArchaeologyReplayTrace> {
  return [...(partitions.get(organization_id)?.traces ?? [])].reverse();
}

export function recentArchaeologyCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.traces ?? [];
    total += arr.filter(t => Date.parse(t.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetArchaeologyForTests(): void {
  partitions.clear();
}
