import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ReplayEntry {
  id: string;
  captured_at: string;
  screenshot_path: string | null;
  viewport: { width: number; height: number } | null;
  cognition_score: number | null;
  hierarchy_score: number | null;
  cta_score: number | null;
}

export function useVisualReplay(route: string | null, opts: { autoFetch?: boolean; limit?: number } = {}) {
  const [entries, setEntries] = useState<ReplayEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true, limit = 50 } = opts;

  const refresh = useCallback(async () => {
    if (!route) { setEntries([]); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/multimodal/replay', { params: { route, limit } });
      setEntries((r.data?.entries || []) as ReplayEntry[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load replay');
    } finally {
      setLoading(false);
    }
  }, [route, limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { entries, loading, error, refresh };
}
