import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type PropagationKind =
  | 'isolation_propagation' | 'continuity_restoration' | 'replay_backlog'
  | 'synchronization_pressure' | 'stabilization_flow';

export interface TopologyReplayAttribution {
  originating_namespace: string;
  impacted_namespaces: string[];
  dependency_depth: number;
  replay_walk: Array<{ step_index: number; namespace: string; arrived_via: string; arrived_from: string | null }>;
  propagation_reason: string;
  replay_confidence: {
    forecast_horizon_minutes: number;
    confidence_low: number;
    confidence_high: number;
    uncertainty_drivers: string[];
    observed_signal_strength: number;
  };
  recorded_at: string;
}

export interface RuntimePropagationReplay {
  replay_id: string;
  organization_id: string;
  partition_id: string;
  entries: Array<{ index: number; propagation_kind: PropagationKind; attribution: TopologyReplayAttribution }>;
  bounded_reason?: string;
  built_at: string;
}

export function usePropagationReplay(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [replays, setReplays] = useState<RuntimePropagationReplay[]>([]);
  const [attributions, setAttributions] = useState<TopologyReplayAttribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['propagation.detected', 'topology.fragmented'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/topology/propagations?organization_id=${encodeURIComponent(organization_id)}`);
      setReplays((r.data?.replays || []) as RuntimePropagationReplay[]);
      setAttributions((r.data?.attributions || []) as TopologyReplayAttribution[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load propagation replays');
    } finally { setLoading(false); }
  }, [organization_id]);

  const triggerReplay = useCallback(async (entries: Array<{ originating_namespace: string; kind: PropagationKind }>) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/topology/propagations/replay', { organization_id, entries });
    await refresh();
    return r.data as RuntimePropagationReplay;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { replays, attributions, loading, error, refresh, triggerReplay, streamConnected: stream.connected };
}
