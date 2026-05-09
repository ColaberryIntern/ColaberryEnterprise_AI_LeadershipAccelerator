import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RecoveryArchaeologyReplayTrace {
  trace_id: string;
  organization_id: string;
  archetype_count: number;
  governance_attribution_count: number;
  finality_proof_count: number;
  sequencing_count: number;
  forecast_count: number;
  pressure_sample_count: number;
  archaeology_hash: string;
  read_only: true;
  cross_phase_archaeology: false;
  built_at: string;
}

export function useRecoveryArchaeology(organization_id: string | null) {
  const [trace, setTrace] = useState<RecoveryArchaeologyReplayTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replay = useCallback(async () => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/foresight/archaeology', {
        organization_id,
      });
      setTrace(r.data as RecoveryArchaeologyReplayTrace);
      return r.data as RecoveryArchaeologyReplayTrace;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to replay archaeology');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { trace, loading, error, replay };
}
