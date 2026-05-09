/**
 * multiOperatorCoordinator — Phase 32. Read-only top-level composite +
 * 5-hash boundary proof chain.
 */

import { createHash } from 'crypto';
import type {
  HandoffBoundaryProofChain, HandoffReplayDeterminismAttribution,
  ContinuityTransferDeterminismBounds,
  OperatorContinuityReplayBundle,
  GovernanceHandoffProfile, ContinuityTransferBundle,
  SharedStabilizationTimeline, OperatorHandoffArchaeologyReplay,
  CollaborativeContinuityReplay, OperatorCoordinationCompression,
} from './operatorContinuityTypes';
import { listHandoffs } from './governanceHandoffRegistry';
import { listTransferBundles } from './continuityTransferEngine';
import { buildSharedStabilizationTimeline } from './sharedStabilizationTimeline';
import { buildOperatorHandoffArchaeology } from './operatorHandoffArchaeology';
import { buildCollaborativeContinuityReplay } from './collaborativeContinuityReplay';
import { buildOperatorCoordinationCompression } from './operatorCoordinationCompression';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildCompositeInput {
  readonly organization_id: string;
}

export interface MultiOperatorComposite {
  readonly organization_id: string;
  readonly handoffs: ReadonlyArray<GovernanceHandoffProfile>;
  readonly transfer_bundles: ReadonlyArray<ContinuityTransferBundle>;
  readonly timeline: SharedStabilizationTimeline;
  readonly archaeology: OperatorHandoffArchaeologyReplay;
  readonly replay: CollaborativeContinuityReplay;
  readonly compression: OperatorCoordinationCompression;
  readonly boundary_proof_chain: HandoffBoundaryProofChain;
  readonly built_at: string;
}

export function buildMultiOperatorComposite(
  input: BuildCompositeInput,
): MultiOperatorComposite {
  const handoffs = listHandoffs(input.organization_id);
  const transfer_bundles = listTransferBundles(input.organization_id);
  const timeline = buildSharedStabilizationTimeline({ organization_id: input.organization_id });
  const archaeology = buildOperatorHandoffArchaeology({ organization_id: input.organization_id });
  const replay = buildCollaborativeContinuityReplay({ organization_id: input.organization_id });
  const compression = buildOperatorCoordinationCompression({ organization_id: input.organization_id });

  const handoff_hash = deterministicHash(
    `handoffs::${input.organization_id}::${handoffs.map(h => h.deterministic_hash).join('::')}`,
  );
  const transfer_hash = deterministicHash(
    `transfers::${input.organization_id}::${transfer_bundles.map(b => b.transfer_hash).join('::')}`,
  );

  const boundary_proof_chain: HandoffBoundaryProofChain = {
    handoff_hash,
    transfer_hash,
    timeline_hash: timeline.timeline_hash,
    archaeology_hash: archaeology.archaeology_hash,
    replay_hash: replay.replay_hash,
  };

  return {
    organization_id: input.organization_id,
    handoffs, transfer_bundles, timeline, archaeology, replay, compression,
    boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}

export function buildOperatorContinuityReplayBundle(
  input: BuildCompositeInput,
): OperatorContinuityReplayBundle {
  const composite = buildMultiOperatorComposite(input);
  const recorded_at = new Date().toISOString();

  const deterministic_composite_hash = deterministicHash(
    `${composite.boundary_proof_chain.handoff_hash}::${composite.boundary_proof_chain.transfer_hash}::${composite.boundary_proof_chain.timeline_hash}::${composite.boundary_proof_chain.archaeology_hash}::${composite.boundary_proof_chain.replay_hash}`,
  );

  const determinism_attribution: HandoffReplayDeterminismAttribution = {
    handoff_hash: composite.boundary_proof_chain.handoff_hash,
    transfer_hash: composite.boundary_proof_chain.transfer_hash,
    timeline_hash: composite.boundary_proof_chain.timeline_hash,
    archaeology_hash: composite.boundary_proof_chain.archaeology_hash,
    replay_hash: composite.boundary_proof_chain.replay_hash,
    deterministic_composite_hash,
    recorded_at,
  };

  const determinism_bounds: ContinuityTransferDeterminismBounds = {
    transfer_hash: composite.boundary_proof_chain.transfer_hash,
    replay_hash: composite.boundary_proof_chain.replay_hash,
    archaeology_hash: composite.boundary_proof_chain.archaeology_hash,
    timeline_hash: composite.boundary_proof_chain.timeline_hash,
    deterministic_composite_hash,
    recorded_at,
  };

  return {
    organization_id: input.organization_id,
    determinism_attribution,
    determinism_bounds,
    boundary_proof_chain: composite.boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}
