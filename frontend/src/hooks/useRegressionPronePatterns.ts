import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RegressionPronePattern {
  cluster_signature: string;
  cluster_type: string;
  recurrence_count: number;
  project_id: string;
  capability_id: string;
  last_seen_at: string;
  last_failed_action: string;
  recommended_alternative: string;
}

export interface RegressionDetectionResult {
  patterns: RegressionPronePattern[];
  scanned_outcomes: number;
  window_days: number;
}

export function useRegressionPronePatterns(opts?: { autoFetch?: boolean }) {
  const [data, setData] = useState<RegressionDetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFetch = opts?.autoFetch !== false;

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/remediation/regression-prone');
      setData(r.data as RegressionDetectionResult);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to fetch regression patterns');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) { void fetch(); }
  }, [autoFetch, fetch]);

  return { data, loading, error, refresh: fetch };
}
