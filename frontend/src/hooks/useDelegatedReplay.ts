import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface DelegatedReplayBundle {
  organization_id: string;
  envelopes: ReadonlyArray<any>;
  traces: ReadonlyArray<any>;
  governance_attributions: ReadonlyArray<any>;
  narratives: ReadonlyArray<any>;
  built_at: string;
}

export function useDelegatedReplay(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [bundle, setBundle] = useState<DelegatedReplayBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/delegated-execution/replay?organization_id=${encodeURIComponent(organization_id)}`);
      setBundle(r.data as DelegatedReplayBundle);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load delegated replay bundle');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { bundle, loading, error, refresh };
}
