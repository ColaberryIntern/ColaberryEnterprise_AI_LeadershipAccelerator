/**
 * useDistributedAwareness — exposes the multi-process bus status (Redis
 * adapter health, bridge state) for ops dashboards.
 */
import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface DistributedStatusResponse {
  redis: { enabled: boolean; adapter_id: string | null; published: number; received: number; dropped: number };
  bridge: { started: boolean; process_id: string; incoming_dedupe_size: number };
}

export function useDistributedAwareness(opts: { pollIntervalMs?: number } = {}) {
  const [data, setData] = useState<DistributedStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/cognitive/distributed-status');
      setData(r.data as DistributedStatusResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load distributed status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!opts.pollIntervalMs || opts.pollIntervalMs <= 0) return;
    const id = window.setInterval(() => { void refresh(); }, opts.pollIntervalMs);
    return () => window.clearInterval(id);
  }, [opts.pollIntervalMs, refresh]);

  return { data, loading, error, refresh };
}
