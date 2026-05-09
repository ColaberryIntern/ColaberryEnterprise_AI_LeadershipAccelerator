import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface FederationLineageNode {
  node_id: string;
  kind: 'source_project' | 'archetype' | 'consumer_project';
  label: string;
  metadata: any;
}

export interface FederationLineageEdge {
  from: string;
  to: string;
  relation: 'shared' | 'consumed' | 'surfaced_to' | 'hashed_into';
  recorded_at: string;
}

export interface FederationLineageGraph {
  organization_id: string | null;
  nodes: FederationLineageNode[];
  edges: FederationLineageEdge[];
  archetype_count: number;
  source_project_count: number;
  consumer_project_count: number;
  built_at: string;
}

export function useFederationLineage(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [lineage, setLineage] = useState<FederationLineageGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['archetype.federated', 'federation.enabled', 'federation.disabled'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/federation/lineage');
      setLineage((r.data?.lineage || null) as FederationLineageGraph | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load federation lineage');
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

  return { lineage, loading, error, refresh, streamConnected: stream.connected };
}
