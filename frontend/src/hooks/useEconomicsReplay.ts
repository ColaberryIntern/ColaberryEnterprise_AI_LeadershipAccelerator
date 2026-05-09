import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ExecutionEconomicsReplay {
  organization_id: string;
  quota_profile: any;
  pressure_profile: any;
  topology_load: any;
  rollback_forecast: any;
  recent_quota_governance: any[];
  recent_quota_exhaustions: any[];
  determinism_attribution: {
    counter_snapshot_hash: string;
    quota_snapshot_hash: string;
    pressure_sample_hash: string;
    load_snapshot_hash: string;
    forecast_snapshot_hash: string;
    composite_hash: string;
    recorded_at: string;
  };
  boundary_proof_chain: {
    quota_hash: string;
    pressure_hash: string;
    topology_load_hash: string;
    rollback_forecast_hash: string;
    replay_hash: string;
  };
  built_at: string;
}

export function useEconomicsReplay(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [bundle, setBundle] = useState<ExecutionEconomicsReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/economics/replay?organization_id=${encodeURIComponent(organization_id)}`);
      setBundle(r.data as ExecutionEconomicsReplay);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load economics replay');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { bundle, loading, error, refresh };
}
