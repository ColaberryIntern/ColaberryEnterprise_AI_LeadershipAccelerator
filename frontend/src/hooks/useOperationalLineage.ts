import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface LineageNode {
  node_id: string;
  kind: 'mutation' | 'contradiction' | 'rollback' | 'remediation' | 'governance_decision' | 'stabilization';
  project_id: string;
  subject_id: string | null;
  timestamp: string;
  summary: string;
  severity: 'info' | 'warning' | 'error';
  payload: any;
}

export interface LineageEdge {
  from: string;
  to: string;
  relation: string;
  confidence: number;
  evidence: string;
}

export interface OperationalLineageGraph {
  project_id: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  root_node_ids: string[];
  leaf_node_ids: string[];
  max_observed_depth: number;
  built_at: string;
}

export function useOperationalLineage(opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const limit = opts?.limit ?? 200;
  const [graph, setGraph] = useState<OperationalLineageGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['causality.lineage.updated', 'mutation.execution.started', 'mutation.rollback.completed'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/causality/lineage?limit=${limit}`);
      setGraph((r.data?.graph || null) as OperationalLineageGraph | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load lineage graph');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { graph, loading, error, refresh, streamConnected: stream.connected };
}
