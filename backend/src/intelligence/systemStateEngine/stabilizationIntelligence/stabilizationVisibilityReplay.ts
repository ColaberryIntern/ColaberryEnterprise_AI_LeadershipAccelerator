/**
 * stabilizationVisibilityReplay — Phase 29. Composite read-only
 * visibility surface across all Phase 29 reads.
 *
 * Architectural commitment:
 *   - Read-only composite — no side effects.
 *   - Cross-organization isolation absolute.
 */

import type { StabilizationVisibilityReplay } from './stabilizationIntelligenceTypes';
import { listArchetypes } from './recoveryArchetypeRegistry';
import { listSequencingProfiles } from './rollbackSequencingEngine';
import { listForecasts } from './continuityRestorationForecaster';
import { listPressureSamples } from './recoveryPressureAnalyzer';
import {
  listGovernanceAttributions, listFinalityProofs,
} from './recoveryGovernanceSupervisor';
import { listStabilizationNarratives } from './stabilizationNarrativeBuilder';
import { buildStabilizationTrustSurface } from './stabilizationTrustSurface';
import { buildStabilizationComposite } from './stabilizationPlaybookCoordinator';

export interface BuildVisibilityInput {
  readonly organization_id: string;
}

export function buildStabilizationVisibilityReplay(
  input: BuildVisibilityInput,
): StabilizationVisibilityReplay {
  const composite = buildStabilizationComposite({ organization_id: input.organization_id });
  const trust_surface = buildStabilizationTrustSurface({ organization_id: input.organization_id });
  return {
    organization_id: input.organization_id,
    archetypes: listArchetypes(input.organization_id),
    recent_sequencings: listSequencingProfiles(input.organization_id).slice(0, 25),
    recent_forecasts: listForecasts(input.organization_id).slice(0, 25),
    recent_pressure: listPressureSamples(input.organization_id).slice(0, 25),
    recent_governance: listGovernanceAttributions(input.organization_id).slice(0, 25),
    recent_finality_proofs: listFinalityProofs(input.organization_id).slice(0, 25),
    recent_narratives: listStabilizationNarratives(input.organization_id).slice(0, 10),
    current_stabilization_tier: composite.tier,
    trust_surface,
    built_at: new Date().toISOString(),
  };
}
