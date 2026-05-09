/**
 * executionTopologyGraph — Phase 23. Declarative within-organization
 * dependency graph between worker kinds.
 *
 * Architectural commitment:
 *   - Static edges encoded at compile time. Dynamic additions are
 *     operator-explicit via `recordExecutionDependencyEdge`.
 *   - Per-organization, never cross-org.
 *   - No auto-discovery, no audit-mining, no learned emergence.
 */

import type {
  ExecutionDependencyEdge, ExecutionTopologyProfile, ExecutionTopologyRelation,
  ExecutionWorkerKind,
} from './executionSubstrateTypes';
import { listEnvelopes } from './executionRuntimeCoordinator';

interface StaticEdgeSpec {
  from: ExecutionWorkerKind;
  to: ExecutionWorkerKind;
  relation: ExecutionTopologyRelation;
  notes?: string;
}

const STATIC_EDGES: StaticEdgeSpec[] = [
  // Phase 14 handoff fan-out
  { from: 'autonomous_handoff_dispatch', to: 'mutation_execution', relation: 'depends_on',
    notes: 'When the operator runs the prompt, the resulting validation report can trigger Phase 15 mutation execution downstream' },
  // Phase 15 mutation rolls back via the rollback coordinator
  { from: 'mutation_execution', to: 'distributed_recovery_step', relation: 'rolls_back_with',
    notes: 'A failed mutation may invoke distributed recovery steps via the rollback aggregation' },
  { from: 'mutation_execution', to: 'topology_recovery_step', relation: 'rolls_back_with',
    notes: 'A failed mutation may invoke topology recovery steps via the rollback aggregation' },
  // Phase 21 distributed recovery → Phase 22 topology recovery (sequencing)
  { from: 'distributed_recovery_step', to: 'topology_recovery_step', relation: 'depends_on',
    notes: 'Topology recovery sequencing reads Phase 21 isolation state to order steps' },
  // Continuity replay depends on manifest ingest having recorded state
  { from: 'manifest_ingest', to: 'continuity_replay', relation: 'depends_on',
    notes: 'Continuity replay reads namespaces populated by manifest ingest' },
  // Briefing send depends on manifest ingest (latest project state)
  { from: 'manifest_ingest', to: 'briefing_send', relation: 'depends_on',
    notes: 'Cory briefing reads project state populated by manifest ingest' },
  // Federation share precedes federation consume in another partition
  { from: 'federation_share', to: 'federation_consume', relation: 'depends_on',
    notes: 'A consumer cannot consume an archetype that has not been shared (within-org constraint)' },
  // Email + Basecamp + Apollo are leaves driven by various scripts
  { from: 'one_shot_script', to: 'email_send', relation: 'depends_on' },
  { from: 'one_shot_script', to: 'basecamp_sync', relation: 'depends_on' },
  { from: 'one_shot_script', to: 'apollo_pull', relation: 'depends_on' },
  // Operator-initiated workers can spawn one-shot scripts as children
  { from: 'operator_initiated', to: 'one_shot_script', relation: 'inherits_envelope_from' },
];

interface PartitionStore {
  static_edges: ExecutionDependencyEdge[];
  dynamic_edges: ExecutionDependencyEdge[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) {
    const now = new Date().toISOString();
    const static_edges: ExecutionDependencyEdge[] = STATIC_EDGES.map(e => ({
      from_kind: e.from,
      to_kind: e.to,
      relation: e.relation,
      is_static: true,
      recorded_at: now,
      notes: e.notes,
    }));
    s = { static_edges, dynamic_edges: [] };
    partitions.set(organization_id, s);
  }
  return s;
}

export interface RecordExecutionDependencyEdgeInput {
  readonly organization_id: string;
  readonly from_kind: ExecutionWorkerKind;
  readonly to_kind: ExecutionWorkerKind;
  readonly relation: ExecutionTopologyRelation;
  readonly notes?: string;
}

export function recordExecutionDependencyEdge(input: RecordExecutionDependencyEdgeInput): ExecutionDependencyEdge {
  const store = ensure(input.organization_id);
  const edge: ExecutionDependencyEdge = {
    from_kind: input.from_kind,
    to_kind: input.to_kind,
    relation: input.relation,
    is_static: false,
    recorded_at: new Date().toISOString(),
    notes: input.notes,
  };
  store.dynamic_edges.push(edge);
  return edge;
}

export function listEdges(organization_id: string): ReadonlyArray<ExecutionDependencyEdge> {
  const store = ensure(organization_id);
  return [...store.static_edges, ...store.dynamic_edges];
}

export function buildExecutionTopologyProfile(organization_id: string): ExecutionTopologyProfile {
  const edges = listEdges(organization_id);
  const kindSet = new Set<ExecutionWorkerKind>();
  for (const e of edges) {
    kindSet.add(e.from_kind);
    kindSet.add(e.to_kind);
  }
  const indegree = new Map<ExecutionWorkerKind, number>();
  const outdegree = new Map<ExecutionWorkerKind, number>();
  for (const e of edges) {
    outdegree.set(e.from_kind, (outdegree.get(e.from_kind) ?? 0) + 1);
    indegree.set(e.to_kind, (indegree.get(e.to_kind) ?? 0) + 1);
  }
  const envelopes = listEnvelopes(organization_id);
  const activeByKind = new Map<ExecutionWorkerKind, number>();
  const failureByKind = new Map<ExecutionWorkerKind, number>();
  for (const env of envelopes) {
    if (env.lifecycle_state === 'pending' || env.lifecycle_state === 'running') {
      activeByKind.set(env.kind, (activeByKind.get(env.kind) ?? 0) + 1);
    }
    if (env.lifecycle_state === 'failed' || env.lifecycle_state === 'interrupted') {
      failureByKind.set(env.kind, (failureByKind.get(env.kind) ?? 0) + 1);
    }
  }
  const nodes = Array.from(kindSet).sort().map(kind => {
    const ind = indegree.get(kind) ?? 0;
    const out = outdegree.get(kind) ?? 0;
    return {
      kind,
      indegree: ind,
      outdegree: out,
      is_root: ind === 0,
      is_leaf: out === 0,
      active_count: activeByKind.get(kind) ?? 0,
      recent_failure_count: failureByKind.get(kind) ?? 0,
    };
  });
  return { organization_id, nodes, edges, built_at: new Date().toISOString() };
}

export function _resetExecutionTopologyForTests(): void {
  partitions.clear();
}

export const _STATIC_EXECUTION_EDGE_COUNT_FOR_TESTS = STATIC_EDGES.length;
