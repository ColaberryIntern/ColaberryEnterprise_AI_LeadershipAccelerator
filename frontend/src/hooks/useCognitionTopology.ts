import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface CognitionTopologyGraph {
  organization_id: string;
  partition_id: string;
  nodes: Array<{ namespace: string; is_root: boolean; is_leaf: boolean; indegree: number; outdegree: number }>;
  edges: Array<{
    from_namespace: string;
    to_namespace: string;
    relation: 'reads' | 'writes_to' | 'depends_on_audit';
    latency_sensitivity: 'low' | 'high';
    is_static: boolean;
    recorded_at: string;
    notes?: string;
  }>;
  built_at: string;
}

export function useCognitionTopology(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [graph, setGraph] = useState<CognitionTopologyGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['topology.fragmented', 'topology.stabilized', 'recovery.orchestrated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/topology/graph?organization_id=${encodeURIComponent(organization_id)}`);
      setGraph((r.data || null) as CognitionTopologyGraph | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load topology graph');
    } finally { setLoading(false); }
  }, [organization_id]);

  const recordEdge = useCallback(async (edge: { from_namespace: string; to_namespace: string; relation: 'reads' | 'writes_to' | 'depends_on_audit'; latency_sensitivity: 'low' | 'high'; notes?: string }) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/topology/dependency-edges', { organization_id, ...edge });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { graph, loading, error, refresh, recordEdge, streamConnected: stream.connected };
}
