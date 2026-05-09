/**
 * runtimeDependencyTopology — Phase 22. Computes per-partition
 * dependency chains + their continuity status.
 *
 * Architectural commitment:
 *   - Reads the declared graph + Phase 21 isolation state.
 *   - Returns deterministic chain enumeration: every chain starts at a
 *     root (indegree=0) namespace and walks downstream.
 *   - Continuity status is a simple deterministic mapping from the
 *     isolation state of namespaces in the chain.
 */

import { randomUUID } from 'crypto';
import type { RuntimeDependencyProfile } from './topologyTypes';
import { MAX_PROPAGATION_WALK_DEPTH } from './topologyTypes';
import { listEdges, downstreamNamespaces } from './cognitionTopologyGraph';
import { isIsolated } from '../distributedRuntime/brokerIsolationEngine';

export function buildRuntimeDependencyProfile(organization_id: string): RuntimeDependencyProfile {
  const edges = listEdges(organization_id);
  const allNamespaces = new Set<string>();
  for (const e of edges) {
    allNamespaces.add(e.from_namespace);
    allNamespaces.add(e.to_namespace);
  }
  // Roots = namespaces with no incoming edges (indegree 0).
  const incoming = new Map<string, number>();
  for (const e of edges) incoming.set(e.to_namespace, (incoming.get(e.to_namespace) ?? 0) + 1);
  const roots = Array.from(allNamespaces).filter(ns => (incoming.get(ns) ?? 0) === 0).sort();

  const chains = roots.map(root => {
    const downstream = downstreamNamespaces(organization_id, root, MAX_PROPAGATION_WALK_DEPTH);
    const path = [root, ...downstream.map(d => d.namespace)];
    const isolated_namespaces = path.filter(ns => isIsolated(ns, organization_id));
    const any_isolated = isolated_namespaces.length > 0;
    const root_isolated = isIsolated(root, organization_id);
    const continuity_status: 'continuous' | 'degraded' | 'broken' = root_isolated
      ? 'broken'
      : any_isolated
        ? 'degraded'
        : 'continuous';
    return {
      chain_id: `chain_${randomUUID().slice(0, 8)}`,
      root_namespace: root,
      path,
      depth: path.length,
      any_isolated,
      isolated_namespaces,
      continuity_status,
    };
  });

  // Stability score: 100 - 30 per broken chain - 10 per degraded chain, clamped.
  const broken = chains.filter(c => c.continuity_status === 'broken').length;
  const degraded = chains.filter(c => c.continuity_status === 'degraded').length;
  const stability_score = Math.max(0, Math.min(100, 100 - broken * 30 - degraded * 10));

  return {
    organization_id,
    partition_id: organization_id,
    chains,
    stability_score,
    built_at: new Date().toISOString(),
  };
}
