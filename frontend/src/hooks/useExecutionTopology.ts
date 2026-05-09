import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ExecutionTopologyProfile {
  organization_id: string;
  nodes: Array<{
    kind: string;
    indegree: number;
    outdegree: number;
    is_root: boolean;
    is_leaf: boolean;
    active_count: number;
    recent_failure_count: number;
  }>;
  edges: Array<{
    from_kind: string;
    to_kind: string;
    relation: 'depends_on' | 'rolls_back_with' | 'inherits_envelope_from';
    is_static: boolean;
    recorded_at: string;
    notes?: string;
  }>;
  built_at: string;
}

export function useExecutionTopology(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [topology, setTopology] = useState<ExecutionTopologyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['worker.started', 'worker.interrupted', 'rollback.orchestrated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/execution-substrate/topology?organization_id=${encodeURIComponent(organization_id)}`);
      setTopology((r.data || null) as ExecutionTopologyProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load execution topology');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { topology, loading, error, refresh, streamConnected: stream.connected };
}
