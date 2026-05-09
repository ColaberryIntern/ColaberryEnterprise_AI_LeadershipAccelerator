import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type FragmentationTier = 'cohesive' | 'partial' | 'fragmented' | 'shattered';

export interface TopologyFragmentationProfile {
  organization_id: string;
  partition_id: string;
  tier: FragmentationTier;
  fragmentation_pressure_score: number;
  active_isolation_count: number;
  active_namespaces: number;
  isolated_root_count: number;
  isolated_dependency_clusters: Array<{
    cluster_root: string;
    cluster_depth: number;
    cluster_namespaces: string[];
    explanation: string;
  }>;
  notes: string[];
  built_at: string;
}

export interface TopologyForecastProfile {
  organization_id: string;
  partition_id: string;
  current_tier: FragmentationTier;
  forecast_tier: FragmentationTier;
  forecast_horizon_minutes: number;
  bounds: {
    forecast_horizon_minutes: number;
    confidence_low: number;
    confidence_high: number;
    uncertainty_drivers: string[];
    observed_signal_strength: number;
  };
  drivers: string[];
  built_at: string;
}

export function useTopologyFragmentation(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<TopologyFragmentationProfile | null>(null);
  const [forecast, setForecast] = useState<TopologyForecastProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['topology.fragmented', 'topology.stabilized', 'topology.forecast.updated', 'broker.isolation.triggered'],
  });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const [fr, fc] = await Promise.all([
        portalApi.get(`/api/portal/project/topology/fragmentation?organization_id=${encodeURIComponent(organization_id)}`),
        portalApi.get(`/api/portal/project/topology/forecast?organization_id=${encodeURIComponent(organization_id)}`),
      ]);
      setProfile((fr.data || null) as TopologyFragmentationProfile | null);
      setForecast((fc.data || null) as TopologyForecastProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load fragmentation profile');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, forecast, loading, error, refresh, streamConnected: stream.connected };
}
