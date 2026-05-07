import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface UXPressureReport {
  pressure_level: number;
  tier: 'calm' | 'elevated' | 'urgent' | 'critical';
  reasons: string[];
  recommended_action: string;
  applied_weight_factor: number;
}

export interface RankAdjustment {
  task_id: string;
  previous_rank: number;
  adjusted_rank: number;
  delta: number;
  reasons: string[];
}

export interface AdaptiveUXPressureResponse {
  pressure: UXPressureReport;
  inputs: {
    friction_pressure: number;
    worst_cognition_score: number;
    has_recent_regression: boolean;
    unresolved_high_contradictions: number;
    rage_routes: number;
    loop_routes: number;
    abandon_routes: number;
  };
  adjustments: RankAdjustment[];
  affected_task_count: number;
}

export function useAdaptiveUXPressure(opts: { autoFetch?: boolean; pollIntervalMs?: number } = {}) {
  const [data, setData] = useState<AdaptiveUXPressureResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/orchestration/pressure');
      setData(r.data as AdaptiveUXPressureResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load UX pressure');
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
