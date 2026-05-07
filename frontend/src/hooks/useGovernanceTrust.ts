import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface TrustEntry {
  action_class: string;
  success_count: number;
  rollback_count: number;
  blocked_count: number;
  trust_score: number;
  last_updated_at: string;
}

export interface TrustResponse {
  trust: {
    project_id: string;
    profiles_by_class: Record<string, TrustEntry>;
    recent_executions: number;
    recent_rollbacks: number;
    recent_blocks: number;
    snapshot_at: string;
  };
  execution_success_rate: number;
  rollback_frequency: number;
}

export function useGovernanceTrust(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [data, setData] = useState<TrustResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['autonomy.trust.changed', 'autonomy.execution.applied', 'autonomy.execution.rolled_back'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/autonomy/trust');
      setData(r.data as TrustResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load trust');
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

  return { data, loading, error, refresh, streamConnected: stream.connected };
}
