import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface OverrideEntry {
  id: string;
  project_id: string;
  kind: string;
  subject_id: string | null;
  payload: any;
  operator_id: string | null;
  recorded_at: string;
}

export function useOperatorOverrides(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/operator-overrides');
      setOverrides((r.data?.overrides || []) as OverrideEntry[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load overrides');
    } finally {
      setLoading(false);
    }
  }, []);

  const recordOverride = useCallback(async (subject_id: string | null, reason: string) => {
    const r = await portalApi.post('/api/portal/project/governance/operator-overrides', { subject_id, reason });
    await refresh();
    return r.data as { override: OverrideEntry; storm_triggered: boolean; velocity: number };
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { overrides, loading, error, refresh, recordOverride };
}
