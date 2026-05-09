/**
 * operatorContinuityTrustSurface — Phase 32. 6-band trust surface.
 * 4 bands STRUCTURALLY 100 (typed-as-literal commitments).
 */

import type { OperatorContinuityTrustSurface } from './operatorContinuityTypes';
import { buildMultiOperatorComposite } from './multiOperatorCoordinator';

export interface BuildTrustSurfaceInput {
  readonly organization_id: string;
}

export function buildOperatorContinuityTrustSurface(
  input: BuildTrustSurfaceInput,
): OperatorContinuityTrustSurface {
  const composite = buildMultiOperatorComposite(input);

  const handoff_neutrality = 100;                            // structural
  const transfer_lineage_integrity = composite.transfer_bundles.length > 0 ? 100 : 80;
  const timeline_visibility = composite.timeline.points.length > 0 ? 100 : 80;
  const archaeology_integrity = 100;                         // structural
  const compression_transparency = 100;                      // structural
  const replay_determinism = 100;                            // structural

  const bands = [
    {
      label: 'handoff_neutrality',
      score: handoff_neutrality,
      inherited_from_phase: 'phase_32_handoff' as const,
      drivers: ['no_operator_ranking=true', 'no_collaboration_scoring=true', 'no_behavioral_inference=true', 'no_capability_prediction=true'],
      source_attribution_id: composite.boundary_proof_chain.handoff_hash,
    },
    {
      label: 'transfer_lineage_integrity',
      score: transfer_lineage_integrity,
      inherited_from_phase: 'phase_32_handoff' as const,
      drivers: [`transfer_bundles=${composite.transfer_bundles.length}`, 'grants_authority=false'],
      source_attribution_id: composite.boundary_proof_chain.transfer_hash,
    },
    {
      label: 'timeline_visibility',
      score: timeline_visibility,
      inherited_from_phase: 'phase_32_handoff' as const,
      drivers: [`timeline_points=${composite.timeline.points.length}`, 'derived_from_phase_31=true'],
      source_attribution_id: composite.timeline.timeline_hash,
    },
    {
      label: 'archaeology_integrity',
      score: archaeology_integrity,
      inherited_from_phase: 'phase_32_handoff' as const,
      drivers: ['read_only=true', 'bounded_to_organization=true'],
      source_attribution_id: composite.archaeology.archaeology_hash,
    },
    {
      label: 'compression_transparency',
      score: compression_transparency,
      inherited_from_phase: 'phase_32_handoff' as const,
      drivers: ['omission_attribution_mandatory=true', `lossless=${composite.compression.omission_attribution.lossless}`],
      source_attribution_id: composite.compression.compression_hash,
    },
    {
      label: 'replay_determinism',
      score: replay_determinism,
      inherited_from_phase: 'phase_32_handoff' as const,
      drivers: ['deterministic=true', 'read_only=true'],
      source_attribution_id: composite.replay.replay_hash,
    },
  ];

  const aggregate_score = Math.round(
    bands.reduce((acc, b) => acc + b.score, 0) / bands.length,
  );

  return {
    organization_id: input.organization_id,
    bands,
    aggregate_score,
    built_at: new Date().toISOString(),
  };
}
