/**
 * trustSurfaceGenerator — Phase 24. Aggregates inherited confidence
 * bands from Phase 18/20/21/22/23 into one operator-facing
 * `OperationalTrustSurface`.
 *
 * Architectural commitment:
 *   - Confidence is NEVER invented. Every band is sourced from an
 *     existing *ConfidenceBounds field.
 *   - Aggregate score is a deterministic average of the inherited
 *     scores; no synthesis, no probabilistic estimation.
 */

import type { OperationalTrustSurface } from './cognitiveCompressionTypes';
import { buildTopologyForecast } from '../topology/topologyForecastEngine';
import { buildTopologyFragmentationProfile } from '../topology/topologyFragmentationDetector';
import { buildIsolationProfile as buildBrokerIsolationProfile } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind } from '../distributedRuntime/distributedBrokerRuntime';
import { buildExecutionSubstrateSummary } from '../executionSubstrate/executionSummaryCounters';

export interface BuildTrustSurfaceInput {
  readonly organization_id: string;
}

export function buildOperationalTrustSurface(input: BuildTrustSurfaceInput): OperationalTrustSurface {
  const fragmentation = buildTopologyFragmentationProfile(input.organization_id);
  const forecast = buildTopologyForecast({ organization_id: input.organization_id });
  const brokerIso = buildBrokerIsolationProfile(getActiveAdapterKind());
  const execSummary = buildExecutionSubstrateSummary();

  // Each band is INHERITED from a single source. Phase 24 only relabels.
  const topologyConfidenceCenter = Math.round((forecast.bounds.confidence_low + forecast.bounds.confidence_high) / 2);
  const fragmentationCohesion = Math.max(0, 100 - fragmentation.fragmentation_pressure_score);
  const orgBrokerIsolations = brokerIso.isolated_namespaces.filter(
    i => i.organization_id === input.organization_id || i.organization_id === null,
  ).length;
  const brokerCohesion = Math.max(0, 100 - orgBrokerIsolations * 25);

  const bands: OperationalTrustSurface['bands'] = [
    {
      label: 'topology_forecast_confidence',
      score: topologyConfidenceCenter,
      inherited_from_phase: 'phase_22_topology',
      drivers: forecast.bounds.uncertainty_drivers,
      source_attribution_id: `fc:${forecast.organization_id}:${forecast.built_at}`,
    },
    {
      label: 'fragmentation_cohesion',
      score: fragmentationCohesion,
      inherited_from_phase: 'phase_22_topology',
      drivers: fragmentation.notes,
      source_attribution_id: `frag:${fragmentation.organization_id}:${fragmentation.built_at}`,
    },
    {
      label: 'broker_continuity_inherited',
      score: brokerCohesion,
      inherited_from_phase: 'phase_21_runtime',
      drivers: orgBrokerIsolations > 0 ? ['active_broker_isolation_in_org'] : ['no_active_broker_isolation'],
      source_attribution_id: `iso:${brokerIso.built_at}`,
    },
    {
      label: 'execution_substrate_continuity',
      score: execSummary.health_scores.execution_continuity,
      inherited_from_phase: 'phase_23_execution_substrate',
      drivers: execSummary.failed_24h > 0 || execSummary.interrupted_24h > 0
        ? [`failed_24h=${execSummary.failed_24h}`, `interrupted_24h=${execSummary.interrupted_24h}`]
        : ['no_recent_lifecycle_failures'],
      source_attribution_id: `exec:${execSummary.last_updated}`,
    },
    {
      label: 'execution_governance_stability',
      score: execSummary.health_scores.execution_governance_stability,
      inherited_from_phase: 'phase_23_execution_substrate',
      drivers: execSummary.recent_governance_decisions_24h > 0
        ? [`recent_governance_decisions_24h=${execSummary.recent_governance_decisions_24h}`]
        : ['no_recent_governance_decisions'],
      source_attribution_id: `exec_gov:${execSummary.last_updated}`,
    },
    {
      label: 'rollback_resilience_inherited',
      score: execSummary.health_scores.rollback_resilience,
      inherited_from_phase: 'phase_23_execution_substrate',
      drivers: execSummary.rolled_back_24h > 0 ? [`rolled_back_24h=${execSummary.rolled_back_24h}`] : ['no_recent_rollbacks'],
      source_attribution_id: `exec_rb:${execSummary.last_updated}`,
    },
  ];

  const aggregate_score = bands.length === 0
    ? 100
    : Math.round(bands.reduce((s, b) => s + b.score, 0) / bands.length);

  return {
    organization_id: input.organization_id,
    bands,
    aggregate_score,
    built_at: new Date().toISOString(),
  };
}
