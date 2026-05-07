import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface AutonomyReplayResponse {
  audits: Array<{ id: string; kind: string; payload: any; recorded_at: string; subject_id: string | null }>;
  plans: Array<{ id: string; status: string; auto_executed_at: string | null; cluster_signature: string; provenance: string | null }>;
  events: Array<{ id: string; kind: string; emitted_at: string; severity?: string; payload: any }>;
}

export function useAutonomyReplay(opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const [data, setData] = useState<AutonomyReplayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const limit = opts?.limit ?? 50;
      const r = await portalApi.get(`/api/portal/project/governance/autonomy/replay?limit=${limit}`);
      setData(r.data as AutonomyReplayResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load replay');
    } finally {
      setLoading(false);
    }
  }, [opts?.limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { data, loading, error, refresh };
}
