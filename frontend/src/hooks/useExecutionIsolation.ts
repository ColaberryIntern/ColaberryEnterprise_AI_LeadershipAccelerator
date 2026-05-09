import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type ExecutionIsolationReason =
  | 'consecutive_failures' | 'envelope_breach' | 'depth_limit_exceeded' | 'operator_quarantine';

export interface ExecutionIsolationProfile {
  isolated_kinds: Array<{
    kind: string;
    organization_id: string;
    reason: ExecutionIsolationReason;
    isolated_since: string;
    consecutive_failures: number;
    explanation: string;
  }>;
  active_isolation_count: number;
  total_isolation_events_24h: number;
  built_at: string;
}

export function useExecutionIsolation(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<ExecutionIsolationProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['execution.isolated', 'worker.recovered'] });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/execution-substrate/isolation');
      setProfile((r.data || null) as ExecutionIsolationProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load execution isolation');
    } finally { setLoading(false); }
  }, []);

  const liftIsolation = useCallback(async (kind: string, organization_id: string) => {
    const r = await portalApi.post('/api/portal/project/execution-substrate/isolation/lift', { kind, organization_id });
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
