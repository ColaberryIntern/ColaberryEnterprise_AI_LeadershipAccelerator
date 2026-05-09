import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ForecastSignalCalibration {
  observations: number;
  within_bounds_rate: number;
  mean_abs_error: number;
  bound_widen_factor: number;
  recommended_action: 'widen' | 'tighten' | 'hold';
  notes: string[];
}

export interface ForecastCalibrationProfile {
  project_id: string;
  per_signal: Record<string, ForecastSignalCalibration>;
  built_at: string;
}

export function useForecastCalibration(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<ForecastCalibrationProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['forecast.calibration.updated', 'causal.forecast.generated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/operator/forecast-tuning');
      setProfile((r.data?.profile || null) as ForecastCalibrationProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load forecast calibration profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, loading, error, refresh, streamConnected: stream.connected };
}
