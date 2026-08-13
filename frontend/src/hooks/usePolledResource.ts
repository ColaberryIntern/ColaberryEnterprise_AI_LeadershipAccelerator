import { useCallback, useEffect, useState } from 'react';

// ProofDesk Outcomes & Learning — Milestone 5. Extracted from
// AdminWorkLedgerHealthPage.tsx, which had the same fetch/loading/error/10s-interval
// shape repeated 5+ times (the pre-existing health + governance blocks, plus 4 new
// M5 panels) — per root CLAUDE.md's Composition Rules ("when the same 5+ lines of
// non-trivial logic appear in three places, lift them"). Each panel's fetch stays
// deliberately independent (its own hook instance) so one panel's failure never
// affects another's render, matching the pre-existing governance-panel invariant.

export interface PolledResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePolledResource<T>(
  fetchFn: () => Promise<T>,
  intervalMs = 10000,
  errorFallback = 'Failed to load data',
): PolledResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || errorFallback);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, intervalMs);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
