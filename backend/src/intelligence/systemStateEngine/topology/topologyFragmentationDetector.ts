/**
 * topologyFragmentationDetector — Phase 22. Per-partition 4-tier
 * fragmentation classifier.
 *
 * Architectural commitment:
 *   - Within-partition only. A partition is fragmented based on its OWN
 *     isolation state, never on cross-partition signals.
 *   - Deterministic mapping. No ML.
 *   - 4 tiers: cohesive / partial / fragmented / shattered.
 */

import type { TopologyFragmentationProfile, FragmentationTier } from './topologyTypes';
import {
  FRAGMENTATION_PARTIAL_ISOLATION_THRESHOLD,
  FRAGMENTATION_FRAGMENTED_ISOLATION_THRESHOLD,
  FRAGMENTATION_SHATTERED_ISOLATION_RATIO,
} from './topologyTypes';
import { listEdges, downstreamNamespaces } from './cognitionTopologyGraph';
import { buildIsolationProfile, isIsolated } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind } from '../distributedRuntime/distributedBrokerRuntime';
import { MAX_PROPAGATION_WALK_DEPTH } from './topologyTypes';

export function buildTopologyFragmentationProfile(organization_id: string): TopologyFragmentationProfile {
  const edges = listEdges(organization_id);
  const allNamespaces = new Set<string>();
  for (const e of edges) {
    allNamespaces.add(e.from_namespace);
    allNamespaces.add(e.to_namespace);
  }
  const isolation = buildIsolationProfile(getActiveAdapterKind());

  // Restrict to this org's isolations (and global ones).
  const myIsolated = isolation.isolated_namespaces.filter(
    iso => iso.organization_id === organization_id || iso.organization_id === null,
  );
  const isolatedNamespaces = new Set(myIsolated.map(i => i.namespace));
  const active_isolation_count = myIsolated.length;
  const active_namespaces = allNamespaces.size;

  // Identify roots (indegree 0) and how many are isolated.
  const incoming = new Map<string, number>();
  for (const e of edges) incoming.set(e.to_namespace, (incoming.get(e.to_namespace) ?? 0) + 1);
  const roots = Array.from(allNamespaces).filter(ns => (incoming.get(ns) ?? 0) === 0);
  const isolated_root_count = roots.filter(r => isolatedNamespaces.has(r)).length;

  // Identify dependency clusters: an isolated namespace + every isolated
  // descendant rooted at it.
  const clusters: Array<{
    cluster_root: string;
    cluster_depth: number;
    cluster_namespaces: string[];
    explanation: string;
  }> = [];
  for (const isoNs of isolatedNamespaces) {
    const downstream = downstreamNamespaces(organization_id, isoNs, MAX_PROPAGATION_WALK_DEPTH);
    const isolatedDownstream = downstream.filter(d => isolatedNamespaces.has(d.namespace));
    if (isolatedDownstream.length === 0) continue;
    const namespaces = [isoNs, ...isolatedDownstream.map(d => d.namespace)];
    const maxDepth = Math.max(0, ...isolatedDownstream.map(d => d.depth));
    clusters.push({
      cluster_root: isoNs,
      cluster_depth: maxDepth,
      cluster_namespaces: namespaces,
      explanation: `${isoNs} is isolated; ${isolatedDownstream.length} downstream namespace(s) are also isolated within depth ${maxDepth}`,
    });
  }

  const tier = classifyFragmentationTier({
    active_isolation_count,
    active_namespaces,
    isolated_root_count,
    cluster_max_depth: Math.max(0, ...clusters.map(c => c.cluster_depth)),
  });

  const fragmentation_pressure_score = pressureScore(tier, active_isolation_count, active_namespaces, clusters.length);

  const notes: string[] = [];
  if (isolated_root_count > 0) notes.push(`${isolated_root_count}_root_namespace(s)_isolated`);
  if (clusters.length > 0) notes.push(`${clusters.length}_dependency_cluster(s)_with_isolation`);
  if (active_isolation_count > 0 && active_namespaces > 0 && (active_isolation_count / active_namespaces) >= FRAGMENTATION_SHATTERED_ISOLATION_RATIO) {
    notes.push('isolation_ratio_above_shattered_threshold');
  }

  return {
    organization_id,
    partition_id: organization_id,
    tier,
    fragmentation_pressure_score,
    active_isolation_count,
    active_namespaces,
    isolated_root_count,
    isolated_dependency_clusters: clusters,
    notes,
    built_at: new Date().toISOString(),
  };
}

interface ClassifyInput {
  active_isolation_count: number;
  active_namespaces: number;
  isolated_root_count: number;
  cluster_max_depth: number;
}

export function classifyFragmentationTier(input: ClassifyInput): FragmentationTier {
  // Shattered: ≥50% isolated OR all roots isolated (when there are roots).
  const ratio = input.active_namespaces === 0 ? 0 : input.active_isolation_count / input.active_namespaces;
  if (ratio >= FRAGMENTATION_SHATTERED_ISOLATION_RATIO && input.active_isolation_count > 0) return 'shattered';
  if (input.isolated_root_count > 0 && input.active_isolation_count >= FRAGMENTATION_FRAGMENTED_ISOLATION_THRESHOLD) return 'shattered';
  // Fragmented: 3+ active OR cluster depth ≥ 2.
  if (input.active_isolation_count >= FRAGMENTATION_FRAGMENTED_ISOLATION_THRESHOLD) return 'fragmented';
  if (input.cluster_max_depth >= 2) return 'fragmented';
  // Partial: 1-2 active.
  if (input.active_isolation_count >= FRAGMENTATION_PARTIAL_ISOLATION_THRESHOLD) return 'partial';
  return 'cohesive';
}

function pressureScore(
  tier: FragmentationTier,
  active_isolation_count: number,
  active_namespaces: number,
  cluster_count: number,
): number {
  switch (tier) {
    case 'cohesive': return 0;
    case 'partial': return Math.min(40, 15 + active_isolation_count * 5 + cluster_count * 5);
    case 'fragmented': return Math.min(75, 50 + active_isolation_count * 5 + cluster_count * 5);
    case 'shattered':
      return Math.min(100, 80 + active_isolation_count * 2 + cluster_count * 3 + (active_namespaces > 0 ? Math.round((active_isolation_count / active_namespaces) * 10) : 0));
  }
}

/** Sync helper used by the topology summary. */
export function isIsolatedQuick(namespace: string, organization_id: string): boolean {
  return isIsolated(namespace, organization_id);
}
