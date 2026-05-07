import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface IsolationZone {
  signature: string;
  expires_at: string;
  reason: string;
  recorded_at: string;
}

const KINDS = [
  'autonomy.execution.started',
  'autonomy.rollback.completed',
  'autonomy.self_heal.triggered',
];

export function useIsolationZones(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [zones, setZones] = useState<IsolationZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: KINDS });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/autonomy/isolations');
      setZones((r.data?.isolations || []) as IsolationZone[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load isolations');
    } finally {
      setLoading(false);
    }
  }, []);

  const liftIsolation = useCallback(async (clusterSignature: string) => {
    const r = await portalApi.post(`/api/admin/governance/autonomy/lift-isolation/${encodeURIComponent(clusterSignature)}`);
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { zones, loading, error, refresh, liftIsolation, streamConnected: stream.connected };
}
