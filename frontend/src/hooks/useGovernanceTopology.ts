import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface TopologyNode {
  node_id: string;
  kind: 'validator' | 'arbitration' | 'specialization_zone' | 'trust_cluster' | 'stabilization_hub' | 'bottleneck';
  label: string;
  metadata: any;
}

export interface TopologyEdge {
  from: string;
  to: string;
  relation: string;
  strength: number;
}

export interface GovernanceTopologyMap {
  project_id: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  identified_bottlenecks: string[];
  identified_hubs: string[];
  built_at: string;
}

export function useGovernanceTopology(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [topology, setTopology] = useState<GovernanceTopologyMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['governance.topology.changed', 'validator.drift.detected', 'specialization.routing.updated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/operator/topology');
      setTopology((r.data?.topology || null) as GovernanceTopologyMap | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load governance topology');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { topology, loading, error, refresh, streamConnected: stream.connected };
}
