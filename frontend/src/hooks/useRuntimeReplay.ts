import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ContinuityReplayBounds {
  keys_replayed: number;
  namespaces_visited: number;
  time_elapsed_ms: number;
  adapter_kind: 'in_memory' | 'redis';
  replay_outcome: 'full' | 'partial' | 'failed' | 'skipped';
  bounded_reason?: string;
}

export interface RuntimeContinuityReplay {
  replay_id: string;
  organization_id: string | null;
  bounds: ContinuityReplayBounds;
  started_at: string;
  completed_at: string;
  per_namespace: Array<{ namespace: string; keys_visited: number; outcome: string; notes?: string }>;
  trigger: 'boot' | 'isolation_lifted' | 'operator_clicked' | 'broker_reconnected';
  operator_id?: string;
}

export function useRuntimeReplay(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [replays, setReplays] = useState<RuntimeContinuityReplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['replay.restored', 'broker.isolation.triggered'] });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/distributed-runtime/replays');
      setReplays((r.data?.replays || []) as RuntimeContinuityReplay[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load runtime replays');
    } finally { setLoading(false); }
  }, []);

  const triggerReplay = useCallback(async (organization_id?: string | null) => {
    const r = await portalApi.post('/api/portal/project/distributed-runtime/replay', { organization_id: organization_id ?? null });
    await refresh();
    return r.data as RuntimeContinuityReplay;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { replays, loading, error, refresh, triggerReplay, streamConnected: stream.connected };
}
