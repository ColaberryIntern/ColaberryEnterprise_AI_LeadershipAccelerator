import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface PolicyEvolutionImpactBounds {
  expected_federation_impact: number;
  organizational_visibility_impact: number;
  stabilization_influence_estimate: number;
  rollback_confidence: number;
  uncertainty_drivers: string[];
}

export interface FederationPolicyEvolutionProposal {
  proposal_id: string;
  organization_id: string;
  project_id: string;
  evolution_kind: string;
  proposed_change: any;
  rationale: string;
  impact_bounds: PolicyEvolutionImpactBounds;
  forecasted_impact: string[];
  rollback_path: string[];
  operator_required: true;
  created_at: string;
  status: 'pending_operator' | 'approved' | 'rejected' | 'expired' | 'rolled_back';
  decided_at: string | null;
  decided_by: string | null;
}

export function useFederationPolicyEvolution(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [proposals, setProposals] = useState<FederationPolicyEvolutionProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['federation.policy.proposed'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/federated-learning/policy-proposals');
      setProposals((r.data?.proposals || []) as FederationPolicyEvolutionProposal[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load policy proposals');
    } finally {
      setLoading(false);
    }
  }, []);

  const proposePolicy = useCallback(async (input: {
    evolution_kind: string;
    proposed_change: any;
    rationale: string;
    impact_bounds: PolicyEvolutionImpactBounds;
    forecasted_impact?: string[];
    rollback_path?: string[];
  }) => {
    const r = await portalApi.post('/api/portal/project/governance/federated-learning/policy-proposals', input);
    await refresh();
    return r.data;
  }, [refresh]);

  const approve = useCallback(async (proposalId: string) => {
    const r = await portalApi.post(`/api/portal/project/governance/federated-learning/policy-proposals/${encodeURIComponent(proposalId)}/approve`);
    await refresh();
    return r.data;
  }, [refresh]);

  const reject = useCallback(async (proposalId: string, reason?: string) => {
    const r = await portalApi.post(`/api/portal/project/governance/federated-learning/policy-proposals/${encodeURIComponent(proposalId)}/reject`, { reason });
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  const pending = proposals.filter(p => p.status === 'pending_operator');

  return { proposals, pending, loading, error, refresh, proposePolicy, approve, reject, streamConnected: stream.connected };
}
