import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface CausalRecoveryStep {
  index: number;
  kind: 'contain_root' | 'rollback_target' | 'recalibrate_trust' | 'reenable_governance' | 'suppress_propagation_branch' | 'monitor_only';
  subject: string;
  rationale: string;
  api_path: string | null;
}

export interface CausalRecoveryChain {
  project_id: string;
  trigger_summary: string;
  steps: CausalRecoveryStep[];
  total_steps: number;
  estimated_recovery_minutes: number;
  built_at: string;
}

/**
 * Phase 17 — operator-facing recovery chain composer. The engine plans
 * the chain over existing Phase 13-16 primitives; the operator clicks
 * through each step.
 */
export function useAdaptiveGovernance() {
  const [chain, setChain] = useState<CausalRecoveryChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildRecoveryChain = useCallback(async (trigger?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = trigger
        ? `/api/portal/project/governance/adaptive/recovery-chain?trigger=${encodeURIComponent(trigger)}`
        : '/api/portal/project/governance/adaptive/recovery-chain';
      const r = await portalApi.get(url);
      const c = (r.data?.chain || null) as CausalRecoveryChain | null;
      setChain(c);
      return c;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build recovery chain');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { chain, loading, error, buildRecoveryChain };
}
