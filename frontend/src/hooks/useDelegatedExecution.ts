import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type DelegatedExecutionLifecycleTier =
  | 'issued' | 'verified' | 'executing' | 'completed' | 'failed' | 'expired';
export type DelegatableActionKind =
  | 'lift_broker_isolation'
  | 'lift_execution_isolation'
  | 'force_continuity_replay'
  | 'execute_topology_recovery_step'
  | 'execute_distributed_recovery_step';

export interface DelegatedAuthorityEnvelope {
  envelope_id: string;
  operator_id: string;
  action_kind: DelegatableActionKind;
  target_namespace?: string;
  target_kind?: string;
  target_organization_id: string;
  target_plan_id?: string;
  target_step_id?: string;
  issued_at: string;
  expires_at: string;
  consumed_at?: string;
  revoked_at?: string;
  rollback_chain_required: true;
  rollback_chain_id: string;
  single_use: true;
  max_action_count: 1;
  topology_containment_proof: string;
  deterministic_hash: string;
  lifecycle_state: DelegatedExecutionLifecycleTier;
}

export interface DelegatedExecutionResult {
  envelope_id: string;
  outcome: 'success' | 'refused' | 'timed_out' | 'expired' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  invariant_failures: ReadonlyArray<string>;
  trace?: any;
  finality_proof?: any;
}

export function useDelegatedExecution(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [traces, setTraces] = useState<any[]>([]);
  const [lastResult, setLastResult] = useState<DelegatedExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['delegation.executed', 'delegation.rejected', 'delegation.expired'],
  });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/delegated-execution/traces?organization_id=${encodeURIComponent(organization_id)}`);
      setTraces(r.data?.traces || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load delegated execution traces');
    } finally { setLoading(false); }
  }, [organization_id]);

  const execute = useCallback(async (envelope_id: string, timeout_ms?: number) => {
    const r = await portalApi.post('/api/portal/project/delegated-execution/execute', {
      envelope_id, timeout_ms,
    });
    setLastResult(r.data as DelegatedExecutionResult);
    await refresh();
    return r.data as DelegatedExecutionResult;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { traces, lastResult, loading, error, refresh, execute, streamConnected: stream.connected };
}
