import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface StabilizationReplayBundle {
  organization_id: string;
  recent_traces: any[];
  determinism_attribution: {
    archetype_hash: string;
    sequencing_hash: string;
    replay_hash: string;
    forecast_hash: string;
    deterministic_composite_hash: string;
    recorded_at: string;
  };
  boundary_proof_chain: {
    archetype_hash: string;
    sequencing_hash: string;
    forecast_hash: string;
    pressure_hash: string;
    replay_hash: string;
  };
  built_at: string;
}

export function useStabilizationReplay(
  organization_id: string | null,
  archetype_id: string | undefined,
  opts?: { autoFetch?: boolean },
) {
  const autoFetch = opts?.autoFetch !== false;
  const [bundle, setBundle] = useState<StabilizationReplayBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const url = `/api/portal/project/stabilization/replay?organization_id=${encodeURIComponent(organization_id)}${archetype_id ? `&archetype_id=${encodeURIComponent(archetype_id)}` : ''}`;
      const r = await portalApi.get(url);
      setBundle(r.data as StabilizationReplayBundle);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load stabilization replay');
    } finally { setLoading(false); }
  }, [organization_id, archetype_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { bundle, loading, error, refresh };
}
