import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RemediationHealthIndex {
  score: number;
  tier: 'healthy' | 'cautious' | 'degraded' | 'critical';
  weakest_dimension: string;
  inputs: {
    effectiveness: number;
    stability: number;
    regression_risk: number;
    ux_velocity: number;
    unresolved_debt_pressure: number;
    confidence: number;
  };
  explanation: string;
}

export function useRemediationHealth(opts?: { autoFetch?: boolean; pollMs?: number }) {
  const [data, setData] = useState<RemediationHealthIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFetch = opts?.autoFetch !== false;
  const pollMs = opts?.pollMs ?? 0;

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/remediation/health-index');
      setData(r.data as RemediationHealthIndex);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to fetch remediation health');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) { void fetch(); }
  }, [autoFetch, fetch]);

  useEffect(() => {
    if (pollMs <= 0) return;
    const id = setInterval(() => { void fetch(); }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, fetch]);

  return { data, loading, error, refresh: fetch };
}
