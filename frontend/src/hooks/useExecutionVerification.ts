import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface VerificationPlan {
  id: string;
  project_id: string;
  cluster_signature: string | null;
  status: string;
  direct_executed_at: string | null;
  execution_verification_status: 'pending' | 'verified' | 'failed' | 'verification_timeout' | null;
}

/**
 * Phase 14: per-plan verification status + force-verify action.
 * The hook is action-oriented (not a stream) — callers fetch on demand.
 */
export function useExecutionVerification() {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<VerificationPlan | null>(null);

  const forceVerify = useCallback(async (planId: string): Promise<VerificationPlan | null> => {
    setVerifying(true);
    setError(null);
    try {
      const r = await portalApi.post(`/api/portal/project/governance/autonomy/${planId}/verify`);
      const plan = (r.data?.plan || null) as VerificationPlan | null;
      setLastResult(plan);
      return plan;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Force-verify failed');
      return null;
    } finally {
      setVerifying(false);
    }
  }, []);

  return { verifying, error, lastResult, forceVerify };
}
