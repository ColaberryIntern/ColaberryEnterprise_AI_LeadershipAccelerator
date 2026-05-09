import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ContinuityRestorationForecast {
  organization_id: string;
  archetype_id: string;
  forecast_horizon_ms: number;
  estimated_total_duration_ms: number;
  estimated_partition_strain_pressure: number;
  uncertainty_bounds: { low: number; expected: number; high: number };
  inherited_confidence: { score: number; source_phase: string; drivers: string[] };
  heuristic_only: true;
  forecast_hash: string;
  built_at: string;
}

export function useContinuityForecast(organization_id: string | null) {
  const [forecast, setForecast] = useState<ContinuityRestorationForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (archetype_id: string) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/stabilization/forecast', {
        organization_id, archetype_id,
      });
      setForecast(r.data as ContinuityRestorationForecast);
      return r.data as ContinuityRestorationForecast;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build continuity forecast');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { forecast, loading, error, build };
}
