/**
 * governanceMemoryCoordinator — Phase 31. Read-only top-level composite
 * + 5-hash boundary proof chain.
 *
 * Architectural commitment:
 *   - PURE READ-ONLY composite. No mutation, no side effects.
 *   - 5-hash boundary proof chain: continuity + timeline + archaeology
 *     + replay + compression.
 *   - Operators verify same memory inputs == same composite outputs via
 *     the chain.
 */

import { createHash } from 'crypto';
import type {
  MemoryBoundaryProofChain, MemoryReplayDeterminismAttribution,
  GovernanceMemoryReplayBundle, OperatorContinuityProfile,
  StabilizationSessionTimeline, GovernanceArchaeologyReplay,
  ReasoningContinuityReplay, OperatorReasoningCompression,
} from './governanceMemoryTypes';
import { buildOperatorContinuityProfile } from './operatorContinuityRegistry';
import { buildStabilizationSessionTimeline } from './stabilizationSessionTimeline';
import { buildGovernanceArchaeology } from './governanceArchaeologyEngine';
import { buildReasoningContinuityReplay } from './reasoningContinuityReplay';
import { buildOperatorReasoningCompression } from './operatorReasoningCompression';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildCompositeInput {
  readonly organization_id: string;
}

export interface GovernanceMemoryComposite {
  readonly organization_id: string;
  readonly continuity: OperatorContinuityProfile;
  readonly timeline: StabilizationSessionTimeline;
  readonly archaeology: GovernanceArchaeologyReplay;
  readonly replay: ReasoningContinuityReplay;
  readonly compression: OperatorReasoningCompression;
  readonly boundary_proof_chain: MemoryBoundaryProofChain;
  readonly built_at: string;
}

export function buildGovernanceMemoryComposite(
  input: BuildCompositeInput,
): GovernanceMemoryComposite {
  const continuity = buildOperatorContinuityProfile({ organization_id: input.organization_id });
  const timeline = buildStabilizationSessionTimeline({ organization_id: input.organization_id });
  const archaeology = buildGovernanceArchaeology({ organization_id: input.organization_id });
  const replay = buildReasoningContinuityReplay({ organization_id: input.organization_id });
  const compression = buildOperatorReasoningCompression({ organization_id: input.organization_id });

  const boundary_proof_chain: MemoryBoundaryProofChain = {
    continuity_hash: continuity.profile_hash,
    timeline_hash: timeline.timeline_hash,
    archaeology_hash: archaeology.archaeology_hash,
    replay_hash: replay.replay_hash,
    compression_hash: compression.compression_hash,
  };

  return {
    organization_id: input.organization_id,
    continuity, timeline, archaeology, replay, compression,
    boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}

export function buildGovernanceMemoryReplayBundle(
  input: BuildCompositeInput,
): GovernanceMemoryReplayBundle {
  const composite = buildGovernanceMemoryComposite(input);
  const recorded_at = new Date().toISOString();
  const determinism_attribution: MemoryReplayDeterminismAttribution = {
    continuity_hash: composite.boundary_proof_chain.continuity_hash,
    timeline_hash: composite.boundary_proof_chain.timeline_hash,
    archaeology_hash: composite.boundary_proof_chain.archaeology_hash,
    replay_hash: composite.boundary_proof_chain.replay_hash,
    compression_hash: composite.boundary_proof_chain.compression_hash,
    deterministic_composite_hash: deterministicHash(
      `${composite.boundary_proof_chain.continuity_hash}::${composite.boundary_proof_chain.timeline_hash}::${composite.boundary_proof_chain.archaeology_hash}::${composite.boundary_proof_chain.replay_hash}::${composite.boundary_proof_chain.compression_hash}`,
    ),
    recorded_at,
  };
  return {
    organization_id: input.organization_id,
    determinism_attribution,
    boundary_proof_chain: composite.boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}
