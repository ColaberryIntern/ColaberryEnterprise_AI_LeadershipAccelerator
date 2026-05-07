import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface TimelineEvent {
  id: string;
  kind: string;
  emitted_at: string;
  severity?: string;
  payload: any;
}

export interface TimelineSnapshot {
  id: string;
  generated_at: string;
  health_score?: number;
  readiness_score?: number;
  coverage_score?: number;
  maturity_score?: number;
}

export interface GovernanceTimelineResponse {
  events: TimelineEvent[];
  state_snapshots: TimelineSnapshot[];
}

/**
 * Phase 12 — operational evolution timeline. Composite of minute-
 * granular events (~24h retention) + state snapshots (sparser, longer
 * retention). Used by the operator dashboard's timeline panel and the
 * "Why did pressure escalate at 14:32?" explainability surface.
 */
export function useGovernanceTimeline(opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const [data, setData] = useState<GovernanceTimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const limit = opts?.limit ?? 50;
      const r = await portalApi.get(`/api/portal/project/governance/timeline?limit=${limit}`);
      setData(r.data as GovernanceTimelineResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [opts?.limit]);

  const explain = useCallback(async (event_id: string) => {
    const r = await portalApi.get(`/api/portal/project/governance/explain/${event_id}`);
    return r.data;
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { data, loading, error, refresh, explain };
}
