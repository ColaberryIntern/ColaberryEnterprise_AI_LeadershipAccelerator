import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type BrokerIsolationReason =
  | 'consecutive_failures' | 'sustained_latency' | 'connection_lost' | 'operator_quarantine';

export interface BrokerIsolationProfile {
  adapter_kind: 'in_memory' | 'redis';
  isolated_namespaces: Array<{
    namespace: string;
    organization_id: string | null;
    reason: BrokerIsolationReason;
    isolated_since: string;
    consecutive_failures: number;
    fallback_active: boolean;
    explanation: string;
  }>;
  total_isolation_events_24h: number;
  active_isolation_count: number;
  built_at: string;
}

export function useBrokerIsolation(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<BrokerIsolationProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['broker.isolation.triggered', 'partition.recovered'] });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/distributed-runtime/isolations');
      setProfile((r.data || null) as BrokerIsolationProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load broker isolation profile');
    } finally { setLoading(false); }
  }, []);

  const liftIsolation = useCallback(async (namespace: string, organization_id: string | null) => {
    const r = await portalApi.post('/api/portal/project/distributed-runtime/isolations/lift', { namespace, organization_id });
    await refresh();
    return r.data as { lifted: boolean };
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, loading, error, refresh, liftIsolation, streamConnected: stream.connected };
}
