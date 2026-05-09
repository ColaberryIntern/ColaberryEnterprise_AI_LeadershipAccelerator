import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { DelegatedPressureTier } from './useRuntimePressure';

export interface TopologyLoadDistributionProfile {
  organization_id: string;
  partitions: Array<{
    partition_key: string;
    load_score: number;
    tier: DelegatedPressureTier;
    observed_envelope_count: number;
    observed_execution_count: number;
  }>;
  imbalance_score: number;
  advisory_recommendation?: string;
  recommendation_only: true;
  never_auto_migrates: true;
  distribution_hash: string;
  built_at: string;
}

export function useTopologyLoad(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<TopologyLoadDistributionProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['topology.load.classified'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/economics/load?organization_id=${encodeURIComponent(organization_id)}`);
      setProfile(r.data as TopologyLoadDistributionProfile);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load topology load profile');
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
