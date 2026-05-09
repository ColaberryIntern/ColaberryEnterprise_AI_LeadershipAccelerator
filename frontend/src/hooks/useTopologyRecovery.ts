import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type TopologyRecoveryStepKind =
  | 'lift_isolation' | 'retry_namespace' | 'force_replay' | 'reset_synchronization' | 'clear_quarantine' | 'restart_broker';

export interface TopologyRecoveryStep {
  step_id: string;
  sequence_index: number;
  kind: TopologyRecoveryStepKind;
  target_namespace: string;
  target_organization_id: string;
  description: string;
  operator_required: boolean;
  impact_estimate: 'low' | 'medium' | 'high';
  rollback_path: string;
  depends_on_step_ids: string[];
}

export interface TopologyRecoveryPlan {
  plan_id: string;
  organization_id: string;
  partition_id: string;
  trigger: 'fragmentation_detected' | 'propagation_detected' | 'operator_requested';
  steps: TopologyRecoveryStep[];
  sequencing_reason: string;
  bounded_reason: string;
  created_at: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  forecast: {
    forecast_horizon_minutes: number;
    confidence_low: number;
    confidence_high: number;
    uncertainty_drivers: string[];
    observed_signal_strength: number;
  };
}

export function useTopologyRecovery(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [plans, setPlans] = useState<TopologyRecoveryPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['recovery.orchestrated', 'topology.stabilized', 'partition.recovered'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/topology/recovery-plans?organization_id=${encodeURIComponent(organization_id)}`);
      setPlans((r.data?.plans || []) as TopologyRecoveryPlan[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load topology recovery plans');
    } finally { setLoading(false); }
  }, [organization_id]);

  const buildPlan = useCallback(async (trigger?: TopologyRecoveryPlan['trigger']) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/topology/recovery-plans', { organization_id, trigger: trigger ?? 'operator_requested' });
    await refresh();
    return r.data as TopologyRecoveryPlan;
  }, [organization_id, refresh]);

  const executeStep = useCallback(async (plan_id: string, step_id: string) => {
    const r = await portalApi.post(`/api/portal/project/topology/recovery-plans/${encodeURIComponent(plan_id)}/steps/${encodeURIComponent(step_id)}/execute`, {});
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
