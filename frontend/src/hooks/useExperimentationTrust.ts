import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ExperimentationTrustSurface {
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

export function useExperimentationTrust(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [trust, setTrust] = useState<ExperimentationTrustSurface | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['sandbox.completed', 'experimentation.replayed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/experimentation/trust?organization_id=${encodeURIComponent(organization_id)}`);
      setTrust((r.data || null) as ExperimentationTrustSurface | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load experimentation trust surface');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { trust, loading, error, refresh, streamConnected: stream.connected };
}
