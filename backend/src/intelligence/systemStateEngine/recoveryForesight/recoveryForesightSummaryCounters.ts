/**
 * recoveryForesightSummaryCounters — Phase 30. Summary counters for
 * `recovery_foresight_summary` block on `AuthoritativeSystemState`.
 */

import type {
  RecoveryForesightSummarySnapshot, RecoveryForesightHealthScores,
  DecisionForesightTier,
} from './recoveryForesightTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import { recentComparisonCount24h } from './stabilizationDecisionEngine';
import { recentSurvivabilityCount24h } from './rollbackSurvivabilityComparator';
import { recentTradeoffCount24h } from './continuityTradeoffAnalyzer';
import { recentArchaeologyCount24h } from './recoveryArchaeologyReplay';
import { recentWalkthroughCount24h } from './recoveryNarrativeWalkthrough';
import { recentDecisionGovernanceCount24h } from './decisionGovernanceSupervisor';

export function buildRecoveryForesightSummary(
  organization_id?: string,
): RecoveryForesightSummarySnapshot {
  const recent_comparisons_24h = recentComparisonCount24h(organization_id);
  const recent_survivability_24h = recentSurvivabilityCount24h(organization_id);
  const recent_tradeoffs_24h = recentTradeoffCount24h(organization_id);
  const recent_archaeology_24h = recentArchaeologyCount24h(organization_id);
  const recent_walkthroughs_24h = recentWalkthroughCount24h(organization_id);
  const recent_governance_decisions_24h = recentDecisionGovernanceCount24h(organization_id);

  // Current tier — default 'unsuitable' until comparisons surface.
  let current_foresight_tier: DecisionForesightTier = 'unsuitable';
  if (recent_comparisons_24h > 0) current_foresight_tier = 'explorable';

  const health_scores: RecoveryForesightHealthScores = {
    comparison_neutrality: 100,                       // structural
    survivability_visibility: recent_survivability_24h > 0 ? 100 : 80,
    tradeoff_clarity: 100,                            // structural
    archaeology_integrity: 100,                       // structural
    guidance_advisory_safety: 100,                    // structural
    decision_governance_trust: 100,                   // structural
  };

  return {
    node_id: getNodeId(),
    recent_comparisons_24h,
    recent_survivability_24h,
    recent_tradeoffs_24h,
    recent_archaeology_24h,
    recent_walkthroughs_24h,
    recent_governance_decisions_24h,
    current_foresight_tier,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}
