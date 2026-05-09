/**
 * cognitionTopologyGraph — Phase 22. Declarative within-partition
 * dependency graph encoding Phase 19/20/21 known relationships.
 *
 * Architectural commitment:
 *   - Static edges encoded at compile time from known module structure.
 *   - Runtime additions are operator-explicit via `recordDependencyEdge`.
 *   - No auto-discovery, no audit-mining, no learned emergence.
 *   - Graph is per-partition (per-org). Partitions never share graphs.
 *   - Bounded at MAX_DEPENDENCY_EDGES_PER_PARTITION=200 per partition.
 */

import type {
  CognitionTopologyGraph, TopologyDependencyEdge, TopologyDependencyRelation,
  DependencyLatencySensitivity,
} from './topologyTypes';
import { MAX_DEPENDENCY_EDGES_PER_PARTITION } from './topologyTypes';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

// ─── Static edges from Phase 19/20/21 module structure ───────────────

interface StaticEdgeSpec {
  from: string;
  to: string;
  relation: TopologyDependencyRelation;
  latency_sensitivity: DependencyLatencySensitivity;
  notes?: string;
}

const STATIC_EDGES: StaticEdgeSpec[] = [
  // Phase 20 federated learning chain
  { from: BROKER_NAMESPACES.effectiveness, to: BROKER_NAMESPACES.reliability, relation: 'reads', latency_sensitivity: 'high',
    notes: 'archetypeReliabilityEvolution.evolveReliability reads effectiveness profiles when computing reliability_delta' },
  { from: BROKER_NAMESPACES.reliability, to: 'organizational_stabilization', relation: 'reads', latency_sensitivity: 'high',
    notes: 'organizationalStabilizationIntelligence ranks insights by reliability tier + score' },
  { from: BROKER_NAMESPACES.effectiveness, to: 'organizational_stabilization', relation: 'reads', latency_sensitivity: 'low',
    notes: 'organizationalStabilizationIntelligence reads effectiveness for ranking' },

  // Phase 19 federation lineage chain consumed by Phase 20 diffusion replay
  { from: 'federation_lineage', to: BROKER_NAMESPACES.diffusion, relation: 'reads', latency_sensitivity: 'low',
    notes: 'federatedImpactDiffusionReplay reads Phase 19 lineage as the source of source→archetype→consumer edges' },
  { from: BROKER_NAMESPACES.effectiveness, to: BROKER_NAMESPACES.diffusion, relation: 'reads', latency_sensitivity: 'low',
    notes: 'diffusion replay enriches per-archetype entries with stabilization improved/regressed counts' },

  // Phase 19 federation visibility uses lineage attributions
  { from: 'federation_lineage', to: BROKER_NAMESPACES.visibility, relation: 'reads', latency_sensitivity: 'low',
    notes: 'federationVisibilityReplay reads lineage attributions filtered by window' },

  // Phase 20 drift detection reads effectiveness + reliability
  { from: BROKER_NAMESPACES.effectiveness, to: BROKER_NAMESPACES.drift, relation: 'reads', latency_sensitivity: 'high',
    notes: 'federationDriftDetector aggregates anomaly clustering + reliability collapse signals' },
  { from: BROKER_NAMESPACES.reliability, to: BROKER_NAMESPACES.drift, relation: 'reads', latency_sensitivity: 'high',
    notes: 'federationDriftDetector reads reliability tier transitions' },

  // Phase 20 policy proposal lifecycle writes through to Phase 19 consent updates
  { from: BROKER_NAMESPACES.policy_proposals, to: 'federation_consent', relation: 'writes_to', latency_sensitivity: 'high',
    notes: 'approvePolicy calls Phase 19 updateConsent to actually apply the change' },

  // Phase 21 broker continuity is the substrate for everything above —
  // every namespace depends on the broker being available.
  { from: 'broker_substrate', to: BROKER_NAMESPACES.effectiveness, relation: 'depends_on_audit', latency_sensitivity: 'high',
    notes: 'effectiveness profiles persist via the broker; broker degradation degrades all reads' },
  { from: 'broker_substrate', to: BROKER_NAMESPACES.reliability, relation: 'depends_on_audit', latency_sensitivity: 'high',
    notes: 'reliability profiles persist via the broker' },
  { from: 'broker_substrate', to: BROKER_NAMESPACES.policy_proposals, relation: 'depends_on_audit', latency_sensitivity: 'high',
    notes: 'policy proposals persist via the broker' },
];

// ─── Per-partition dynamic edges (operator-added) ────────────────────

interface PartitionEdgeStore {
  static_edges: TopologyDependencyEdge[];
  dynamic_edges: TopologyDependencyEdge[];
}

const partitionGraphs = new Map<string, PartitionEdgeStore>();

function ensurePartition(organization_id: string): PartitionEdgeStore {
  let s = partitionGraphs.get(organization_id);
  if (!s) {
    const now = new Date().toISOString();
    const static_edges: TopologyDependencyEdge[] = STATIC_EDGES.map(e => ({
      from_namespace: e.from,
      to_namespace: e.to,
      relation: e.relation,
      latency_sensitivity: e.latency_sensitivity,
      is_static: true,
      recorded_at: now,
      notes: e.notes,
    }));
    s = { static_edges, dynamic_edges: [] };
    partitionGraphs.set(organization_id, s);
  }
  return s;
}

export interface RecordDependencyEdgeInput {
  readonly organization_id: string;
  readonly from_namespace: string;
  readonly to_namespace: string;
  readonly relation: TopologyDependencyRelation;
  readonly latency_sensitivity: DependencyLatencySensitivity;
  readonly notes?: string;
}

/** Operator-explicit runtime addition. */
export function recordDependencyEdge(input: RecordDependencyEdgeInput): TopologyDependencyEdge {
  const store = ensurePartition(input.organization_id);
  const edge: TopologyDependencyEdge = {
    from_namespace: input.from_namespace,
    to_namespace: input.to_namespace,
    relation: input.relation,
    latency_sensitivity: input.latency_sensitivity,
    is_static: false,
    recorded_at: new Date().toISOString(),
    notes: input.notes,
  };
  store.dynamic_edges.push(edge);
  // Cap dynamic edges (static count is fixed).
  const totalCap = MAX_DEPENDENCY_EDGES_PER_PARTITION - store.static_edges.length;
  while (store.dynamic_edges.length > totalCap) store.dynamic_edges.shift();
  return edge;
}

export function listEdges(organization_id: string): ReadonlyArray<TopologyDependencyEdge> {
  const store = ensurePartition(organization_id);
  return [...store.static_edges, ...store.dynamic_edges];
}

export function buildCognitionTopologyGraph(organization_id: string): CognitionTopologyGraph {
  const edges = listEdges(organization_id);
  const namespaces = new Set<string>();
  const indegrees = new Map<string, number>();
  const outdegrees = new Map<string, number>();

  for (const e of edges) {
    namespaces.add(e.from_namespace);
    namespaces.add(e.to_namespace);
    indegrees.set(e.to_namespace, (indegrees.get(e.to_namespace) ?? 0) + 1);
    outdegrees.set(e.from_namespace, (outdegrees.get(e.from_namespace) ?? 0) + 1);
  }

  const nodes = Array.from(namespaces).sort().map(ns => {
    const indegree = indegrees.get(ns) ?? 0;
    const outdegree = outdegrees.get(ns) ?? 0;
    return { namespace: ns, is_root: indegree === 0, is_leaf: outdegree === 0, indegree, outdegree };
  });

  return {
    organization_id,
    partition_id: organization_id,
    nodes,
    edges,
    built_at: new Date().toISOString(),
  };
}

/**
 * Returns all namespaces reachable downstream of `start` via outgoing
 * edges, in BFS order. Used by the propagation walk + recovery
 * sequencer.
 */
export function downstreamNamespaces(organization_id: string, start: string, maxDepth: number): ReadonlyArray<{ namespace: string; depth: number; arrived_via: import('./topologyTypes').TopologyDependencyRelation; arrived_from: string }> {
  const edges = listEdges(organization_id);
  const out: Array<{ namespace: string; depth: number; arrived_via: import('./topologyTypes').TopologyDependencyRelation; arrived_from: string }> = [];
  const visited = new Set<string>([start]);
  const frontier: Array<{ ns: string; depth: number }> = [{ ns: start, depth: 0 }];
  while (frontier.length > 0) {
    const { ns, depth } = frontier.shift()!;
    if (depth >= maxDepth) continue;
    for (const e of edges) {
      if (e.from_namespace === ns && !visited.has(e.to_namespace)) {
        visited.add(e.to_namespace);
        out.push({ namespace: e.to_namespace, depth: depth + 1, arrived_via: e.relation, arrived_from: ns });
        frontier.push({ ns: e.to_namespace, depth: depth + 1 });
      }
    }
  }
  return out;
}

/** Returns the upstream chain for `target` (every ancestor in BFS order). */
export function upstreamNamespaces(organization_id: string, target: string, maxDepth: number): ReadonlyArray<string> {
  const edges = listEdges(organization_id);
  const out: string[] = [];
  const visited = new Set<string>([target]);
  const frontier: Array<{ ns: string; depth: number }> = [{ ns: target, depth: 0 }];
  while (frontier.length > 0) {
    const { ns, depth } = frontier.shift()!;
    if (depth >= maxDepth) continue;
    for (const e of edges) {
      if (e.to_namespace === ns && !visited.has(e.from_namespace)) {
        visited.add(e.from_namespace);
        out.push(e.from_namespace);
        frontier.push({ ns: e.from_namespace, depth: depth + 1 });
      }
    }
  }
  return out;
}

export function _resetTopologyGraphForTests(): void {
  partitionGraphs.clear();
}

export const _STATIC_EDGE_COUNT_FOR_TESTS = STATIC_EDGES.length;
