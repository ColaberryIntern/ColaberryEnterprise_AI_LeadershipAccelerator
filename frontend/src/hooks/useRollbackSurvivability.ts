import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RollbackSurvivabilityRow {
  archetype_id: string;
  archetype_name: string;
  rollback_chain_source_phase: 'phase_15_mutation' | 'phase_21_runtime' | 'phase_22_topology' | 'phase_23_execution_substrate' | 'none';
  rollback_steps_count: number;
  inherited_confidence: { score: number; drivers: string[] };
  uncertainty_bounds: { low: number; expected: number; high: number };
  deterministic_hash: string;
}

export interface RollbackSurvivabilityComparison {
  comparison_id: string;
  organization_id: string;
  rows: RollbackSurvivabilityRow[];
  engine_never_ranks: true;
  heuristic_only: true;
  survivability_hash: string;
  built_at: string;
}

export function useRollbackSurvivability(organization_id: string | null) {
  const [profile, setProfile] = useState<RollbackSurvivabilityComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (archetype_ids?: string[]) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/foresight/survivability', {
        organization_id, archetype_ids,
      });
      setProfile(r.data as RollbackSurvivabilityComparison);
      return r.data as RollbackSurvivabilityComparison;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build survivability comparison');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { profile, loading, error, compare };
}
