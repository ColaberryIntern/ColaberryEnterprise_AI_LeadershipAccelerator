import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface DelegatedRollbackProtectionProfile {
  envelope_id: string;
  rollback_available: boolean;
  rollback_chain_id: string;
  rollback_chain_source_phase: 'phase_21_distributed_runtime' | 'phase_22_topology_recovery' | 'phase_23_execution_substrate' | 'none';
  rollback_steps_summary: ReadonlyArray<string>;
  verification_hash: string;
  verified_at: string;
}

/**
 * Delegated rollback protection lookup — surfaces the rollback profile
 * stamped onto each execution trace.
 */
export function useRollbackProtection(organization_id: string | null) {
  const [profile, setProfile] = useState<DelegatedRollbackProtectionProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupForTrace = useCallback(async (envelope_id: string) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/delegated-execution/traces?organization_id=${encodeURIComponent(organization_id)}`);
      const traces = (r.data?.traces || []) as Array<any>;
      const trace = traces.find((t) => t.envelope_id === envelope_id);
      const p = trace?.rollback_protection ?? null;
      setProfile(p);
      return p as DelegatedRollbackProtectionProfile | null;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load rollback protection profile');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { profile, loading, error, lookupForTrace };
}
