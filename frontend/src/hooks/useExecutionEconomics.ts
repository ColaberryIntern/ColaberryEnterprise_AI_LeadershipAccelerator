import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type ExecutionEconomicsTier =
  | 'stable' | 'constrained' | 'elevated' | 'saturated' | 'exhausted';

export interface ExecutionEconomicsSummary {
  node_id: string;
  recent_quota_exhaustions_24h: number;
  recent_quota_governance_changes_24h: number;
  recent_pressure_samples_24h: number;
  recent_load_classifications_24h: number;
  recent_forecasts_24h: number;
  current_economics_tier: ExecutionEconomicsTier;
  health_scores: {
    budget_reliability: number;
    rollback_cost_certainty: number;
    pressure_classification_confidence: number;
    topology_load_integrity: number;
    quota_safety: number;
    replay_integrity: number;
  };
  last_updated: string;
}

export function useExecutionEconomics(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [summary, setSummary] = useState<ExecutionEconomicsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['quota.exhausted', 'runtime.pressure.changed', 'economics.replay.generated'],
  });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/economics/summary?organization_id=${encodeURIComponent(organization_id)}`);
      setSummary(r.data as ExecutionEconomicsSummary);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load economics summary');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { summary, loading, error, refresh, streamConnected: stream.connected };
}
