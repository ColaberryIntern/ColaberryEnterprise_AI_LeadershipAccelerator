import { useCallback, useState } from 'react';
import { useOperationalLineage } from './useOperationalLineage';

export interface ReplayTraceStep {
  index: number;
  node: any;
  parent_id: string | null;
  depth: number;
  annotation: string;
}

export interface CausalityReplayTrace {
  project_id: string;
  target_node_id: string;
  steps: ReplayTraceStep[];
  truncated: boolean;
  built_at: string;
}

/**
 * Phase 16 — local replay trace builder. Composes `useOperationalLineage`
 * with a client-side ancestor walk so the dashboard can render a target
 * node's causal timeline without a separate API hit.
 *
 * For large graphs the backend `/causality/lineage` endpoint already
 * truncates at MAX_REPLAY_TRACE_NODES (200); this hook walks within that
 * pre-truncated set.
 */
export function useCausalityReplay() {
  const lineage = useOperationalLineage({ autoFetch: false });
  const [trace, setTrace] = useState<CausalityReplayTrace | null>(null);

  const buildTrace = useCallback(async (targetNodeId: string): Promise<CausalityReplayTrace | null> => {
    await lineage.refresh();
    const graph = lineage.graph;
    if (!graph) return null;

    // Walk ancestors via incoming edges, BFS, max depth = 5 (matches backend cap).
    const incoming = new Map<string, string[]>();
    for (const e of graph.edges) {
      const list = incoming.get(e.to) || [];
      list.push(e.from);
      incoming.set(e.to, list);
    }
    const byId = new Map(graph.nodes.map(n => [n.node_id, n] as const));
    const visited = new Set<string>([targetNodeId]);
    const ancestors: any[] = [];
    let frontier = [targetNodeId];
    for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const pid of (incoming.get(id) || [])) {
          if (visited.has(pid)) continue;
          visited.add(pid);
          const node = byId.get(pid);
          if (node) { ancestors.push(node); next.push(pid); }
        }
      }
      frontier = next;
    }
    const target = byId.get(targetNodeId);
    if (!target) return null;
    const ordered = [...ancestors].reverse().concat([target]);
    const steps: ReplayTraceStep[] = ordered.map((node, idx) => ({
      index: idx,
      node,
      parent_id: incoming.get(node.node_id)?.[0] ?? null,
      depth: Math.min(idx, 5),
      annotation: `${idx === 0 ? 'origin' : idx === ordered.length - 1 ? 'target' : `step ${idx}`} · ${node.kind} · ${node.severity} · ${node.summary}`,
    }));
    const built: CausalityReplayTrace = {
      project_id: graph.project_id,
      target_node_id: targetNodeId,
      steps,
      truncated: steps.length >= 200,
      built_at: new Date().toISOString(),
    };
    setTrace(built);
    return built;
  }, [lineage]);

  return { trace, buildTrace, loading: lineage.loading, error: lineage.error };
}
