import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface RuntimeDependencyProfile {
  organization_id: string;
  partition_id: string;
  chains: Array<{
    chain_id: string;
    root_namespace: string;
    path: string[];
    depth: number;
    any_isolated: boolean;
    isolated_namespaces: string[];
    continuity_status: 'continuous' | 'degraded' | 'broken';
  }>;
  stability_score: number;
  built_at: string;
}

export function useRuntimeDependencies(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<RuntimeDependencyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['dependency.degraded', 'broker.isolation.triggered', 'partition.recovered'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/topology/dependencies?organization_id=${encodeURIComponent(organization_id)}`);
      setProfile((r.data || null) as RuntimeDependencyProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load dependency profile');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, loading, error, refresh, streamConnected: stream.connected };
}
