/**
 * governanceMemoryTrustSurface — Phase 31. 6-band trust surface.
 *
 * Architectural commitment:
 *   - 4 bands STRUCTURALLY 100 (typed-as-literal commitments).
 *   - Cross-organization isolation absolute.
 */

import type { GovernanceMemoryTrustSurface } from './governanceMemoryTypes';
import { buildGovernanceMemoryComposite } from './governanceMemoryCoordinator';

export interface BuildTrustSurfaceInput {
  readonly organization_id: string;
}

export function buildGovernanceMemoryTrustSurface(
  input: BuildTrustSurfaceInput,
): GovernanceMemoryTrustSurface {
  const composite = buildGovernanceMemoryComposite(input);

  const memory_neutrality = 100;                               // structural
  const continuity_integrity = composite.continuity.total_events > 0 ? 100 : 80;
  const timeline_visibility = composite.timeline.events.length > 0 ? 100 : 80;
  const archaeology_integrity = 100;                           // structural — read_only typed-as-true
  const compression_transparency = 100;                        // structural — omission_attribution required
  const replay_determinism = 100;                              // structural — typed-as-true

  const bands = [
    {
      label: 'memory_neutrality',
      score: memory_neutrality,
      inherited_from_phase: 'phase_31_memory' as const,
      drivers: ['no_operator_profiling=true', 'no_behavioral_prediction=true', 'no_operator_ranking=true'],
      source_attribution_id: composite.continuity.profile_hash,
    },
    {
      label: 'continuity_integrity',
      score: continuity_integrity,
      inherited_from_phase: 'phase_31_memory' as const,
      drivers: [`total_events=${composite.continuity.total_events}`],
      source_attribution_id: composite.continuity.profile_hash,
    },
    {
      label: 'timeline_visibility',
      score: timeline_visibility,
      inherited_from_phase: 'phase_31_memory' as const,
      drivers: [`event_count=${composite.timeline.events.length}`],
      source_attribution_id: composite.timeline.timeline_hash,
    },
    {
      label: 'archaeology_integrity',
      score: archaeology_integrity,
      inherited_from_phase: 'phase_31_memory' as const,
      drivers: ['read_only=true', 'bounded_to_organization=true'],
      source_attribution_id: composite.archaeology.archaeology_hash,
    },
    {
      label: 'compression_transparency',
      score: compression_transparency,
      inherited_from_phase: 'phase_31_memory' as const,
      drivers: ['omission_attribution_mandatory=true', `lossless=${composite.compression.omission_attribution.lossless}`],
      source_attribution_id: composite.compression.compression_hash,
    },
    {
      label: 'replay_determinism',
      score: replay_determinism,
      inherited_from_phase: 'phase_31_memory' as const,
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
