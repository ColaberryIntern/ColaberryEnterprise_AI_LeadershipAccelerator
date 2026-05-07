import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface PolicySnapshotEntry {
  id: string;
  trigger: string;
  confidence: number;
  deltas: Record<string, number>;
  policy: any;
  recorded_at: string;
}

export function useLearningReplay(opts: { limit?: number } = {}) {
  const [snapshots, setSnapshots] = useState<PolicySnapshotEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/learning/policy-history', { params: { limit: opts.limit ?? 100 } });
      setSnapshots((r.data?.snapshots ?? []) as PolicySnapshotEntry[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load policy history');
    } finally {
      setLoading(false);
    }
  }, [opts.limit]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { snapshots, loading, error, refresh };
}
