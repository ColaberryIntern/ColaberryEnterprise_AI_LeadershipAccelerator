import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface VisualDiffEntry {
  dimension: string;
  previous: number | string;
  current: number | string;
  delta: number;
  direction: 'improved' | 'regressed' | 'shifted';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface VisualDiffReport {
  entries: VisualDiffEntry[];
  net_score_delta: number;
  is_regression: boolean;
  is_improvement: boolean;
  summary: string;
}

export function useVisualDiffs() {
  const [data, setData] = useState<{ diff: VisualDiffReport; prev_snapshot_id: string; current_snapshot_id: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (route: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/multimodal/diff', { route });
      setData(r.data);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to compute diff');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, compare };
}
