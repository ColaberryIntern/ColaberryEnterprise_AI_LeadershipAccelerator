import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ContinuityTransferNarrativeBlock {
  block_id: string;
  template_id: string;
  rendered_text: string;
  citations: Array<{ source_kind: string; source_id: string; source_phase: string }>;
  deterministic_hash: string;
}

export interface ContinuityTransferNarrative {
  narrative_id: string;
  organization_id: string;
  blocks: ContinuityTransferNarrativeBlock[];
  built_at: string;
}

export function useContinuityTransferNarratives(organization_id: string | null) {
  const [narrative, setNarrative] = useState<ContinuityTransferNarrative | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async () => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/handoff/narrative', { organization_id });
      setNarrative(r.data as ContinuityTransferNarrative);
      return r.data as ContinuityTransferNarrative;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build continuity transfer narrative');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { narrative, loading, error, build };
}
