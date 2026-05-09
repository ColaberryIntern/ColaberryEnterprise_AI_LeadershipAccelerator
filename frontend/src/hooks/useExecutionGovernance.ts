import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type ExecutionGovernanceDecision = 'permitted' | 'rejected' | 'isolated' | 'flagged';

export interface ExecutionGovernanceAttribution {
  worker_id: string;
  kind: string;
  organization_id: string;
  decision: ExecutionGovernanceDecision;
  reason: string;
  supervisor_rule_violated?: string;
  recorded_at: string;
}

export interface ExecutionGovernanceProfile {
  organization_id: string;
  recent_decisions: ExecutionGovernanceAttribution[];
  decision_counts: { permitted: number; rejected: number; isolated: number; flagged: number };
  violation_counts_by_rule: Record<string, number>;
  built_at: string;
}

export function useExecutionGovernance(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<ExecutionGovernanceProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['worker.started', 'execution.isolated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/execution-substrate/governance?organization_id=${encodeURIComponent(organization_id)}`);
      setProfile((r.data || null) as ExecutionGovernanceProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load execution governance');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, loading, error, refresh, streamConnected: stream.connected };
}
