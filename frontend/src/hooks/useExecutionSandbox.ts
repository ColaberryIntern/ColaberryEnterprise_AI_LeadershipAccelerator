import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type HypotheticalActionKind =
  | 'lift_broker_isolation' | 'add_broker_isolation' | 'lift_execution_isolation'
  | 'execute_topology_recovery_step' | 'force_continuity_replay' | 'rollback_worker_lifecycle';

export interface HypotheticalAction {
  action_id: string;
  kind: HypotheticalActionKind;
  target_namespace?: string;
  target_worker_id?: string;
  target_kind?: string;
  notes?: string;
}

export interface ExecutionSandboxProfile {
  sandbox_id: string;
  experiment_id: string;
  organization_id: string;
  tier: 'observed_state' | 'single_step_projection' | 'chained_rehearsal' | 'forecast_horizon';
  hypothetical_actions: HypotheticalAction[];
  baseline: any[];
  projected_deltas: Array<{
    namespace: string;
    projected_change_kind: string;
    derived_from_action: string;
    dependency_depth: number;
    projected_impact_score: number;
  }>;
  isolation_guarantee: {
    sandbox_id: string;
    runtime_writes_blocked: true;
    broker_writes_blocked: true;
    federation_writes_blocked: true;
    topology_writes_blocked: true;
    execution_substrate_writes_blocked: true;
    expires_at: string;
    isolation_proof_hash: string;
  };
  determinism: {
    sandbox_id: string;
    baseline_state_hash: string;
    projected_state_hash: string;
    hypothetical_action_hash: string;
    replayable: boolean;
    deterministic: boolean;
    recorded_at: string;
  };
  boundary: any;
  time_elapsed_ms: number;
  bounded_reason?: string;
  built_at: string;
}

export function useExecutionSandbox(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [sandboxes, setSandboxes] = useState<ExecutionSandboxProfile[]>([]);
  const [latest, setLatest] = useState<ExecutionSandboxProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['sandbox.started', 'sandbox.completed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/experimentation/sandboxes?organization_id=${encodeURIComponent(organization_id)}`);
      setSandboxes((r.data?.sandboxes || []) as ExecutionSandboxProfile[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load sandboxes');
    } finally { setLoading(false); }
  }, [organization_id]);

  const submit = useCallback(async (
    hypothetical_actions: HypotheticalAction[],
    tier?: ExecutionSandboxProfile['tier'],
  ) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/experimentation/sandbox', {
      organization_id, hypothetical_actions, tier,
    });
    if (r.data?.permitted && r.data?.sandbox) setLatest(r.data.sandbox as ExecutionSandboxProfile);
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { sandboxes, latest, loading, error, refresh, submit, streamConnected: stream.connected };
}
