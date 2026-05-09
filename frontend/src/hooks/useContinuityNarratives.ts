import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ContinuityNarrativeBlock {
  block_id: string;
  template_id: string;
  rendered_text: string;
  citations: Array<{ source_kind: string; source_id: string; source_phase: string }>;
  deterministic_hash: string;
}

export interface ContinuityNarrative {
  narrative_id: string;
  organization_id: string;
  blocks: ContinuityNarrativeBlock[];
  built_at: string;
}

export function useContinuityNarratives(organization_id: string | null) {
  const [narrative, setNarrative] = useState<ContinuityNarrative | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async () => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/memory/narrative', { organization_id });
      setNarrative(r.data as ContinuityNarrative);
      return r.data as ContinuityNarrative;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build continuity narrative');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { narrative, loading, error, build };
}
