/**
 * cognitiveLoadAnalyzer — Phase 24. Deterministic 4-tier classifier
 * over OBSERVABLE operational counters.
 *
 * Architectural commitment:
 *   - No psychological inference, no behavioral prediction, no operator
 *     cognition estimation. Load is a function of observable signals.
 *   - 4 tiers: light / moderate / dense / overloaded.
 */

import type {
  CognitiveLoadProfile, CognitiveLoadTier,
} from './cognitiveCompressionTypes';
import { buildTopologyFragmentationProfile } from '../topology/topologyFragmentationDetector';
import { recentPropagationCount24h, listRecentPropagationReplays } from '../topology/runtimePropagationTopology';
import { listTopologyRecoveryPlans } from '../topology/topologyRecoveryOrchestrator';
import { buildIsolationProfile as buildBrokerIsolationProfile } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind } from '../distributedRuntime/distributedBrokerRuntime';
import { buildIsolationProfile as buildExecIsolationProfile } from '../executionSubstrate/executionIsolationEngine';
import { recentLifecycleCount24h } from '../executionSubstrate/executionRuntimeCoordinator';
import { recentReplayCount24h } from '../distributedRuntime/runtimeContinuityReplay';

export interface BuildLoadProfileInput {
  readonly organization_id: string;
}

export function buildCognitiveLoadProfile(input: BuildLoadProfileInput): CognitiveLoadProfile {
  const fragmentation = buildTopologyFragmentationProfile(input.organization_id);
  const propagationCount = recentPropagationCount24h(input.organization_id);
  const pendingPropagations = listRecentPropagationReplays(input.organization_id).length;
  const recoveryPlanCount = listTopologyRecoveryPlans(input.organization_id).length;
  const brokerIso = buildBrokerIsolationProfile(getActiveAdapterKind());
  const orgBrokerIsolations = brokerIso.isolated_namespaces.filter(
    i => i.organization_id === input.organization_id || i.organization_id === null,
  ).length;
  const execIso = buildExecIsolationProfile();
  const orgExecIsolations = execIso.isolated_kinds.filter(i => i.organization_id === input.organization_id).length;
  const lifecycleCounts = recentLifecycleCount24h();
  const recent_failures_24h = lifecycleCounts.failed + lifecycleCounts.interrupted;
  const replay_backlog = recentReplayCount24h();

  // Each driver contributes a deterministic weighted load fragment.
  const drivers: CognitiveLoadProfile['drivers'] = [
    {
      metric: 'fragmentation_pressure',
      observed_value: fragmentation.fragmentation_pressure_score,
      contribution: Math.min(40, Math.round(fragmentation.fragmentation_pressure_score * 0.4)),
    },
    {
      metric: 'active_broker_isolations',
      observed_value: orgBrokerIsolations,
      contribution: Math.min(20, orgBrokerIsolations * 10),
    },
    {
      metric: 'active_execution_isolations',
      observed_value: orgExecIsolations,
      contribution: Math.min(20, orgExecIsolations * 10),
    },
    {
      metric: 'recent_failures_24h',
      observed_value: recent_failures_24h,
      contribution: Math.min(20, recent_failures_24h * 4),
    },
    {
      metric: 'pending_propagations',
      observed_value: pendingPropagations,
      contribution: Math.min(15, pendingPropagations * 3),
    },
    {
      metric: 'recovery_plan_count',
      observed_value: recoveryPlanCount,
      contribution: Math.min(10, recoveryPlanCount * 2),
    },
    {
      metric: 'replay_backlog',
      observed_value: replay_backlog,
      contribution: Math.min(10, replay_backlog * 2),
    },
  ].sort((a, b) => b.contribution - a.contribution);

  const load_score = Math.min(100, drivers.reduce((s, d) => s + d.contribution, 0));
  const tier: CognitiveLoadTier =
    load_score >= 75 ? 'overloaded' :
    load_score >= 50 ? 'dense' :
    load_score >= 25 ? 'moderate' :
    'light';

  return {
    organization_id: input.organization_id,
    tier,
    load_score,
    drivers,
    observable_signals: {
      pending_propagations: pendingPropagations,
      active_broker_isolations: orgBrokerIsolations,
      active_execution_isolations: orgExecIsolations,
      recent_failures_24h,
      recovery_plan_count: recoveryPlanCount,
      fragmentation_pressure: fragmentation.fragmentation_pressure_score,
      replay_backlog,
    },
    built_at: new Date().toISOString(),
  };
}

/** Helper used by the topology endpoint for cross-references. */
void recentPropagationCount24h;
