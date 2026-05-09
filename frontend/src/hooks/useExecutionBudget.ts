import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ExecutionBudgetSnapshot {
  recent_executions_24h: number;
  recent_timeouts_24h: number;
  recent_expirations_24h: number;
  health_scores?: {
    budget_safety: number;
  };
}

/**
 * Surfaces execution budget telemetry from the trust surface — recent
 * timeouts/expirations and the budget_safety health score.
 */
export function useExecutionBudget(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [snapshot, setSnapshot] = useState<ExecutionBudgetSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/delegated-execution/trust?organization_id=${encodeURIComponent(organization_id)}`);
      setSnapshot(r.data as ExecutionBudgetSnapshot);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load execution budget telemetry');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { snapshot, loading, error, refresh };
}
