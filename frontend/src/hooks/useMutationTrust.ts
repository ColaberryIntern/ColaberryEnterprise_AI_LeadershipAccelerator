import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface MutationTrustEntry {
  intent_class: string;
  trust_score: number;
  success_count: number;
  rollback_count: number;
  contained_count: number;
  verification_failure_count: number;
  last_updated_at: number;
}

export interface MutationTrustProfile {
  project_id: string;
  profiles_by_intent: Record<string, MutationTrustEntry>;
  autonomy_recommended_intent: string | null;
}

export function useMutationTrust(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<MutationTrustProfile | null>(null);
  const [avgTrust, setAvgTrust] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['mutation.trust.changed', 'mutation.execution.verified', 'mutation.rollback.completed'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/mutation/trust');
      setProfile((r.data?.profile || null) as MutationTrustProfile | null);
      setAvgTrust(typeof r.data?.avg_trust === 'number' ? r.data.avg_trust : null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load mutation trust');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, avgTrust, loading, error, refresh, streamConnected: stream.connected };
}
