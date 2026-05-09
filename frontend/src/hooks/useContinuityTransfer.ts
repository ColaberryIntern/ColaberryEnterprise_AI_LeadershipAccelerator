import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ContinuityTransferBundle {
  transfer_bundle_id: string;
  organization_id: string;
  from_operator_id: string;
  to_operator_id: string;
  built_at: string;
  references: {
    phase_27_envelope_ids: string[];
    phase_29_archetype_ids: string[];
    phase_30_comparison_ids: string[];
    phase_31_session_ids: string[];
    phase_31_event_ids: string[];
  };
  grants_authority: false;
  read_only: true;
  engine_never_ranks: true;
  transfer_hash: string;
}

export function useContinuityTransfer(organization_id: string | null) {
  const [bundle, setBundle] = useState<ContinuityTransferBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (input: {
    to_operator_id: string;
    phase_27_envelope_ids?: string[];
    phase_29_archetype_ids?: string[];
    phase_30_comparison_ids?: string[];
    phase_31_session_ids?: string[];
    phase_31_event_ids?: string[];
  }) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/handoff/transfer', { organization_id, ...input });
      setBundle(r.data?.bundle as ContinuityTransferBundle);
      return r.data?.bundle as ContinuityTransferBundle;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build transfer bundle');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { bundle, loading, error, build };
}
