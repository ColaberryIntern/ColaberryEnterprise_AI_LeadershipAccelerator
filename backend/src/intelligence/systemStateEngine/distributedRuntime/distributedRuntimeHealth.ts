/**
 * distributedRuntimeHealth — Phase 21. Computes the 6 health scores
 * + assembles the `DistributedRuntimeVisibility` payload.
 */

import type {
  DistributedRuntimeHealthScores, DistributedRuntimeVisibility,
} from './distributedRuntimeTypes';
import { getNodeId, getConnectionStatus, getActiveAdapterKind } from './distributedBrokerRuntime';
import { listPartitions } from './runtimePartitionCoordinator';
import { buildIsolationProfile } from './brokerIsolationEngine';
import { recentReplayCount24h, listRecentReplays } from './runtimeContinuityReplay';
import { getAttributionStats } from './brokerOperationAttribution';

export async function buildRuntimeVisibility(): Promise<DistributedRuntimeVisibility> {
  const partitions = await listPartitions();
  const isolation = buildIsolationProfile(getActiveAdapterKind());
  const stats = getAttributionStats();
  const recentReplays = listRecentReplays().slice(0, 5);

  // ── Health scores ──
  const broker_continuity = brokerContinuityScore();
  const partition_isolation = partitionIsolationScore(isolation.active_isolation_count, partitions.length);
  // Single broker → always 100 unless an isolation has tripped.
  const synchronization_stability = isolation.active_isolation_count === 0 ? 100 : Math.max(50, 100 - isolation.active_isolation_count * 10);
  const replay_recovery = replayRecoveryScore(recentReplays);
  const distributed_topology_stability = topologyStabilityScore(isolation.active_isolation_count, broker_continuity);
  const runtime_drift_pressure = runtimeDriftPressure(stats.ops_published, stats.ops_fallback, stats.ops_isolated);

  const health_scores: DistributedRuntimeHealthScores = {
    broker_continuity,
    partition_isolation,
    synchronization_stability,
    replay_recovery,
    distributed_topology_stability,
    runtime_drift_pressure,
  };

  const replay_backlog_estimate = Math.min(100, recentReplayCount24h() * 5);
  const synchronization_pressure = Math.min(100, isolation.active_isolation_count * 25);
  const runtime_drift = runtime_drift_pressure;

  let federation_continuity_status: DistributedRuntimeVisibility['federation_continuity_status'];
  if (broker_continuity >= 90 && isolation.active_isolation_count === 0) federation_continuity_status = 'continuous';
  else if (broker_continuity >= 60) federation_continuity_status = 'recovering';
  else if (broker_continuity >= 30) federation_continuity_status = 'degraded';
  else federation_continuity_status = 'broken';

  return {
    node_id: getNodeId(),
    partitions,
    broker_continuity_status: getConnectionStatus(),
    active_isolations: isolation.active_isolation_count,
    replay_backlog_estimate,
    synchronization_pressure,
    runtime_drift,
    federation_continuity_status,
    health_scores,
    built_at: new Date().toISOString(),
  };
}

function brokerContinuityScore(): number {
  const status = getConnectionStatus();
  switch (status) {
    case 'connected': return 100;
    case 'connecting': return 70;
    case 'reconnecting': return 50;
    case 'disconnected': return 25;
    case 'isolated': return 10;
  }
}

function partitionIsolationScore(active_isolations: number, partition_count: number): number {
  if (partition_count === 0) return 100;
  const ratio = active_isolations / partition_count;
  return Math.max(0, Math.round(100 - ratio * 100));
}

function replayRecoveryScore(recent: ReturnType<typeof listRecentReplays>): number {
  if (recent.length === 0) return 100;
  const failed = recent.filter(r => r.bounds.replay_outcome === 'failed').length;
  const partial = recent.filter(r => r.bounds.replay_outcome === 'partial').length;
  return Math.max(0, 100 - failed * 30 - partial * 10);
}

function topologyStabilityScore(active_isolations: number, broker_continuity: number): number {
  return Math.max(0, Math.round(broker_continuity * 0.7 + (active_isolations === 0 ? 30 : Math.max(0, 30 - active_isolations * 5))));
}

function runtimeDriftPressure(ops_total: number, ops_fallback: number, ops_isolated: number): number {
  if (ops_total === 0) return 0;
  const fallbackRate = ops_fallback / ops_total;
  const isolatedRate = ops_isolated / ops_total;
  return Math.min(100, Math.round(fallbackRate * 60 + isolatedRate * 40));
}

export function buildHealthScoresOnlyForTests(stats: { ops_total: number; ops_fallback: number; ops_isolated: number; active_isolations: number; partition_count: number }): DistributedRuntimeHealthScores {
  return {
    broker_continuity: brokerContinuityScore(),
    partition_isolation: partitionIsolationScore(stats.active_isolations, stats.partition_count),
    synchronization_stability: stats.active_isolations === 0 ? 100 : Math.max(50, 100 - stats.active_isolations * 10),
    replay_recovery: 100,
    distributed_topology_stability: topologyStabilityScore(stats.active_isolations, brokerContinuityScore()),
    runtime_drift_pressure: runtimeDriftPressure(stats.ops_total, stats.ops_fallback, stats.ops_isolated),
  };
}
