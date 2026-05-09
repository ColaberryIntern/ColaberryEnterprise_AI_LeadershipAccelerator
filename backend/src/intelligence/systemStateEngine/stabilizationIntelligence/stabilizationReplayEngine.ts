/**
 * stabilizationReplayEngine — Phase 29. Read-only stabilization replay
 * bundle aggregator + determinism verifier.
 *
 * Architectural commitment:
 *   - PURE READ-ONLY. Never re-executes, never mutates.
 *   - Surfaces the full boundary-proof chain so operators can verify
 *     "same stabilization inputs → same recovery recommendation outputs."
 *   - Cross-organization isolation absolute.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  StabilizationReplayBundle, StabilizationReplayTrace,
  RecoveryReplayDeterminismAttribution,
} from './stabilizationIntelligenceTypes';
import { MAX_REPLAY_TRACES_PER_PARTITION } from './stabilizationIntelligenceTypes';
import { buildStabilizationComposite } from './stabilizationPlaybookCoordinator';

interface PartitionStore {
  traces: StabilizationReplayTrace[];
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

export interface BuildReplayBundleInput {
  readonly organization_id: string;
  readonly archetype_id?: string;
}

export function buildStabilizationReplayBundle(
  input: BuildReplayBundleInput,
): StabilizationReplayBundle {
  const composite = buildStabilizationComposite({
    organization_id: input.organization_id,
    archetype_id: input.archetype_id,
  });

  // Build a replay trace and append.
  const trace: StabilizationReplayTrace = {
    trace_id: `strace_${randomUUID()}`,
    organization_id: input.organization_id,
    archetype_id: composite.archetype_id ?? '_no_archetype_',
    sequencing_profile_hash: composite.boundary_proof_chain.sequencing_hash,
    forecast_hash: composite.boundary_proof_chain.forecast_hash,
    pressure_sample_hash: composite.boundary_proof_chain.pressure_hash,
    containment_attribution_hash: composite.containment.deterministic_hash,
    governance_decision_hash: '_no_governance_decision_',
    composite_replay_hash: composite.boundary_proof_chain.replay_hash,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.traces.push(trace);
  if (store.traces.length > MAX_REPLAY_TRACES_PER_PARTITION) store.traces.shift();

  const determinism_attribution: RecoveryReplayDeterminismAttribution = {
    archetype_hash: composite.boundary_proof_chain.archetype_hash,
    sequencing_hash: composite.boundary_proof_chain.sequencing_hash,
    replay_hash: composite.boundary_proof_chain.replay_hash,
    forecast_hash: composite.boundary_proof_chain.forecast_hash,
    deterministic_composite_hash: deterministicHash(
      `${composite.boundary_proof_chain.archetype_hash}::${composite.boundary_proof_chain.sequencing_hash}::${composite.boundary_proof_chain.forecast_hash}::${composite.boundary_proof_chain.pressure_hash}::${composite.boundary_proof_chain.replay_hash}`,
    ),
    recorded_at: new Date().toISOString(),
  };

  return {
    organization_id: input.organization_id,
    recent_traces: [...(partitions.get(input.organization_id)?.traces ?? [])].reverse().slice(0, 25),
    determinism_attribution,
    boundary_proof_chain: composite.boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}

/**
 * Verify replay determinism by re-running the composite + comparing
 * boundary-proof-chain replay_hash. Read-only.
 */
export function verifyStabilizationReplayDeterminism(input: {
  readonly organization_id: string;
  readonly archetype_id?: string;
  readonly expected_replay_hash: string;
}): { deterministic: boolean; actual_replay_hash: string } {
  const composite = buildStabilizationComposite({
    organization_id: input.organization_id,
    archetype_id: input.archetype_id,
  });
  return {
    deterministic: composite.boundary_proof_chain.replay_hash === input.expected_replay_hash,
    actual_replay_hash: composite.boundary_proof_chain.replay_hash,
  };
}

export function listReplayTraces(
  organization_id: string,
): ReadonlyArray<StabilizationReplayTrace> {
  return [...(partitions.get(organization_id)?.traces ?? [])].reverse();
}

export function _resetReplayEngineForTests(): void {
  partitions.clear();
}
