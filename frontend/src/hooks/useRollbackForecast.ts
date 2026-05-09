import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RollbackResourceForecast {
  organization_id: string;
  forecast_horizon_ms: number;
  estimated_rollback_chains: number;
  estimated_replay_duration_ms: number;
  uncertainty_bounds: { low: number; expected: number; high: number };
  inherited_confidence: { score: number; source_phase: string; drivers: string[] };
  heuristic_only: true;
  forecast_hash: string;
  built_at: string;
}

export function useRollbackForecast(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [forecast, setForecast] = useState<RollbackResourceForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/economics/forecast?organization_id=${encodeURIComponent(organization_id)}`);
      setForecast(r.data as RollbackResourceForecast);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load rollback forecast');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { forecast, loading, error, refresh };
}
