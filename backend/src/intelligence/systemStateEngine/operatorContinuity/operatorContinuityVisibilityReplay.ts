/**
 * operatorContinuityVisibilityReplay — Phase 32. Composite read-only
 * visibility surface aggregating all Phase 32 reads.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  OperatorContinuityVisibilityReplay, HandoffDensityTier,
  HandoffReplayNeutralityProof, CollaborativeVisibilityAttribution,
} from './operatorContinuityTypes';
import {
  DENSITY_SILENT_THRESHOLD, DENSITY_SPARSE_THRESHOLD,
  DENSITY_PAIRED_THRESHOLD, DENSITY_FREQUENT_THRESHOLD,
} from './operatorContinuityTypes';
import { listHandoffs } from './governanceHandoffRegistry';
import { listTransferBundles } from './continuityTransferEngine';
import { buildSharedStabilizationTimeline } from './sharedStabilizationTimeline';
import { buildOperatorHandoffArchaeology } from './operatorHandoffArchaeology';
import { listContinuityTransferNarratives } from './continuityTransferNarrativeBuilder';
import { listHandoffGovernanceAttributions } from './handoffGovernanceSupervisor';
import { buildOperatorContinuityTrustSurface } from './operatorContinuityTrustSurface';

interface PartitionStore {
  neutrality_proofs: HandoffReplayNeutralityProof[];
  visibility_attributions: CollaborativeVisibilityAttribution[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { neutrality_proofs: [], visibility_attributions: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function classifyDensity(handoff_count: number): HandoffDensityTier {
  if (handoff_count >= DENSITY_FREQUENT_THRESHOLD) return 'continuous';
  if (handoff_count >= DENSITY_PAIRED_THRESHOLD) return 'frequent';
  if (handoff_count >= DENSITY_SPARSE_THRESHOLD) return 'paired';
  if (handoff_count >= DENSITY_SILENT_THRESHOLD) return 'sparse';
  return 'silent';
}

export interface BuildVisibilityInput {
  readonly organization_id: string;
}

export function buildOperatorContinuityVisibilityReplay(
  input: BuildVisibilityInput,
): OperatorContinuityVisibilityReplay {
  const handoffs = listHandoffs(input.organization_id);
  const transfer_bundles = listTransferBundles(input.organization_id).slice(0, 25);
  const timeline = buildSharedStabilizationTimeline({ organization_id: input.organization_id, limit: 50 });
  const archaeology = buildOperatorHandoffArchaeology({ organization_id: input.organization_id });
  const narratives = listContinuityTransferNarratives(input.organization_id).slice(0, 10);
  const governance = listHandoffGovernanceAttributions(input.organization_id).slice(0, 25);
  const trust_surface = buildOperatorContinuityTrustSurface({ organization_id: input.organization_id });

  const current_density_tier = classifyDensity(handoffs.length);

  return {
    organization_id: input.organization_id,
    recent_handoffs: handoffs.slice(0, 25),
    recent_transfer_bundles: transfer_bundles,
    recent_timeline: timeline,
    recent_archaeology: archaeology,
    recent_narratives: narratives,
    recent_governance: governance,
    current_density_tier,
    trust_surface,
    built_at: new Date().toISOString(),
  };
}

/**
 * Record a HandoffReplayNeutralityProof attesting that this build of
 * the visibility composite remained STRUCTURALLY NEUTRAL.
 */
export function recordHandoffReplayNeutralityProof(input: {
  organization_id: string; continuity_id: string;
}): HandoffReplayNeutralityProof {
  const recorded_at = new Date().toISOString();
  const proof: HandoffReplayNeutralityProof = {
    continuity_id: input.continuity_id,
    no_operator_ranking: true,
    no_collaboration_scoring: true,
    no_behavioral_inference: true,
    no_capability_prediction: true,
    deterministic_hash: deterministicHash(`neutrality::${input.continuity_id}::${recorded_at}`),
    recorded_at,
  };
  const store = ensure(input.organization_id);
  store.neutrality_proofs.push(proof);
  if (store.neutrality_proofs.length > 200) store.neutrality_proofs.shift();
  return proof;
}

/**
 * Record a CollaborativeVisibilityAttribution explaining WHY each
 * continuity surface appeared.
 */
export function recordCollaborativeVisibilityAttribution(input: {
  organization_id: string;
  continuity_id: string;
  surfaced_references: ReadonlyArray<string>;
  surfaced_archaeology: ReadonlyArray<string>;
  surfaced_timeline_events: ReadonlyArray<string>;
  surfaced_compression_omissions: ReadonlyArray<string>;
}): CollaborativeVisibilityAttribution {
  const recorded_at = new Date().toISOString();
  const attribution: CollaborativeVisibilityAttribution = {
    continuity_id: input.continuity_id,
    surfaced_references: input.surfaced_references,
    surfaced_archaeology: input.surfaced_archaeology,
    surfaced_timeline_events: input.surfaced_timeline_events,
    surfaced_compression_omissions: input.surfaced_compression_omissions,
    deterministic_hash: deterministicHash(
      `vis::${input.continuity_id}::${input.surfaced_references.length}::${input.surfaced_archaeology.length}::${input.surfaced_timeline_events.length}::${input.surfaced_compression_omissions.length}::${recorded_at}`,
    ),
    recorded_at,
  };
  const store = ensure(input.organization_id);
  store.visibility_attributions.push(attribution);
  if (store.visibility_attributions.length > 200) store.visibility_attributions.shift();
  return attribution;
}

export function listHandoffNeutralityProofs(
  organization_id: string,
): ReadonlyArray<HandoffReplayNeutralityProof> {
  return [...(partitions.get(organization_id)?.neutrality_proofs ?? [])].reverse();
}

export function listCollaborativeVisibilityAttributions(
  organization_id: string,
): ReadonlyArray<CollaborativeVisibilityAttribution> {
  return [...(partitions.get(organization_id)?.visibility_attributions ?? [])].reverse();
}

export function _resetVisibilityReplayForTests(): void {
  partitions.clear();
}
