import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type RecoveryStepKind =
  | 'lift_isolation' | 'retry_namespace' | 'force_replay' | 'reset_synchronization' | 'clear_quarantine' | 'restart_broker';

export interface DistributedRecoveryStep {
  step_id: string;
  kind: RecoveryStepKind;
  target_namespace?: string;
  target_organization_id?: string;
  description: string;
  operator_required: boolean;
  impact_estimate: 'low' | 'medium' | 'high';
  rollback_path: string;
}

export interface DistributedRecoveryPlan {
  plan_id: string;
  trigger: 'broker_disconnected' | 'partition_isolated' | 'replay_pressure' | 'operator_requested';
  steps: DistributedRecoveryStep[];
  risk_summary: string;
  bounded_reason: string;
  created_at: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export function useDistributedRecovery(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [plans, setPlans] = useState<DistributedRecoveryPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['partition.recovered', 'replay.restored', 'broker.isolation.triggered'] });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/distributed-runtime/recovery-plans');
      setPlans((r.data?.plans || []) as DistributedRecoveryPlan[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load distributed recovery plans');
    } finally { setLoading(false); }
  }, []);

  const buildPlan = useCallback(async (trigger?: DistributedRecoveryPlan['trigger']) => {
    const r = await portalApi.post('/api/portal/project/distributed-runtime/recovery-plans', { trigger: trigger ?? 'operator_requested' });
    await refresh();
    return r.data as DistributedRecoveryPlan;
  }, [refresh]);

  const executeStep = useCallback(async (plan_id: string, step_id: string) => {
    const r = await portalApi.post(`/api/portal/project/distributed-runtime/recovery-plans/${plan_id}/steps/${step_id}/execute`, {});
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { plans, loading, error, refresh, buildPlan, executeStep, streamConnected: stream.connected };
}
