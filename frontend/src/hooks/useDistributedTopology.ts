import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface DistributedRuntimeTopology {
  node_id: string;
  brokers: Array<{
    broker_id: string;
    adapter_kind: 'in_memory' | 'redis';
    connection_status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'isolated';
    last_successful_op_at: string | null;
    partition_count: number;
    active_namespaces: string[];
    notes: string[];
  }>;
  partition_count: number;
  total_namespaces: number;
  synchronization_dependencies: Array<{
    from_broker: string;
    to_broker: string;
    relation: 'fallback' | 'replica' | 'shard';
  }>;
  built_at: string;
}

export function useDistributedTopology(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [topology, setTopology] = useState<DistributedRuntimeTopology | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['runtime.topology.changed', 'broker.connected', 'broker.disconnected'],
  });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/distributed-runtime/topology');
      setTopology((r.data || null) as DistributedRuntimeTopology | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load distributed topology');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { topology, loading, error, refresh, streamConnected: stream.connected };
}
