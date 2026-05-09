/**
 * recoveryForesightVisibilityReplay — Phase 30. Composite read-only
 * visibility surface aggregating all Phase 30 reads.
 *
 * Architectural commitment:
 *   - Read-only composite — no side effects.
 *   - Cross-organization isolation absolute.
 */

import type {
  RecoveryForesightVisibilityReplay, DecisionForesightTier,
} from './recoveryForesightTypes';
import { listComparisons } from './stabilizationDecisionEngine';
import { listSurvivabilityComparisons } from './rollbackSurvivabilityComparator';
import { listTradeoffProfiles } from './continuityTradeoffAnalyzer';
import { listArchaeologyTraces } from './recoveryArchaeologyReplay';
import { listWalkthroughs } from './recoveryNarrativeWalkthrough';
import { listDecisionGovernanceAttributions } from './decisionGovernanceSupervisor';
import { buildRecoveryForesightTrustSurface } from './recoveryForesightTrustSurface';

export interface BuildVisibilityInput {
  readonly organization_id: string;
  readonly operator_id: string;
}

export function buildRecoveryForesightVisibilityReplay(
  input: BuildVisibilityInput,
): RecoveryForesightVisibilityReplay {
  // Determine current foresight tier from the most recent comparison
  // if any exists; default 'unsuitable' otherwise.
  const recentComparisons = listComparisons(input.organization_id).slice(0, 25);
  const current_foresight_tier: DecisionForesightTier =
    recentComparisons.length > 0 ? recentComparisons[0].tier : 'unsuitable';

  const trust_surface = buildRecoveryForesightTrustSurface({
    organization_id: input.organization_id,
    operator_id: input.operator_id,
  });

  return {
    organization_id: input.organization_id,
    recent_comparisons: recentComparisons,
    recent_survivability: listSurvivabilityComparisons(input.organization_id).slice(0, 25),
    recent_tradeoffs: listTradeoffProfiles(input.organization_id).slice(0, 25),
    recent_archaeology: listArchaeologyTraces(input.organization_id).slice(0, 25),
    recent_walkthroughs: listWalkthroughs(input.organization_id).slice(0, 10),
    recent_governance: listDecisionGovernanceAttributions(input.organization_id).slice(0, 25),
    current_foresight_tier,
    trust_surface,
    built_at: new Date().toISOString(),
  };
}
