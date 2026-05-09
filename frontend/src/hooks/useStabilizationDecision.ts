import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type DecisionForesightTier =
  | 'clear' | 'explorable' | 'contested' | 'unsuitable' | 'blocked';

export interface ArchetypeComparisonRow {
  archetype_id: string;
  archetype_name: string;
  provenance: 'built_in' | 'operator_set';
  step_count: number;
  duration_ms: number;
  strain_pressure: number;
  confidence: number;
  governance_passed: boolean;
  governance_reason?: string;
  deterministic_hash: string;
}

export interface StabilizationDecisionComparisonProfile {
  comparison_id: string;
  organization_id: string;
  rows: ArchetypeComparisonRow[];
  engine_never_ranks: true;
  advisory_only: true;
  tier: DecisionForesightTier;
  comparison_hash: string;
  built_at: string;
}

export function useStabilizationDecision(organization_id: string | null) {
  const [profile, setProfile] = useState<StabilizationDecisionComparisonProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['stabilization.decision.generated'] });

  const compare = useCallback(async (archetype_ids?: string[], per_step_rollback_chain_id_hint?: string) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/foresight/comparison', {
        organization_id, archetype_ids, per_step_rollback_chain_id_hint,
      });
      setProfile(r.data as StabilizationDecisionComparisonProfile);
      return r.data as StabilizationDecisionComparisonProfile;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build comparison');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => {
    if (!stream.latest || !organization_id) return;
    // Don't auto-rebuild — operator triggers comparisons explicitly.
  }, [stream.latest, organization_id]);

  return { profile, loading, error, compare, streamConnected: stream.connected };
}
