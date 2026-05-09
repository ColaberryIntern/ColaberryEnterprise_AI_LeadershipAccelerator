import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type DelegatedPressureTier =
  | 'low' | 'moderate' | 'elevated' | 'critical' | 'saturated';

export interface RuntimePressureProfile {
  organization_id: string;
  tier: DelegatedPressureTier;
  score: number;
  observed_counters: {
    envelopes_24h: number;
    executions_24h: number;
    refusals_24h: number;
    timeouts_24h: number;
    expirations_24h: number;
    broker_isolations_active: number;
    topology_fragmentations_active: number;
    execution_worker_failures_24h: number;
  };
  sample_hash: string;
  recorded_at: string;
}

export function useRuntimePressure(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<RuntimePressureProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['runtime.pressure.changed', 'delegated.pressure.detected'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/economics/pressure?organization_id=${encodeURIComponent(organization_id)}`);
      setProfile(r.data as RuntimePressureProfile);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load pressure profile');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, loading, error, refresh, streamConnected: stream.connected };
}
