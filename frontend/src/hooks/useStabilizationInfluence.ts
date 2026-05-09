import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface StabilizationInfluencePath {
  originating_namespace: string;
  stabilized_namespaces: string[];
  recovery_kind: 'isolation_lifted' | 'replay_completed' | 'broker_reconnected' | 'operator_resolved';
  observed_at: string;
  attribution: any;
}

export function useStabilizationInfluence(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [paths, setPaths] = useState<StabilizationInfluencePath[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['continuity.amplified', 'topology.stabilized'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/topology/stabilizations?organization_id=${encodeURIComponent(organization_id)}`);
      setPaths((r.data?.stabilizations || []) as StabilizationInfluencePath[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load stabilization influence');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { paths, loading, error, refresh, streamConnected: stream.connected };
}
