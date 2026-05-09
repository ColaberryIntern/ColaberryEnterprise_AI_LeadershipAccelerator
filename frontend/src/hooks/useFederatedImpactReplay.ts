import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface DiffusionReplayEntry {
  index: number;
  archetype_signature: string;
  source_project: string;
  consumer_projects: string[];
  local_calibrations_generated: number;
  stabilization_improved_count: number;
  stabilization_regressed_count: number;
  observed_at: string;
  summary: string;
}

export interface FederatedImpactDiffusionReplay {
  organization_id: string;
  archetype_signature: string | null;
  entries: DiffusionReplayEntry[];
  truncated: boolean;
  built_at: string;
}

export function useFederatedImpactReplay() {
  const [replay, setReplay] = useState<FederatedImpactDiffusionReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReplay = useCallback(async (archetypeSignature?: string, limit?: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (archetypeSignature) params.set('archetype_signature', archetypeSignature);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const r = await portalApi.get(`/api/portal/project/governance/federated-learning/diffusion-replay${qs}`);
      const data = (r.data?.replay || null) as FederatedImpactDiffusionReplay | null;
      setReplay(data);
      return data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load diffusion replay');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { replay, loading, error, fetchReplay };
}
