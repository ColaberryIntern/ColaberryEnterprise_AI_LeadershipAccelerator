import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type PartitionIsolationTier = 'healthy' | 'monitoring' | 'degraded' | 'isolated' | 'quarantined';

export interface RuntimePartitionProfile {
  organization_id: string;
  partition_id: string;
  tier: PartitionIsolationTier;
  health_score: number;
  recent_ops_count: number;
  recent_failure_count: number;
  recent_fallback_count: number;
  active_namespaces: string[];
  last_op_at: string | null;
  last_failure_at: string | null;
  last_isolation_event_at: string | null;
  notes: string[];
  built_at: string;
}

export function useRuntimePartitions(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [partitions, setPartitions] = useState<RuntimePartitionProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['broker.isolation.triggered', 'partition.recovered'] });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/distributed-runtime/partitions');
      setPartitions((r.data?.partitions || []) as RuntimePartitionProfile[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load runtime partitions');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { partitions, loading, error, refresh, streamConnected: stream.connected };
}
