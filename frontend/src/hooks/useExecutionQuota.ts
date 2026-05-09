import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type QuotaResourceKey =
  | 'envelopes_per_24h' | 'executions_per_24h' | 'rollback_chains_per_24h'
  | 'topology_recovery_steps_per_24h' | 'continuity_replays_per_24h'
  | 'concurrent_executions';

export interface ExecutionQuotaProfile {
  organization_id: string;
  limits: Record<QuotaResourceKey, number>;
  consumed: Record<QuotaResourceKey, number>;
  remaining: Record<QuotaResourceKey, number>;
  any_exhausted: boolean;
  exhausted_keys: QuotaResourceKey[];
  built_at: string;
  deterministic_hash: string;
}

export function useExecutionQuota(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<ExecutionQuotaProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['quota.exhausted'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/economics/quota?organization_id=${encodeURIComponent(organization_id)}`);
      setProfile(r.data as ExecutionQuotaProfile);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load quota profile');
    } finally { setLoading(false); }
  }, [organization_id]);

  const setLimit = useCallback(async (quota_key: QuotaResourceKey, updated_limit: number, reason: string) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/economics/quota/set', {
      organization_id, quota_key, updated_limit, reason,
    });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, loading, error, refresh, setLimit, streamConnected: stream.connected };
}
