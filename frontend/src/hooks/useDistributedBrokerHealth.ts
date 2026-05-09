import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type BrokerAdapterKind = 'in_memory' | 'redis';
export type BrokerConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'isolated';

export interface DistributedRuntimeVisibility {
  node_id: string;
  partitions: any[];
  broker_continuity_status: BrokerConnectionStatus;
  active_isolations: number;
  replay_backlog_estimate: number;
  synchronization_pressure: number;
  runtime_drift: number;
  federation_continuity_status: 'continuous' | 'recovering' | 'degraded' | 'broken';
  health_scores: {
    broker_continuity: number;
    partition_isolation: number;
    synchronization_stability: number;
    replay_recovery: number;
    distributed_topology_stability: number;
    runtime_drift_pressure: number;
  };
  built_at: string;
}

export function useDistributedBrokerHealth(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [visibility, setVisibility] = useState<DistributedRuntimeVisibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['broker.connected', 'broker.disconnected', 'broker.isolation.triggered', 'partition.recovered', 'replay.restored'],
  });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/distributed-runtime/visibility');
      setVisibility((r.data || null) as DistributedRuntimeVisibility | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load distributed runtime visibility');
    } finally { setLoading(false); }
  }, []);

  const ping = useCallback(async () => {
    try {
      const r = await portalApi.post('/api/portal/project/distributed-runtime/ping', {});
      await refresh();
      return r.data;
    } catch (err: any) {
      throw err;
    }
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { visibility, loading, error, refresh, ping, streamConnected: stream.connected };
}
