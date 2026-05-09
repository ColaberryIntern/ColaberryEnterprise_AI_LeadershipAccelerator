import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface StabilizationTrustSurface {
  organization_id: string;
  bands: Array<{
    label: string;
    score: number;
    inherited_from_phase: string;
    drivers: string[];
    source_attribution_id: string;
  }>;
  aggregate_score: number;
  built_at: string;
}

export function useStabilizationTrust(
  organization_id: string | null,
  archetype_id: string | undefined,
  opts?: { autoFetch?: boolean },
) {
  const autoFetch = opts?.autoFetch !== false;
  const [trust, setTrust] = useState<StabilizationTrustSurface | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['stabilization.trust.updated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const url = `/api/portal/project/stabilization/trust?organization_id=${encodeURIComponent(organization_id)}${archetype_id ? `&archetype_id=${encodeURIComponent(archetype_id)}` : ''}`;
      const r = await portalApi.get(url);
      setTrust(r.data as StabilizationTrustSurface);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load stabilization trust');
    } finally { setLoading(false); }
  }, [organization_id, archetype_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { trust, loading, error, refresh, streamConnected: stream.connected };
}
