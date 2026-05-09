import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface StabilizationGuidanceBlock {
  block_id: string;
  archetype_id?: string;
  template_id: string;
  rendered_text: string;
  citations: Array<{ source_kind: string; source_id: string; source_phase: string }>;
  deterministic_hash: string;
}

export interface StabilizationGuidanceSurface {
  guidance_id: string;
  organization_id: string;
  blocks: StabilizationGuidanceBlock[];
  advisory_only: true;
  engine_never_ranks: true;
  built_at: string;
}

export function useStabilizationGuidance(organization_id: string | null) {
  const [surface, setSurface] = useState<StabilizationGuidanceSurface | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (archetype_ids?: string[]) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/foresight/guidance', {
        organization_id, archetype_ids,
      });
      setSurface(r.data as StabilizationGuidanceSurface);
      return r.data as StabilizationGuidanceSurface;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build guidance surface');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { surface, loading, error, build };
}
