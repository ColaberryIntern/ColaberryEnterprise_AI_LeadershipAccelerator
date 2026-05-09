/**
 * topologySummaryCounters — Phase 22. Sync counters for the
 * `topology_summary` block on `AuthoritativeSystemState`.
 *
 * Architectural commitment:
 *   - Sync, in-memory; never reads DB.
 *   - Aggregates across all partitions on this single node.
 */

import type {
  TopologySummarySnapshot, TopologyHealthScores, FragmentationTier,
} from './topologyTypes';
import { buildTopologyFragmentationProfile } from './topologyFragmentationDetector';
import { buildRuntimeDependencyProfile } from './runtimeDependencyTopology';
import { recentPropagationCount24h } from './runtimePropagationTopology';
import { recentRecoveryPlanCount24h } from './topologyRecoveryOrchestrator';
import { getActiveAdapter } from '../distributedRuntime/distributedBrokerRuntime';

let cachedOrgList: string[] = [];

export function setCachedOrgList(orgs: ReadonlyArray<string>): void {
  cachedOrgList = [...orgs];
}

/** Sync — never reads DB. Safe to call inside `buildAuthoritativeStateFromInputs`. */
export function buildTopologySummary(): TopologySummarySnapshot {
  const orgs = cachedOrgList;
  const tiers: FragmentationTier[] = orgs.map(o => buildTopologyFragmentationProfile(o).tier);
  const cohesive = tiers.filter(t => t === 'cohesive').length;
  const fragmented = tiers.filter(t => t === 'fragmented').length;
  const shattered = tiers.filter(t => t === 'shattered').length;
  const partial = tiers.filter(t => t === 'partial').length;

  let active_propagations_24h = 0;
  for (const o of orgs) active_propagations_24h += recentPropagationCount24h(o);

  const health_scores = computeHealth({
    partition_count: orgs.length,
    cohesive,
    partial,
    fragmented,
    shattered,
    organization_ids: orgs,
  });

  return {
    organization_id: null,
    partition_count: orgs.length,
    cohesive_partition_count: cohesive,
    fragmented_partition_count: fragmented,
    shattered_partition_count: shattered,
    active_propagations_24h,
    recent_recovery_plans_24h: recentRecoveryPlanCount24h(),
    health_scores,
    last_updated: new Date().toISOString(),
  };
}

interface HealthInput {
  partition_count: number;
  cohesive: number;
  partial: number;
  fragmented: number;
  shattered: number;
  organization_ids: ReadonlyArray<string>;
}

function computeHealth(input: HealthInput): TopologyHealthScores {
  const total = Math.max(1, input.partition_count);
  const cohesion = Math.round((input.cohesive / total) * 100);
  const fragmentation_pressure = Math.min(100, Math.round((input.fragmented * 30 + input.shattered * 60 + input.partial * 10) / total));
  const propagation_amplification = Math.min(100, Math.round((input.shattered * 50 + input.fragmented * 25) / total));
  // Dependency stability: average of per-partition dependency stability_score.
  let dep_total = 0;
  for (const org of input.organization_ids) dep_total += buildRuntimeDependencyProfile(org).stability_score;
  const dependency_stability = input.organization_ids.length === 0 ? 100 : Math.round(dep_total / input.organization_ids.length);
  const continuity_resilience = Math.max(0, 100 - fragmentation_pressure);
  const topology_recovery_readiness = Math.max(0, 100 - propagation_amplification);
  return {
    topology_cohesion: cohesion,
    fragmentation_pressure,
    propagation_amplification_score: propagation_amplification,
    dependency_stability,
    continuity_resilience,
    topology_recovery_readiness,
  };
}

/** Refresh the cached org list from the active broker (async — call before sync summary). */
export async function refreshCachedOrgList(): Promise<void> {
  try {
    const orgs = await getActiveAdapter().listOrganizations();
    cachedOrgList = [...orgs];
  } catch { /* fail-soft */ }
}
