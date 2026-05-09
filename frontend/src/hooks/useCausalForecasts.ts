import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ForecastConfidenceBounds {
  low: number;
  high: number;
  confidence_range: number;
  uncertainty_drivers: string[];
}

export interface CausalStabilityForecastEntry {
  signal: string;
  current_value: number;
  projected_value: number;
  horizon_ms: number;
  direction: 'improving' | 'flat' | 'degrading';
  bounds: ForecastConfidenceBounds;
  rationale: string;
}

export interface CausalStabilityForecast {
  project_id: string;
  entries: CausalStabilityForecastEntry[];
  worst_signal: string | null;
  built_at: string;
}

export function useCausalForecasts(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [forecast, setForecast] = useState<CausalStabilityForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['causal.forecast.generated', 'mutation.execution.failed', 'mutation.rollback.completed'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/adaptive/forecast');
      setForecast((r.data?.forecast || null) as CausalStabilityForecast | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load forecast');
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

  return { forecast, loading, error, refresh, streamConnected: stream.connected };
}
