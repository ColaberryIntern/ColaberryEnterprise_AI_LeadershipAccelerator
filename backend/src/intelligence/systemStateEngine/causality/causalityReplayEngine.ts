/**
 * causalityReplayEngine — Phase 16 top-level coordinator. Given a
 * project + target node, builds a structured `CausalityReplayTrace`
 * the operator dashboard can render as an indented timeline.
 *
 * Recursion-safe: hard caps on nodes traversed (MAX_REPLAY_TRACE_NODES)
 * and depth (MAX_LINEAGE_DEPTH). The engine WILL truncate gracefully
 * before risking runaway traversal.
 *
 * Replay annotations are deterministic + replay-safe: the same
 * trace input produces the same trace output, so replay history is
 * stable across re-runs.
 */

import type {
  OperationalLineageGraph, CausalityReplayTrace, ReplayTraceStep,
  LineageNode,
} from './causalityTypes';
import { ancestorsOf } from './mutationLineageGraph';
import { MAX_REPLAY_TRACE_NODES, MAX_LINEAGE_DEPTH } from './causalityTypes';

export interface BuildReplayTraceInput {
  readonly graph: OperationalLineageGraph;
  readonly target_node_id: string;
}

export function buildCausalityReplayTrace(input: BuildReplayTraceInput): CausalityReplayTrace {
  const target = input.graph.nodes.find(n => n.node_id === input.target_node_id);
  if (!target) {
    return {
      project_id: input.graph.project_id,
      target_node_id: input.target_node_id,
      steps: [],
      truncated: false,
      built_at: new Date().toISOString(),
    };
  }

  const ancestors = ancestorsOf(input.graph, input.target_node_id);
  // Build the trace ROOT → … → TARGET so the UI can render it as a timeline.
  const ordered = [...ancestors].reverse().concat([target]);

  // Map each node to its parent_id by finding the most-recent edge with
  // `to === node.node_id` from the graph.
  const incomingFromMap = new Map<string, string | null>();
  for (const e of input.graph.edges) {
    if (!incomingFromMap.has(e.to)) incomingFromMap.set(e.to, e.from);
  }

  const steps: ReplayTraceStep[] = [];
  let truncated = false;
  for (let idx = 0; idx < ordered.length; idx++) {
    if (steps.length >= MAX_REPLAY_TRACE_NODES) {
      truncated = true;
      break;
    }
    const node = ordered[idx];
    const parent_id = incomingFromMap.get(node.node_id) ?? null;
    const depth = Math.min(idx, MAX_LINEAGE_DEPTH);
    steps.push({
      index: idx,
      node,
      parent_id,
      depth,
      annotation: annotate(node, idx, ordered.length),
    });
  }

  return {
    project_id: input.graph.project_id,
    target_node_id: input.target_node_id,
    steps,
    truncated,
    built_at: new Date().toISOString(),
  };
}

function annotate(node: LineageNode, idx: number, total: number): string {
  const role = idx === 0 ? 'origin' : idx === total - 1 ? 'target' : `step ${idx}`;
  const sevTag = node.severity === 'error' ? '⚠ error' : node.severity === 'warning' ? '⚠ warning' : 'info';
  return `${role} · ${node.kind} · ${sevTag} · ${node.summary}`.slice(0, 240);
}

export const _MAX_REPLAY_TRACE_NODES_FOR_TESTS = MAX_REPLAY_TRACE_NODES;
