import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RecoveryForesightReplayBundle {
  organization_id: string;
  recent_traces: any[];
  determinism_attribution: {
    comparison_hash: string;
    survivability_hash: string;
    tradeoff_hash: string;
    archaeology_hash: string;
    replay_hash: string;
    deterministic_composite_hash: string;
    recorded_at: string;
  };
  determinism_bounds: {
    comparison_hash: string;
    replay_hash: string;
    archaeology_hash: string;
    tradeoff_hash: string;
    deterministic_composite_hash: string;
    recorded_at: string;
  };
  boundary_proof_chain: {
    comparison_hash: string;
    survivability_hash: string;
    tradeoff_hash: string;
    archaeology_hash: string;
    replay_hash: string;
  };
  built_at: string;
}

export function useDecisionReplay(organization_id: string | null) {
  const [bundle, setBundle] = useState<RecoveryForesightReplayBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (archetype_ids?: string[]) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/foresight/replay', {
        organization_id, archetype_ids,
      });
      setBundle(r.data as RecoveryForesightReplayBundle);
      return r.data as RecoveryForesightReplayBundle;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load decision replay');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { bundle, loading, error, refresh };
}
