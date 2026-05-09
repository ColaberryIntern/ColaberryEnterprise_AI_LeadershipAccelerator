import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface TopologyDelegationContainmentProfile {
  envelope_id: string;
  cross_org_attempted: boolean;
  partition_health_score: number;
  partition_quarantined: boolean;
  partition_stability_acceptable: boolean;
  broker_isolations_active: number;
  containment_proof_hash: string;
  verified_at: string;
}

/**
 * Pulls the topology containment profile from a recorded execution
 * trace. Surfaces partition health + cross-org guards.
 */
export function useDelegationContainment(organization_id: string | null) {
  const [profile, setProfile] = useState<TopologyDelegationContainmentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupForTrace = useCallback(async (envelope_id: string) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/delegated-execution/traces?organization_id=${encodeURIComponent(organization_id)}`);
      const traces = (r.data?.traces || []) as Array<any>;
      const trace = traces.find((t) => t.envelope_id === envelope_id);
      const p = trace?.topology_containment ?? null;
      setProfile(p);
      return p as TopologyDelegationContainmentProfile | null;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load containment profile');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { profile, loading, error, lookupForTrace };
}
