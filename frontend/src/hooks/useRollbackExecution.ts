import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type RollbackSourcePhase = 'mutation' | 'distributed_recovery' | 'topology_recovery';

export interface RollbackContinuityBounds {
  rollback_chain_id: string;
  steps_replayed: number;
  max_chain_depth: number;
  time_elapsed_ms: number;
  outcome: 'full' | 'partial' | 'failed' | 'skipped';
  bounded_reason?: string;
  source_phase: RollbackSourcePhase;
}

export interface RollbackExecutionPlan {
  plan_id: string;
  organization_id: string;
  trigger: 'mutation_failed' | 'recovery_requested' | 'topology_fragmented' | 'operator_requested';
  steps: Array<{
    step_id: string;
    source_phase: RollbackSourcePhase;
    source_step_ref: string;
    description: string;
    operator_required: boolean;
    impact_estimate: 'low' | 'medium' | 'high';
  }>;
  aggregation_summary: string;
  source_chains: Array<{ source_phase: RollbackSourcePhase; chain_id: string; step_count: number }>;
  bounded_reason: string;
  created_at: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export function useRollbackExecution(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [plans, setPlans] = useState<RollbackExecutionPlan[]>([]);
  const [bounds, setBounds] = useState<RollbackContinuityBounds[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['rollback.orchestrated', 'execution.isolated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/execution-substrate/rollback-plans?organization_id=${encodeURIComponent(organization_id)}`);
      setPlans((r.data?.plans || []) as RollbackExecutionPlan[]);
      setBounds((r.data?.bounds || []) as RollbackContinuityBounds[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load rollback plans');
    } finally { setLoading(false); }
  }, [organization_id]);

  const buildPlan = useCallback(async (
    trigger: RollbackExecutionPlan['trigger'],
    source_chains: Array<{ source_phase: RollbackSourcePhase; chain_id: string; steps: Array<{ source_step_ref: string; description: string; impact_estimate: 'low' | 'medium' | 'high' }> }>,
  ) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/execution-substrate/rollback-plans', { organization_id, trigger, source_chains });
    await refresh();
    return r.data as RollbackExecutionPlan;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { plans, bounds, loading, error, refresh, buildPlan, streamConnected: stream.connected };
}
