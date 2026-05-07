import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface CognitivePolicySnapshot {
  project_id: string;
  priority_weights: Record<string, number>;
  escalation: Record<string, number>;
  guardrails: { mode: 'autonomous' | 'supervised' | 'frozen'; min_confidence_to_apply: number; max_total_drift_per_window: number; rollback_after_worse_outcomes: number };
  version: number;
  updated_at: string;
}

export interface PolicyResponse {
  policy: CognitivePolicySnapshot;
  recent_drift: number;
  consecutive_worse_outcomes: number;
}

export function useAdaptivePolicy() {
  const [data, setData] = useState<PolicyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/learning/policy');
      setData(r.data as PolicyResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load policy');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
