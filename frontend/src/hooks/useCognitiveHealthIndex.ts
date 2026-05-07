import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface CognitiveHealthIndex {
  score: number;
  tier: 'healthy' | 'cautious' | 'degraded' | 'critical';
  orchestration_health: number;
  cognition_health: number;
  UX_health: number;
  behavioral_health: number;
  pressure_health: number;
  contradiction_health: number;
  prediction_confidence: number;
  operational_stability: number;
  weakest_dimension: string;
  explanation: string;
}

export function useCognitiveHealthIndex(opts: { autoFetch?: boolean; pollIntervalMs?: number } = {}) {
  const [data, setData] = useState<CognitiveHealthIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/cognitive/health-index');
      setData(r.data as CognitiveHealthIndex);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load cognitive health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!opts.pollIntervalMs || opts.pollIntervalMs <= 0) return;
    const id = window.setInterval(() => { void refresh(); }, opts.pollIntervalMs);
    return () => window.clearInterval(id);
  }, [opts.pollIntervalMs, refresh]);

  return { data, loading, error, refresh };
}
