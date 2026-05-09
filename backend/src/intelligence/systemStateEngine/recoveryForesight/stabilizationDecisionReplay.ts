/**
 * stabilizationDecisionReplay — Phase 30. Read-only replay bundle +
 * determinism verifier. Records `StabilizationDecisionReplayTrace`.
 *
 * Architectural commitment:
 *   - PURE READ-ONLY. Never re-executes, never mutates.
 *   - Surfaces the full boundary-proof chain so operators verify
 *     "same stabilization inputs → same comparison outputs."
 */

import { randomUUID, createHash } from 'crypto';
import type {
  StabilizationDecisionReplayTrace,
  RecoveryForesightReplayBundle,
  DecisionReplayDeterminismAttribution,
  RecoveryForesightDeterminismBounds,
} from './recoveryForesightTypes';
import { MAX_REPLAY_TRACES_PER_PARTITION } from './recoveryForesightTypes';
import { buildRecoveryForesightComposite } from './recoveryForesightCoordinator';

interface PartitionStore {
  traces: StabilizationDecisionReplayTrace[];
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
  readonly operator_id: string;
  readonly archetype_ids?: ReadonlyArray<string>;
}

export function buildRecoveryForesightReplayBundle(
  input: BuildReplayBundleInput,
): RecoveryForesightReplayBundle {
  const composite = buildRecoveryForesightComposite(input);

  const trace: StabilizationDecisionReplayTrace = {
    trace_id: `dtrace_${randomUUID()}`,
    organization_id: input.organization_id,
    comparison_hash: composite.boundary_proof_chain.comparison_hash,
    survivability_hash: composite.boundary_proof_chain.survivability_hash,
    tradeoff_hash: composite.boundary_proof_chain.tradeoff_hash,
    archaeology_hash: composite.boundary_proof_chain.archaeology_hash,
    composite_replay_hash: composite.boundary_proof_chain.replay_hash,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.traces.push(trace);
  if (store.traces.length > MAX_REPLAY_TRACES_PER_PARTITION) store.traces.shift();

  const recorded_at = new Date().toISOString();
  const deterministic_composite_hash = deterministicHash(
    `${composite.boundary_proof_chain.comparison_hash}::${composite.boundary_proof_chain.survivability_hash}::${composite.boundary_proof_chain.tradeoff_hash}::${composite.boundary_proof_chain.archaeology_hash}::${composite.boundary_proof_chain.replay_hash}`,
  );

  const determinism_attribution: DecisionReplayDeterminismAttribution = {
    comparison_hash: composite.boundary_proof_chain.comparison_hash,
    survivability_hash: composite.boundary_proof_chain.survivability_hash,
    tradeoff_hash: composite.boundary_proof_chain.tradeoff_hash,
    archaeology_hash: composite.boundary_proof_chain.archaeology_hash,
    replay_hash: composite.boundary_proof_chain.replay_hash,
    deterministic_composite_hash,
    recorded_at,
  };

  const determinism_bounds: RecoveryForesightDeterminismBounds = {
    comparison_hash: composite.boundary_proof_chain.comparison_hash,
    replay_hash: composite.boundary_proof_chain.replay_hash,
    archaeology_hash: composite.boundary_proof_chain.archaeology_hash,
    tradeoff_hash: composite.boundary_proof_chain.tradeoff_hash,
    deterministic_composite_hash,
    recorded_at,
  };

  return {
    organization_id: input.organization_id,
    recent_traces: [...(partitions.get(input.organization_id)?.traces ?? [])].reverse().slice(0, 25),
    determinism_attribution,
    determinism_bounds,
    boundary_proof_chain: composite.boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}

/**
 * Verify replay determinism by re-running the composite + comparing
 * boundary-proof-chain replay_hash. Read-only.
 */
export function verifyForesightReplayDeterminism(input: {
  readonly organization_id: string;
  readonly operator_id: string;
  readonly archetype_ids?: ReadonlyArray<string>;
  readonly expected_replay_hash: string;
}): { deterministic: boolean; actual_replay_hash: string } {
  const composite = buildRecoveryForesightComposite(input);
  return {
    deterministic: composite.boundary_proof_chain.replay_hash === input.expected_replay_hash,
    actual_replay_hash: composite.boundary_proof_chain.replay_hash,
  };
}

export function listForesightReplayTraces(
  organization_id: string,
): ReadonlyArray<StabilizationDecisionReplayTrace> {
  return [...(partitions.get(organization_id)?.traces ?? [])].reverse();
}

export function _resetForesightReplayForTests(): void {
  partitions.clear();
}
