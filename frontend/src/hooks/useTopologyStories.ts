import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { OperationalNarrative } from './useOperationalNarratives';

export interface TopologyNarrativeReplay {
  narrative: OperationalNarrative;
  fragmentation_tier: 'cohesive' | 'partial' | 'fragmented' | 'shattered';
  fragmentation_pressure_score: number;
  active_isolation_count: number;
  built_at: string;
}

export function useTopologyStories(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [topology, setTopology] = useState<TopologyNarrativeReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['topology.explained', 'topology.fragmented', 'topology.stabilized', 'topology.forecast.updated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/cognitive-compression/topology-narrative?organization_id=${encodeURIComponent(organization_id)}`);
      setTopology((r.data || null) as TopologyNarrativeReplay | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load topology narrative');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { topology, loading, error, refresh, streamConnected: stream.connected };
}
