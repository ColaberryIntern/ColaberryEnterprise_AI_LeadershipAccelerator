/**
 * executionEconomicsVisibilityReplay — Phase 28. Composite visibility
 * surface combining all Phase 28 reads.
 *
 * Architectural commitment:
 *   - Read-only composite — no side effects.
 *   - Cross-organization isolation absolute.
 */

import type {
  ExecutionEconomicsVisibilityReplay,
} from './executionEconomicsTypes';
import { buildEconomicsComposite } from './executionEconomicsCoordinator';
import { listQuotaGovernanceAttributions, listQuotaExhaustions } from './executionQuotaEngine';
import { listExecutionEconomicsNarratives } from './executionEconomicsNarrativeBuilder';
import { buildExecutionEconomicsTrustSurface } from './executionEconomicsTrustSurface';

export interface BuildVisibilityReplayInput {
  readonly organization_id: string;
}

export function buildExecutionEconomicsVisibilityReplay(
  input: BuildVisibilityReplayInput,
): ExecutionEconomicsVisibilityReplay {
  const composite = buildEconomicsComposite({ organization_id: input.organization_id });
  const trust_surface = buildExecutionEconomicsTrustSurface({ organization_id: input.organization_id });
  return {
    organization_id: input.organization_id,
    quota_profile: composite.quota,
    pressure_profile: composite.pressure,
    topology_load: composite.topology_load,
    rollback_forecast: composite.rollback_forecast,
    recent_quota_governance: listQuotaGovernanceAttributions(input.organization_id).slice(0, 25),
    recent_quota_exhaustions: listQuotaExhaustions(input.organization_id).slice(0, 25),
    recent_narratives: listExecutionEconomicsNarratives(input.organization_id).slice(0, 10),
    economics_tier: composite.tier,
    trust_surface,
    built_at: new Date().toISOString(),
  };
}
