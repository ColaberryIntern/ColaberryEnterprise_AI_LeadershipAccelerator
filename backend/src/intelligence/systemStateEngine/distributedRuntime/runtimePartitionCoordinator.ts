/**
 * runtimePartitionCoordinator — Phase 21. Maps organization_id to
 * partition_id (1:1 in v1) and computes `RuntimePartitionProfile`s.
 *
 * Architectural commitment (per Phase 21 stress-test):
 *   - partition == organization_id (1:1, single-writer per partition).
 *   - No sub-partitioning, dynamic reassignment, sharding, ownership
 *     transfer, or migration logic. Future phases may re-split.
 */

import type {
  PartitionIsolationTier, RuntimePartitionProfile, BrokerOperationAttribution,
} from './distributedRuntimeTypes';
import {
  RECENT_OPS_WINDOW_MS,
  PARTITION_TIER_DEGRADED_FAILURE_RATE,
  PARTITION_TIER_MONITORING_FAILURE_RATE,
} from './distributedRuntimeTypes';
import { listAttributionsForOrg } from './brokerOperationAttribution';
import { getIsolationState } from './brokerIsolationEngine';
import { getActiveAdapter, getActiveAdapterKind } from './distributedBrokerRuntime';

/** v1: partition_id === organization_id. */
export function partitionIdFor(organization_id: string): string {
  return organization_id;
}

/** Build the partition profile for one organization. */
export function buildPartitionProfile(organization_id: string): RuntimePartitionProfile {
  const now = Date.now();
  const cutoff = now - RECENT_OPS_WINDOW_MS;

  const allOps = listAttributionsForOrg(organization_id);
  const recentOps = allOps.filter(op => Date.parse(op.observed_at) >= cutoff);

  const recent_failure_count = recentOps.filter(op => op.outcome !== 'success').length;
  const recent_fallback_count = recentOps.filter(op => op.outcome === 'fallback').length;
  const failureRate = recentOps.length === 0 ? 0 : recent_failure_count / recentOps.length;

  const namespacesSet = new Set<string>();
  for (const op of recentOps) namespacesSet.add(op.namespace);
  const active_namespaces = Array.from(namespacesSet).sort();

  // Aggregate isolation state across the org's namespaces.
  let anyIsolated = false;
  let anyQuarantined = false;
  let last_isolation_event_at: string | null = null;
  for (const ns of active_namespaces) {
    const iso = getIsolationState(ns, organization_id);
    if (iso) {
      anyIsolated = true;
      if (iso.operator_quarantined) anyQuarantined = true;
      if (!last_isolation_event_at || iso.isolated_since > last_isolation_event_at) {
        last_isolation_event_at = iso.isolated_since;
      }
    }
  }

  const tier = classifyTier(anyQuarantined, anyIsolated, failureRate, recentOps.length);
  const health_score = healthScoreFromTier(tier, failureRate);
  const last_op_at = recentOps.length > 0 ? recentOps[0].observed_at : null;
  const lastFailure = recentOps.find(op => op.outcome !== 'success') ?? null;
  const last_failure_at = lastFailure ? lastFailure.observed_at : null;

  const notes: string[] = [];
  if (anyQuarantined) notes.push('operator_quarantine_active');
  if (anyIsolated && !anyQuarantined) notes.push('automatic_isolation_active');
  if (recent_fallback_count > 0) notes.push(`${recent_fallback_count}_recent_fallback_ops`);
  if (failureRate >= PARTITION_TIER_DEGRADED_FAILURE_RATE) notes.push('failure_rate_above_degraded_threshold');

  return {
    organization_id,
    partition_id: partitionIdFor(organization_id),
    tier,
    health_score,
    recent_ops_count: recentOps.length,
    recent_failure_count,
    recent_fallback_count,
    active_namespaces,
    last_op_at,
    last_failure_at,
    last_isolation_event_at,
    notes,
    built_at: new Date().toISOString(),
  };
}

function classifyTier(
  quarantined: boolean,
  anyIsolated: boolean,
  failureRate: number,
  recentOpsCount: number,
): PartitionIsolationTier {
  if (quarantined) return 'quarantined';
  if (anyIsolated) return 'isolated';
  if (recentOpsCount === 0) return 'healthy';
  if (failureRate >= PARTITION_TIER_DEGRADED_FAILURE_RATE) return 'degraded';
  if (failureRate >= PARTITION_TIER_MONITORING_FAILURE_RATE) return 'monitoring';
  return 'healthy';
}

function healthScoreFromTier(tier: PartitionIsolationTier, failureRate: number): number {
  switch (tier) {
    case 'quarantined': return 0;
    case 'isolated': return 10;
    case 'degraded': return Math.max(20, 60 - Math.round(failureRate * 100));
    case 'monitoring': return Math.max(60, 90 - Math.round(failureRate * 100));
    case 'healthy': return 100;
  }
}

/** List partition profiles for every organization the broker has seen. */
export async function listPartitions(): Promise<ReadonlyArray<RuntimePartitionProfile>> {
  const adapter = getActiveAdapter();
  const orgs = await adapter.listOrganizations();
  return orgs.map(buildPartitionProfile).sort((a, b) => a.organization_id.localeCompare(b.organization_id));
}

/** Used by the topology + visibility surfaces. */
export async function partitionCount(): Promise<number> {
  const orgs = await getActiveAdapter().listOrganizations();
  return orgs.length;
}

/** Used by the isolation surface. */
export async function activeNamespaces(): Promise<ReadonlyArray<string>> {
  const orgs = await getActiveAdapter().listOrganizations();
  const set = new Set<string>();
  for (const o of orgs) {
    const ops = listAttributionsForOrg(o);
    for (const op of ops) set.add(op.namespace);
  }
  return Array.from(set).sort();
}

/** Currently used by the topology endpoint. */
export function describeAdapterKind(): { adapter_kind: ReturnType<typeof getActiveAdapterKind> } {
  return { adapter_kind: getActiveAdapterKind() };
}

/** Test helper to allow noting an attribution-derived signal. */
export function _classifyTierForTests(
  quarantined: boolean,
  anyIsolated: boolean,
  failureRate: number,
  recentOpsCount: number,
): PartitionIsolationTier {
  return classifyTier(quarantined, anyIsolated, failureRate, recentOpsCount);
}

export type { BrokerOperationAttribution };
