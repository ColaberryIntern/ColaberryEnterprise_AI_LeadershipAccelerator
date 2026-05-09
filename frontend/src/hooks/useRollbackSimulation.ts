import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface RollbackSimulationReplay {
  simulation_id: string;
  experiment_id: string;
  organization_id: string;
  source_chain_ids: string[];
  steps: Array<{
    step_index: number;
    source_step_ref: string;
    source_phase: string;
    projected_lifecycle_transition: { worker_id?: string; from: string; to: string };
    projected_namespace_change?: any;
    explanation: string;
  }>;
  projected_outcome: 'all_full' | 'partial' | 'mixed' | 'failed' | 'skipped';
  determinism: any;
  bounded_reason?: string;
  built_at: string;
}

export function useRollbackSimulation(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [simulations, setSimulations] = useState<RollbackSimulationReplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['rollback.simulated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/experimentation/rollback-simulations?organization_id=${encodeURIComponent(organization_id)}`);
      setSimulations((r.data?.simulations || []) as RollbackSimulationReplay[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load rollback simulations');
    } finally { setLoading(false); }
  }, [organization_id]);

  const simulate = useCallback(async (plan_id?: string, source_chain_ids?: string[]) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/experimentation/rollback-simulation', {
      organization_id, plan_id, source_chain_ids,
    });
    await refresh();
    return r.data as RollbackSimulationReplay;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { simulations, loading, error, refresh, simulate, streamConnected: stream.connected };
}
