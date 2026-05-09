/**
 * distributedRuntimeSummaryCounters — Phase 21. Sync counters for the
 * `distributed_runtime_summary` block on `AuthoritativeSystemState`.
 *
 * Mirrors Phase 11/12/13/14/15/16/17/18/19/20 sync pattern: in-memory
 * only, no DB reads in the hot path.
 */

import type {
  DistributedRuntimeSummarySnapshot, DistributedRuntimeHealthScores,
} from './distributedRuntimeTypes';
import { getNodeId, getActiveAdapterKind, getConnectionStatus } from './distributedBrokerRuntime';
import { buildIsolationProfile } from './brokerIsolationEngine';
import { recentReplayCount24h } from './runtimeContinuityReplay';
import { getAttributionStats } from './brokerOperationAttribution';
import { buildHealthScoresOnlyForTests } from './distributedRuntimeHealth';

let cachedPartitionCount = 0;

export function setCachedPartitionCount(n: number): void {
  cachedPartitionCount = n;
}

/** Sync — never reads DB. Safe to call inside `buildAuthoritativeStateFromInputs`. */
export function buildDistributedRuntimeSummary(): DistributedRuntimeSummarySnapshot {
  const stats = getAttributionStats();
  const isolation = buildIsolationProfile(getActiveAdapterKind());
  const health_scores: DistributedRuntimeHealthScores = buildHealthScoresOnlyForTests({
    ops_total: stats.ops_published,
    ops_fallback: stats.ops_fallback,
    ops_isolated: stats.ops_isolated,
    active_isolations: isolation.active_isolation_count,
    partition_count: cachedPartitionCount,
  });
  return {
    node_id: getNodeId(),
    active_adapter_kind: getActiveAdapterKind(),
    broker_continuity_status: getConnectionStatus(),
    partition_count: cachedPartitionCount,
    active_isolations: isolation.active_isolation_count,
    recent_replay_count_24h: recentReplayCount24h(),
    health_scores,
    last_updated: new Date().toISOString(),
  };
}
