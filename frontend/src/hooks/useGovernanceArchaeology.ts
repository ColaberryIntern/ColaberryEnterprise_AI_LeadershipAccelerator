import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface GovernanceArchaeologyReplay {
  organization_id: string;
  source_phase_summaries: {
    phase_27_envelope_count: number;
    phase_27_governance_attribution_count: number;
    phase_28_quota_governance_count: number;
    phase_28_quota_exhaustion_count: number;
    phase_29_governance_attribution_count: number;
    phase_29_finality_proof_count: number;
    phase_30_comparison_count: number;
    phase_30_walkthrough_count: number;
    phase_30_governance_count: number;
  };
  read_only: true;
  cross_phase_archaeology: true;
  bounded_to_organization: true;
  archaeology_hash: string;
  built_at: string;
}

export function useGovernanceArchaeology(organization_id: string | null) {
  const [replay, setReplay] = useState<GovernanceArchaeologyReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async () => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/memory/archaeology', { organization_id });
      setReplay(r.data as GovernanceArchaeologyReplay);
      return r.data as GovernanceArchaeologyReplay;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build archaeology');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { replay, loading, error, build };
}
