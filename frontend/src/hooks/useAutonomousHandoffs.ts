import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface HandoffEntry {
  id: string;
  project_id: string;
  kind: string;
  subject_id: string | null;
  payload: any;
  operator_id: string | null;
  recorded_at: string;
}

const KINDS = [
  'autonomy.execution.started',
  'autonomy.execution.verified',
  'autonomy.execution.failed',
  'autonomy.execution.preempted',
  'autonomy.rollback.started',
  'autonomy.rollback.completed',
];

export function useAutonomousHandoffs(opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const limit = opts?.limit ?? 50;
  const [handoffs, setHandoffs] = useState<HandoffEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: KINDS });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/autonomy/handoffs?limit=${limit}`);
      setHandoffs((r.data?.handoffs || []) as HandoffEntry[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load handoffs');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const cancelHandoff = useCallback(async (planId: string) => {
    const r = await portalApi.post(`/api/portal/project/governance/autonomy/${planId}/cancel-handoff`);
    await refresh();
    return r.data?.plan;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { handoffs, loading, error, refresh, cancelHandoff, streamConnected: stream.connected };
}
