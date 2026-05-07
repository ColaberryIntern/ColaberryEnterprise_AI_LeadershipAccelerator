import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface GovernanceAdvice {
  risk_level: 'low' | 'moderate' | 'elevated' | 'high';
  should_block_rollout: boolean;
  recommendation: string;
  contributing_factors: string[];
  required_human_approval: boolean;
  watch_routes: string[];
}

export function useGovernanceAdvice() {
  const [advice, setAdvice] = useState<GovernanceAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestAdvice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/governance/advice', {});
      setAdvice(r.data as GovernanceAdvice);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to fetch governance advice');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { advice, loading, error, requestAdvice };
}
