/**
 * governanceMemoryVisibilityReplay — Phase 31. Composite read-only
 * visibility surface aggregating all Phase 31 reads.
 */

import type {
  GovernanceMemoryVisibilityReplay,
} from './governanceMemoryTypes';
import { buildOperatorContinuityProfile } from './operatorContinuityRegistry';
import { buildCognitionTimelineSurface } from './cognitionTimelineSurface';
import { buildGovernanceArchaeology } from './governanceArchaeologyEngine';
import { listContinuityNarratives } from './continuityNarrativeBuilder';
import { listMemoryGovernanceAttributions } from './governanceMemorySupervisor';
import { buildGovernanceMemoryTrustSurface } from './governanceMemoryTrustSurface';

export interface BuildVisibilityInput {
  readonly organization_id: string;
}

export function buildGovernanceMemoryVisibilityReplay(
  input: BuildVisibilityInput,
): GovernanceMemoryVisibilityReplay {
  const continuity_profile = buildOperatorContinuityProfile({ organization_id: input.organization_id });
  const timeline_surface = buildCognitionTimelineSurface({
    organization_id: input.organization_id, limit: 50,
  });
  const recent_archaeology = buildGovernanceArchaeology({ organization_id: input.organization_id });
  const trust_surface = buildGovernanceMemoryTrustSurface({ organization_id: input.organization_id });

  return {
    organization_id: input.organization_id,
    continuity_profile,
    recent_timeline_points: timeline_surface.points,
    recent_archaeology,
    recent_narratives: listContinuityNarratives(input.organization_id).slice(0, 10),
    recent_governance: listMemoryGovernanceAttributions(input.organization_id).slice(0, 25),
    current_density_tier: continuity_profile.density_tier,
    trust_surface,
    built_at: new Date().toISOString(),
  };
}
