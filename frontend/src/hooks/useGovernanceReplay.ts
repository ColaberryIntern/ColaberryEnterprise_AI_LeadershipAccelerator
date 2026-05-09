import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface TransparencyReplayEntry {
  index: number;
  kind: string;
  summary: string;
  recorded_at: string;
  payload: any;
}

export interface GovernanceTransparencyReplay {
  project_id: string;
  entries: TransparencyReplayEntry[];
  truncated: boolean;
  built_at: string;
}

export function useGovernanceReplay(opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const limit = opts?.limit ?? 50;
  const [replay, setReplay] = useState<GovernanceTransparencyReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['governance.calibration.approved', 'governance.calibration.rejected', 'specialization.routing.updated', 'forecast.calibration.updated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/operator/transparency-replay?limit=${limit}`);
      setReplay((r.data?.replay || null) as GovernanceTransparencyReplay | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load transparency replay');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { replay, loading, error, refresh, streamConnected: stream.connected };
}
