/**
 * stabilizationSummaryCounters — Phase 29. Summary counters for the
 * `stabilization_summary` block on `AuthoritativeSystemState`.
 */

import type {
  StabilizationSummarySnapshot, StabilizationHealthScores,
  StabilizationTier,
} from './stabilizationIntelligenceTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import { recentArchetypeGovernanceCount24h } from './recoveryArchetypeRegistry';
import { recentSequencingCount24h } from './rollbackSequencingEngine';
import { recentForecastCount24h } from './continuityRestorationForecaster';
import { recentPressureSampleCount24h } from './recoveryPressureAnalyzer';
import {
  recentGovernanceCount24h, recentFinalityProofCount24h,
} from './recoveryGovernanceSupervisor';

export function buildStabilizationSummary(
  organization_id?: string,
): StabilizationSummarySnapshot {
  const recent_archetype_governance_changes_24h = recentArchetypeGovernanceCount24h(organization_id);
  const recent_sequencings_24h = recentSequencingCount24h(organization_id);
  const recent_forecasts_24h = recentForecastCount24h(organization_id);
  const recent_pressure_samples_24h = recentPressureSampleCount24h(organization_id);
  const recent_governance_decisions_24h = recentGovernanceCount24h(organization_id);
  const recent_finality_proofs_24h = recentFinalityProofCount24h(organization_id);

  // Default tier is 'stable' for the summary block — composite tier
  // is computed per-org via the coordinator. Here we expose 'stable'
  // unless we have evidence of strain in the 24h window.
  let current_stabilization_tier: StabilizationTier = 'stable';
  if (recent_finality_proofs_24h > 0) current_stabilization_tier = 'recovering';
  if (recent_pressure_samples_24h > 0
      && recent_sequencings_24h > 5) current_stabilization_tier = 'strained';

  const health_scores: StabilizationHealthScores = {
    rollback_survivability_confidence: 100,
    continuity_restoration_trust: recent_forecasts_24h === 0 ? 80 : 80,        // capped
    recovery_replay_integrity: 100,
    topology_restoration_confidence: 100,
    stabilization_reliability: recent_governance_decisions_24h > 50 ? 80 : 100,
    recovery_governance_trust: 100,
  };

  return {
    node_id: getNodeId(),
    recent_archetype_governance_changes_24h,
    recent_sequencings_24h,
    recent_forecasts_24h,
    recent_pressure_samples_24h,
    recent_governance_decisions_24h,
    recent_finality_proofs_24h,
    current_stabilization_tier,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}
