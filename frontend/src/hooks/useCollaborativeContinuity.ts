import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface CollaborativeContinuityReplay {
  organization_id: string;
  handoffs_replayed: number;
  transfer_bundles_replayed: number;
  oldest_handoff_at?: string;
  newest_handoff_at?: string;
  replay_window_ms?: number;
  handoff_count_by_kind: Record<string, number>;
  deterministic: true;
  read_only: true;
  replay_hash: string;
  built_at: string;
}

export function useCollaborativeContinuity(organization_id: string | null) {
  const [replay, setReplay] = useState<CollaborativeContinuityReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (filter?: { window_start?: string; window_end?: string }) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/handoff/replay', { organization_id, ...filter });
      setReplay(r.data as CollaborativeContinuityReplay);
      return r.data as CollaborativeContinuityReplay;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build collaborative replay');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { replay, loading, error, build };
}
