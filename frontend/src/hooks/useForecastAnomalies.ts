import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ForecastAnomalyEntry {
  kind: string;
  observed_value: number;
  rolling_mean: number;
  rolling_stddev: number;
  z_score: number;
  is_anomalous: boolean;
  observed_at: string;
  explanation: string;
}

export interface ForecastAnomalyProfile {
  project_id: string;
  entries: ForecastAnomalyEntry[];
  active_anomalies: number;
  anomaly_pressure_score: number;
  built_at: string;
}

export function useForecastAnomalies(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<ForecastAnomalyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['governance.drift.detected', 'forecast.calibration.updated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/federation/forecast-anomalies');
      setProfile((r.data?.profile || null) as ForecastAnomalyProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load anomaly profile');
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
