import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RemediationOutcomeAggregate {
  total_attempts: number;
  resolved_count: number;
  recurred_count: number;
  avg_pressure_delta: number | null;
  avg_cognition_delta: number | null;
  avg_score: number;
  best_action: { action: string; success_rate: number; attempts: number } | null;
  worst_action: { action: string; success_rate: number; attempts: number } | null;
}

export function useOrchestrationLearning(opts: { autoFetch?: boolean } = {}) {
  const [aggregate, setAggregate] = useState<RemediationOutcomeAggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/learning/remediation-outcomes');
      setAggregate(r.data as RemediationOutcomeAggregate);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load learning data');
    } finally {
      setLoading(false);
    }
  }, []);

  const runTick = useCallback(async () => {
    const r = await portalApi.post('/api/portal/project/learning/tick', {});
    await refresh();
    return r.data;
  }, [refresh]);

  const recordOutcome = useCallback(async (input: {
    incident_id: string;
    pattern_signature?: string;
    remediation_action: string;
    accepted: boolean;
    implemented: boolean;
    resolved: boolean;
    pressure_delta?: number;
    cognition_delta?: number;
    recurred_within_7d?: boolean;
    notes?: string;
  }) => {
    const r = await portalApi.post('/api/portal/project/learning/remediation-outcomes', input);
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { aggregate, loading, error, refresh, runTick, recordOutcome };
}
