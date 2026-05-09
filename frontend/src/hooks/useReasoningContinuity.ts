import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ReasoningContinuityReplay {
  organization_id: string;
  events_replayed: number;
  sessions_replayed: number;
  oldest_event_recorded_at?: string;
  newest_event_recorded_at?: string;
  replay_window_ms?: number;
  event_count_by_kind: Record<string, number>;
  deterministic: true;
  read_only: true;
  replay_hash: string;
  built_at: string;
}

export function useReasoningContinuity(organization_id: string | null) {
  const [replay, setReplay] = useState<ReasoningContinuityReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (filter?: {
    window_start?: string; window_end?: string; operator_id_filter?: string;
  }) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/memory/replay', {
        organization_id, ...filter,
      });
      setReplay(r.data as ReasoningContinuityReplay);
      return r.data as ReasoningContinuityReplay;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build reasoning replay');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { replay, loading, error, build };
}
