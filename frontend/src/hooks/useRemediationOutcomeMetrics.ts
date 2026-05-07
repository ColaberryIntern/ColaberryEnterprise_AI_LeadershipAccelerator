import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface OutcomeAggregate {
  total_outcomes: number;
  avg_score: number;
  best_cluster_type: { cluster_type: string; avg_score: number; count: number } | null;
  worst_cluster_type: { cluster_type: string; avg_score: number; count: number } | null;
  avg_cognition_delta: number | null;
  avg_ux_debt_delta: number | null;
  historical_success_rate_by_type: Record<string, number>;
}

/**
 * Phase 11 — fetches recent outcome stats for a BP. Backed by the new
 * outcomes endpoint with `?aggregate=true`.
 */
export function useRemediationOutcomeMetrics(bpId: string | null, opts?: { autoFetch?: boolean }) {
  const [data, setData] = useState<OutcomeAggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFetch = opts?.autoFetch !== false;

  const fetch = useCallback(async () => {
    if (!bpId) return null;
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/business-processes/${bpId}/remediation/outcomes?aggregate=true`);
      const agg = (r.data?.aggregate || null) as OutcomeAggregate | null;
      setData(agg);
      return agg;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to fetch outcome metrics');
      return null;
    } finally {
      setLoading(false);
    }
  }, [bpId]);

  useEffect(() => {
    if (autoFetch && bpId) { void fetch(); }
  }, [autoFetch, bpId, fetch]);

  return { data, loading, error, refresh: fetch };
}
