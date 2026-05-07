/**
 * useLiveCognitiveGraph — composes the Phase 7 graph data with the live
 * SSE stream so node/edge changes flow in incrementally.
 *
 * V1 still pulls the full graph on first load; on every `queue.reranked`
 * event the hook re-fetches. Phase 10 will switch to surgical
 * `graph.node_added` / `graph.edge_added` events for true incremental
 * updates.
 */
import { useEffect } from 'react';
import { useDecisionGraph } from './useDecisionGraph';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export function useLiveCognitiveGraph() {
  const graph = useDecisionGraph();
  const { events } = useRealtimeAwareness({
    kinds: ['queue.reranked', 'contradiction.detected', 'incident.opened'],
    buffer_size: 10,
  });

  // On any graph-affecting event, re-fetch.
  useEffect(() => {
    if (events.length > 0) void graph.refresh();
    // eslint-disable-next-line
  }, [events.length]);

  return graph;
}
