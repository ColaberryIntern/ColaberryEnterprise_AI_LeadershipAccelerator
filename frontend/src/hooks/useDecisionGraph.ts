import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface DecisionGraphResponse {
  project_id: string;
  generated_at: string;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  node_count: number;
  edge_count: number;
}

export function useDecisionGraph(opts: { autoFetch?: boolean } = {}) {
  const [data, setData] = useState<DecisionGraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/graph');
      setData(r.data as DecisionGraphResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) void refresh();
  }, [autoFetch, refresh]);

  return { data, loading, error, refresh };
}
