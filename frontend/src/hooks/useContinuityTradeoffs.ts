import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ContinuityTradeoffRow {
  archetype_id: string;
  archetype_name: string;
  estimated_duration_ms: number;
  estimated_strain_pressure: number;
  estimated_replay_amplification: number;
  estimated_topology_strain: number;
  uncertainty_bounds: { low: number; expected: number; high: number };
  deterministic_hash: string;
}

export interface ContinuityTradeoffProfile {
  profile_id: string;
  organization_id: string;
  rows: ContinuityTradeoffRow[];
  heuristic_only: true;
  engine_never_ranks: true;
  tradeoff_hash: string;
  built_at: string;
}

export function useContinuityTradeoffs(organization_id: string | null) {
  const [profile, setProfile] = useState<ContinuityTradeoffProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (archetype_ids?: string[]) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/foresight/tradeoff', {
        organization_id, archetype_ids,
      });
      setProfile(r.data as ContinuityTradeoffProfile);
      return r.data as ContinuityTradeoffProfile;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to analyze tradeoffs');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { profile, loading, error, analyze };
}
