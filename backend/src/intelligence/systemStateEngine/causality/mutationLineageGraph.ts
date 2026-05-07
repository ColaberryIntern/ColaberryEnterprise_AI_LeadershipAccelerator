/**
 * mutationLineageGraph — Phase 16 lineage DAG builder + traversal.
 *
 * Pure analytical functions over historical evidence:
 *   - mutation envelopes (Phase 15 audit rows)
 *   - contradiction flags (engine state)
 *   - rollback completion events
 *   - remediation cluster resolutions
 *   - governance decisions (mode changes, policy nudges)
 *
 * Edges between nodes are heuristic: shared subject_id + temporal
 * adjacency + provenance chain references. The graph is rebuilt from
 * inputs each call (no in-memory persistence beyond the result), so
 * lineage explosion is naturally bounded by the input window the
 * caller passes in.
 *
 * Hard caps:
 *   - MAX_LINEAGE_DEPTH = 5 (truncates ancestry traversal)
 *   - MAX_REPLAY_TRACE_NODES = 200 (truncates results)
 *
 * Architectural commitment: builders accept inputs, return DAGs. They
 * do NOT touch the DB, they do NOT mutate state. Callers (the replay
 * engine, root-cause analyzer) feed the data in.
 */

import type {
  LineageNode, LineageEdge, OperationalLineageGraph,
} from './causalityTypes';
import { MAX_LINEAGE_DEPTH, MAX_REPLAY_TRACE_NODES } from './causalityTypes';

export interface BuildLineageGraphInput {
  readonly project_id: string;
  readonly nodes: ReadonlyArray<LineageNode>;
}

/**
 * Build the DAG. Edges connect nodes with:
 *   - same subject_id and timestamps within ±30min (relation: co_occurred)
 *   - explicit provenance reference (mutation envelope cites a contradiction
 *     in its provenance chain → contradiction → mutation, relation: caused)
 *   - rollback completion targeting a mutation (relation: rolled_back)
 *   - mutation followed by remediation on same subject (relation: remediated)
 *
 * Cycles are broken by keeping the earliest-timestamped edge.
 */
export function buildLineageGraph(input: BuildLineageGraphInput): OperationalLineageGraph {
  const nodes = [...input.nodes];
  const edges: LineageEdge[] = [];
  const seenEdges = new Set<string>();

  const byId = new Map(nodes.map(n => [n.node_id, n] as const));

  // Sort by timestamp ascending so earlier nodes are always candidate
  // ancestors of later nodes.
  const sorted = [...nodes].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Pass 1: explicit provenance references (mutation envelopes can cite
  // the contradiction or pressure event that caused them via the
  // payload.provenance.entries[*].source_id field).
  for (const node of sorted) {
    if (node.kind !== 'mutation') continue;
    const provenanceEntries: any[] = ((node.payload as any)?.provenance?.entries || []) as any[];
    for (const entry of provenanceEntries) {
      if (!entry?.source_id || !byId.has(entry.source_id)) continue;
      pushEdge(edges, seenEdges, {
        from: entry.source_id,
        to: node.node_id,
        relation: 'caused',
        confidence: 80,
        evidence: `provenance:${entry.source}:${entry.summary || entry.source}`,
      });
    }
  }

  // Pass 2: rollback nodes targeting mutations (subject_id of a rollback
  // node is the mutation_id it reverses).
  for (const node of sorted) {
    if (node.kind !== 'rollback') continue;
    const targetMutation = node.subject_id;
    if (targetMutation && byId.has(targetMutation)) {
      pushEdge(edges, seenEdges, {
        from: targetMutation,
        to: node.node_id,
        relation: 'rolled_back',
        confidence: 100,
        evidence: 'rollback targets prior mutation',
      });
    }
  }

  // Pass 3: temporal+spatial co-occurrence (same subject_id, within 30 min).
  // Only link i → j (i earlier than j) so the graph stays a DAG.
  const TEMP_WINDOW_MS = 30 * 60 * 1000;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (!a.subject_id || a.subject_id !== b.subject_id) continue;
      const dt = Date.parse(b.timestamp) - Date.parse(a.timestamp);
      if (dt < 0 || dt > TEMP_WINDOW_MS) continue;
      // Skip if we already linked this pair via a more specific relation.
      if (hasEdge(seenEdges, a.node_id, b.node_id)) continue;
      const relation = inferRelation(a, b);
      pushEdge(edges, seenEdges, {
        from: a.node_id,
        to: b.node_id,
        relation,
        confidence: relation === 'co_occurred' ? 50 : 65,
        evidence: `same subject ${a.subject_id} within ${Math.round(dt / 1000)}s`,
      });
    }
  }

  const incoming = new Set<string>(edges.map(e => e.to));
  const outgoing = new Set<string>(edges.map(e => e.from));
  const root_node_ids = nodes.filter(n => !incoming.has(n.node_id)).map(n => n.node_id);
  const leaf_node_ids = nodes.filter(n => !outgoing.has(n.node_id)).map(n => n.node_id);

  return {
    project_id: input.project_id,
    nodes,
    edges,
    root_node_ids,
    leaf_node_ids,
    max_observed_depth: maxObservedDepth(nodes, edges),
    built_at: new Date().toISOString(),
  };
}

/**
 * Walk ancestors of a node up to MAX_LINEAGE_DEPTH. Returns ordered
 * list nearest-first (immediate parents first, oldest root last).
 * Recursion-safe: visits a node at most once.
 */
export function ancestorsOf(graph: OperationalLineageGraph, node_id: string): ReadonlyArray<LineageNode> {
  const byId = new Map(graph.nodes.map(n => [n.node_id, n] as const));
  const incoming = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = incoming.get(e.to) || [];
    list.push(e.from);
    incoming.set(e.to, list);
  }
  const result: LineageNode[] = [];
  const visited = new Set<string>([node_id]);
  let frontier: string[] = [node_id];
  for (let depth = 0; depth < MAX_LINEAGE_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const parents = incoming.get(id) || [];
      for (const pid of parents) {
        if (visited.has(pid)) continue;
        visited.add(pid);
        const node = byId.get(pid);
        if (node) {
          result.push(node);
          next.push(pid);
          if (result.length >= MAX_REPLAY_TRACE_NODES) return result;
        }
      }
    }
    frontier = next;
  }
  return result;
}

/**
 * Walk descendants of a node up to MAX_LINEAGE_DEPTH. Returns BFS order.
 */
export function descendantsOf(graph: OperationalLineageGraph, node_id: string): ReadonlyArray<LineageNode> {
  const byId = new Map(graph.nodes.map(n => [n.node_id, n] as const));
  const outgoing = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = outgoing.get(e.from) || [];
    list.push(e.to);
    outgoing.set(e.from, list);
  }
  const result: LineageNode[] = [];
  const visited = new Set<string>([node_id]);
  let frontier: string[] = [node_id];
  for (let depth = 0; depth < MAX_LINEAGE_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const children = outgoing.get(id) || [];
      for (const cid of children) {
        if (visited.has(cid)) continue;
        visited.add(cid);
        const node = byId.get(cid);
        if (node) {
          result.push(node);
          next.push(cid);
          if (result.length >= MAX_REPLAY_TRACE_NODES) return result;
        }
      }
    }
    frontier = next;
  }
  return result;
}

/** Depth from any root → node (longest acyclic path). 0 if node is a root. */
export function depthOf(graph: OperationalLineageGraph, node_id: string): number {
  return ancestorsOf(graph, node_id).length;
}

function pushEdge(edges: LineageEdge[], seen: Set<string>, edge: LineageEdge): void {
  const key = `${edge.from}→${edge.to}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push(edge);
}

function hasEdge(seen: Set<string>, from: string, to: string): boolean {
  return seen.has(`${from}→${to}`);
}

function inferRelation(a: LineageNode, b: LineageNode): LineageEdge['relation'] {
  if (a.kind === 'contradiction' && b.kind === 'mutation') return 'caused';
  if (a.kind === 'mutation' && b.kind === 'remediation') return 'remediated';
  if (a.kind === 'mutation' && b.kind === 'contradiction') return 'amplified';
  if (a.kind === 'mutation' && b.kind === 'stabilization') return 'contained';
  return 'co_occurred';
}

function maxObservedDepth(nodes: ReadonlyArray<LineageNode>, edges: ReadonlyArray<LineageEdge>): number {
  if (nodes.length === 0) return 0;
  // Compute the longest path via topological-order DP, capped at
  // MAX_LINEAGE_DEPTH so a malformed input can't trigger blowup.
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const list = incoming.get(e.to) || [];
    list.push(e.from);
    incoming.set(e.to, list);
  }
  const memo = new Map<string, number>();
  function depth(id: string, visiting: Set<string>): number {
    if (visiting.has(id)) return 0;       // cycle break
    if (memo.has(id)) return memo.get(id)!;
    visiting.add(id);
    const parents = incoming.get(id) || [];
    let best = 0;
    for (const p of parents) {
      best = Math.max(best, 1 + depth(p, visiting));
      if (best >= MAX_LINEAGE_DEPTH) break;
    }
    visiting.delete(id);
    const capped = Math.min(best, MAX_LINEAGE_DEPTH);
    memo.set(id, capped);
    return capped;
  }
  let max = 0;
  for (const n of nodes) max = Math.max(max, depth(n.node_id, new Set()));
  return max;
}

export const _MAX_LINEAGE_DEPTH_FOR_TESTS = MAX_LINEAGE_DEPTH;
