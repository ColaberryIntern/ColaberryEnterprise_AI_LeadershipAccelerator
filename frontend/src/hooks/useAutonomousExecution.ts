import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface AutonomyDecisionEntry {
  id: string;
  project_id: string;
  kind: string;
  subject_id: string | null;
  payload: any;
  operator_id: string | null;
  recorded_at: string;
}

const KINDS = [
  'autonomy.execution.prepared',
  'autonomy.execution.approved',
  'autonomy.execution.blocked',
  'autonomy.execution.applied',
  'autonomy.execution.rolled_back',
];

export function useAutonomousExecution(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [decisions, setDecisions] = useState<AutonomyDecisionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: KINDS });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/autonomy/decisions');
      setDecisions((r.data?.decisions || []) as AutonomyDecisionEntry[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load autonomy decisions');
    } finally {
      setLoading(false);
    }
  }, []);

  const dryRun = useCallback(async (planId: string) => {
    const r = await portalApi.post('/api/portal/project/governance/autonomy/dry-run', { plan_id: planId });
    return r.data?.sandbox;
  }, []);

  const rollback = useCallback(async (planId: string, postExecutionChangeSet?: string) => {
    const r = await portalApi.post(`/api/portal/project/governance/autonomy/${planId}/rollback`, { post_execution_change_set: postExecutionChangeSet });
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { decisions, loading, error, refresh, dryRun, rollback, streamConnected: stream.connected };
}
