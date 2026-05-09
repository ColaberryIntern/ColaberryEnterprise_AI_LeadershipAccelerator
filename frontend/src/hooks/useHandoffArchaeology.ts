import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface OperatorHandoffArchaeologyReplay {
  organization_id: string;
  total_handoffs: number;
  handoffs_by_lifecycle: Record<string, number>;
  distinct_from_operator_count: number;
  distinct_to_operator_count: number;
  oldest_handoff_at?: string;
  newest_handoff_at?: string;
  read_only: true;
  bounded_to_organization: true;
  engine_never_ranks: true;
  archaeology_hash: string;
  built_at: string;
}

export function useHandoffArchaeology(organization_id: string | null) {
  const [replay, setReplay] = useState<OperatorHandoffArchaeologyReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async () => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/handoff/archaeology', { organization_id });
      setReplay(r.data as OperatorHandoffArchaeologyReplay);
      return r.data as OperatorHandoffArchaeologyReplay;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build handoff archaeology');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { replay, loading, error, build };
}
