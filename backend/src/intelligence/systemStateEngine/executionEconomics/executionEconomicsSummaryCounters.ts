/**
 * executionEconomicsSummaryCounters — Phase 28. Summary counters for the
 * `execution_economics_summary` block on `AuthoritativeSystemState`.
 */

import type {
  ExecutionEconomicsSummarySnapshot, ExecutionEconomicsHealthScores,
  ExecutionEconomicsTier,
} from './executionEconomicsTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import {
  recentQuotaExhaustionCount24h, recentQuotaGovernanceCount24h,
} from './executionQuotaEngine';
import { recentPressureSampleCount24h } from './runtimePressureGovernor';
import { recentLoadClassificationCount24h } from './topologyLoadDistributionProfiler';
import { recentForecastCount24h } from './rollbackResourceForecaster';

export function buildExecutionEconomicsSummary(
  organization_id?: string,
): ExecutionEconomicsSummarySnapshot {
  const recent_quota_exhaustions_24h = recentQuotaExhaustionCount24h(organization_id);
  const recent_quota_governance_changes_24h = recentQuotaGovernanceCount24h(organization_id);
  const recent_pressure_samples_24h = recentPressureSampleCount24h(organization_id);
  const recent_load_classifications_24h = recentLoadClassificationCount24h(organization_id);
  const recent_forecasts_24h = recentForecastCount24h(organization_id);

  // Default: 'stable' until any signal observed.
  let current_economics_tier: ExecutionEconomicsTier = 'stable';
  if (recent_quota_exhaustions_24h > 0) current_economics_tier = 'exhausted';

  const health_scores: ExecutionEconomicsHealthScores = {
    budget_reliability: 100,
    rollback_cost_certainty: recent_forecasts_24h === 0 ? 30 : 80,
    pressure_classification_confidence: recent_pressure_samples_24h === 0 ? 80 : 100,
    topology_load_integrity: 100,
    quota_safety: recent_quota_exhaustions_24h === 0 ? 100 : 50,
    replay_integrity: 100,
  };

  return {
    node_id: getNodeId(),
    recent_quota_exhaustions_24h,
    recent_quota_governance_changes_24h,
    recent_pressure_samples_24h,
    recent_load_classifications_24h,
    recent_forecasts_24h,
    current_economics_tier,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}
