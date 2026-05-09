import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface CalibrationConfidenceBounds {
  low: number;
  high: number;
  confidence_range: number;
  uncertainty_drivers: string[];
  expected_governance_impact: number;
  rollback_confidence: number;
}

export interface GovernanceCalibrationProposal {
  proposal_id: string;
  project_id: string;
  calibration_type: string;
  proposed_change: any;
  rationale: string;
  bounds: CalibrationConfidenceBounds;
  forecasted_impact: string[];
  rollback_path: string[];
  operator_required: true;
  created_at: string;
  status: 'pending_operator' | 'approved' | 'rejected' | 'expired' | 'rolled_back';
  decided_at: string | null;
  decided_by: string | null;
}

export function useGovernanceCalibration(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [proposals, setProposals] = useState<GovernanceCalibrationProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['governance.calibration.proposed', 'governance.calibration.approved', 'governance.calibration.rejected'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/operator/calibration-proposals');
      setProposals((r.data?.proposals || []) as GovernanceCalibrationProposal[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load calibration proposals');
    } finally {
      setLoading(false);
    }
  }, []);

  const approve = useCallback(async (proposalId: string) => {
    const r = await portalApi.post(`/api/portal/project/governance/operator/calibration-proposals/${encodeURIComponent(proposalId)}/approve`);
    await refresh();
    return r.data;
  }, [refresh]);

  const reject = useCallback(async (proposalId: string, reason?: string) => {
    const r = await portalApi.post(`/api/portal/project/governance/operator/calibration-proposals/${encodeURIComponent(proposalId)}/reject`, { reason });
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

  return { proposals, pending, loading, error, refresh, approve, reject, streamConnected: stream.connected };
}
