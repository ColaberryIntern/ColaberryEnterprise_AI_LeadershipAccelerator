import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface PreparedRemediationPlan {
  id: string;
  project_id: string;
  capability_id: string;
  cluster_signature: string;
  plan_payload: any;
  projected_outcome: any;
  confidence: number;
  status: 'draft' | 'approved' | 'rejected' | 'rolled_back';
  operator_id: string | null;
  decided_at: string | null;
  applied_at: string | null;
  created_at: string;
}

const KINDS = ['remediation.plan.prepared'];

export function usePreparedRemediationPlans(opts?: { status?: string; autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [plans, setPlans] = useState<PreparedRemediationPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: KINDS });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = opts?.status
        ? `/api/portal/project/governance/prepared-plans?status=${encodeURIComponent(opts.status)}`
        : '/api/portal/project/governance/prepared-plans';
      const r = await portalApi.get(url);
      setPlans((r.data?.plans || []) as PreparedRemediationPlan[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, [opts?.status]);

  const decide = useCallback(async (id: string, decision: 'approved' | 'rejected') => {
    await portalApi.post(`/api/portal/project/governance/prepared-plans/${id}/decision`, { decision });
    await refresh();
  }, [refresh]);

  const rollback = useCallback(async (id: string): Promise<{ rollback_prompt_body: string | null }> => {
    const r = await portalApi.post(`/api/portal/project/governance/prepared-plans/${id}/rollback`, {});
    await refresh();
    return { rollback_prompt_body: r.data?.rollback_prompt_body ?? null };
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const handle = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(handle);
  }, [stream.latest, refresh]);

  return { plans, loading, error, refresh, decide, rollback, streamConnected: stream.connected };
}
