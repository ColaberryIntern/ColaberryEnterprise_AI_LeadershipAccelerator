import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ExecutionContinuityReplay {
  organization_id: string;
  replay_id: string;
  entries: Array<{
    worker_id: string;
    kind: string;
    lifecycle_state: string;
    attribution_count: number;
    last_transition_at: string;
    explanation: string;
  }>;
  stalled_workers: string[];
  interrupted_on_boot: string[];
  built_at: string;
}

export function useExecutionContinuity(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [continuity, setContinuity] = useState<ExecutionContinuityReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['worker.interrupted', 'worker.recovered', 'execution.replayed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/execution-substrate/continuity?organization_id=${encodeURIComponent(organization_id)}`);
      setContinuity((r.data || null) as ExecutionContinuityReplay | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load execution continuity');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { continuity, loading, error, refresh, streamConnected: stream.connected };
}
