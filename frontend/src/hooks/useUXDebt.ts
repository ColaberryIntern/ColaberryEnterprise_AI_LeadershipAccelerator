import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface UXDebtScore {
  layout_debt: number;
  workflow_debt: number;
  navigation_debt: number;
  accessibility_debt: number;
  action_density_debt: number;
  responsiveness_debt: number;
  consistency_debt: number;
  onboarding_debt: number;
  total_debt: number;
  ux_health: number;
}

export interface UXDebtResponse {
  ux_debt: UXDebtScore;
  open_critique_count: number;
  resolved_critique_count: number;
  visual_tasks_count: number;
}

export function useUXDebt(opts: { autoFetch?: boolean } = {}) {
  const [data, setData] = useState<UXDebtResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/visual-review/ux-debt');
      setData(r.data as UXDebtResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load UX debt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) void refresh();
  }, [autoFetch, refresh]);

  return { data, loading, error, refresh };
}
