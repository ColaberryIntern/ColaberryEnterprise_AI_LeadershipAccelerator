import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RecommendedEnvelopePayload {
  action_kind: string;
  target_namespace?: string;
  target_kind?: string;
  target_organization_id: string;
  target_plan_id?: string;
  target_step_id?: string;
  suggested_rollback_chain_id_hint: string;
  rationale: string;
  draft_hash: string;
}

export interface RollbackSequencingProfile {
  organization_id: string;
  archetype_id: string;
  steps: Array<{
    step_index: number;
    recommended_payload: RecommendedEnvelopePayload;
    rationale: string;
    inherited_confidence_score: number;
  }>;
  advisory_only: true;
  never_auto_executes: true;
  sequencing_hash: string;
  built_at: string;
}

export function useRollbackSequencing(organization_id: string | null) {
  const [profile, setProfile] = useState<RollbackSequencingProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (
    archetype_id: string,
    per_step_overrides?: Array<{
      step_index: number; target_namespace?: string; target_kind?: string;
      target_plan_id?: string; target_step_id?: string;
      suggested_rollback_chain_id_hint?: string;
    }>,
  ) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/stabilization/sequencing', {
        organization_id, archetype_id, per_step_overrides,
      });
      setProfile(r.data as RollbackSequencingProfile);
      return r.data as RollbackSequencingProfile;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build sequencing');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { profile, loading, error, build };
}
