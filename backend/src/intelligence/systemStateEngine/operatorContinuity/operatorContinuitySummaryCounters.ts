/**
 * operatorContinuitySummaryCounters — Phase 32. Summary counters for
 * `operator_continuity_summary` block on `AuthoritativeSystemState`.
 */

import type {
  OperatorContinuitySummarySnapshot, OperatorContinuityHealthScores,
  HandoffDensityTier,
} from './operatorContinuityTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import { recentHandoffCount24h } from './governanceHandoffRegistry';
import { recentTransferBundleCount24h } from './continuityTransferEngine';
import { recentArchaeologyCount24h } from './operatorHandoffArchaeology';
import { recentReplayCount24h } from './collaborativeContinuityReplay';
import { recentCompressionCount24h } from './operatorCoordinationCompression';
import { recentContinuityTransferNarrativeCount24h } from './continuityTransferNarrativeBuilder';
import { recentHandoffGovernanceCount24h } from './handoffGovernanceSupervisor';

export function buildOperatorContinuitySummary(
  organization_id?: string,
): OperatorContinuitySummarySnapshot {
  const recent_handoffs_24h = recentHandoffCount24h(organization_id);
  const recent_transfer_bundles_24h = recentTransferBundleCount24h(organization_id);
  const recent_archaeology_24h = recentArchaeologyCount24h(organization_id);
  const recent_replays_24h = recentReplayCount24h(organization_id);
  const recent_compressions_24h = recentCompressionCount24h(organization_id);
  const recent_narratives_24h = recentContinuityTransferNarrativeCount24h(organization_id);
  const recent_governance_decisions_24h = recentHandoffGovernanceCount24h(organization_id);

  let current_density_tier: HandoffDensityTier = 'silent';
  if (recent_handoffs_24h >= 100) current_density_tier = 'continuous';
  else if (recent_handoffs_24h >= 25) current_density_tier = 'frequent';
  else if (recent_handoffs_24h >= 5) current_density_tier = 'paired';
  else if (recent_handoffs_24h >= 1) current_density_tier = 'sparse';

  const health_scores: OperatorContinuityHealthScores = {
    handoff_neutrality: 100,                                 // structural
    transfer_lineage_integrity: recent_transfer_bundles_24h > 0 ? 100 : 80,
    timeline_visibility: recent_handoffs_24h > 0 ? 100 : 80,
    archaeology_integrity: 100,                              // structural
    compression_transparency: 100,                           // structural
    replay_determinism: 100,                                 // structural
  };

  return {
    node_id: getNodeId(),
    recent_handoffs_24h,
    recent_transfer_bundles_24h,
    recent_archaeology_24h,
    recent_replays_24h,
    recent_compressions_24h,
    recent_narratives_24h,
    recent_governance_decisions_24h,
    current_density_tier,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}
