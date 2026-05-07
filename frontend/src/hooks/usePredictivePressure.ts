import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface PressureForecast {
  horizon_min: number;
  predicted_pressure: number;
  predicted_tier: 'calm' | 'elevated' | 'urgent' | 'critical';
  slope_per_min: number;
  trend: 'rising' | 'falling' | 'flat';
  confidence: number;
  basis: string[];
  escalation_risk: number;
}

export function usePredictivePressure(horizonMin: number = 30) {
  const [data, setData] = useState<{ forecast: PressureForecast; history_size: number; window_hours: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/cognitive/forecast/pressure', { params: { horizon_min: horizonMin } });
      setData(r.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  }, [horizonMin]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
