import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ContradictionCluster {
  cluster_id: string;
  anchor_kind: string;
  project_id: string;
  window_start: string;
  window_end: string;
  members: any[];
  affected_subjects: string[];
  density: number;
}

export interface ContradictionPropagationProfile {
  project_id: string;
  clusters: ContradictionCluster[];
  total_contradictions_in_window: number;
  hotspots: Array<{ subject_id: string; count: number; worst_severity: string }>;
  built_at: string;
}

export function useContradictionPropagation(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<ContradictionPropagationProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['contradiction.propagation.detected', 'mutation.execution.failed'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/causality/propagation');
      setProfile((r.data?.profile || null) as ContradictionPropagationProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load propagation profile');
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

  return { profile, loading, error, refresh, streamConnected: stream.connected };
}
