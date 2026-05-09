import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type EphemeralRuntimeLifecycleTier = 'pending' | 'running' | 'completed' | 'expired' | 'failed';
export type SandboxRuntimeBoundaryTier = 'detached' | 'isolated' | 'bounded' | 'expiring' | 'expired';

export interface EphemeralSandboxRuntimeProfile {
  runtime_id: string;
  experiment_id: string;
  organization_id: string;
  lifecycle_state: EphemeralRuntimeLifecycleTier;
  boundary_tier: SandboxRuntimeBoundaryTier;
  started_at: string;
  expires_at: string;
  completed_at?: string;
  failed_at?: string;
  expired_at?: string;
  underlying_phase_25_sandbox_id?: string;
  heartbeats: Array<{
    tick_index: number;
    recorded_at: string;
    runtime_state: EphemeralRuntimeLifecycleTier;
    elapsed_ms: number;
    deterministic_hash: string;
  }>;
  boundary_proof: {
    topology_detachment_hash: string;
    runtime_isolation_hash: string;
    replay_determinism_hash: string;
    expiration_proof_hash: string;
    mutation_avoidance_proof_hash: string;
  };
  compression: any;
  expiration?: any;
  attribution_log: any[];
}

export function useLiveSandbox(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [runtimes, setRuntimes] = useState<EphemeralSandboxRuntimeProfile[]>([]);
  const [latest, setLatest] = useState<EphemeralSandboxRuntimeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['sandbox.runtime.started', 'sandbox.runtime.completed', 'sandbox.runtime.expired'],
  });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/live-sandbox/runtimes?organization_id=${encodeURIComponent(organization_id)}`);
      setRuntimes((r.data?.runtimes || []) as EphemeralSandboxRuntimeProfile[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load live sandbox runtimes');
    } finally { setLoading(false); }
  }, [organization_id]);

  const submit = useCallback(async (
    hypothetical_actions: any[],
    ttl_ms?: number,
  ) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/live-sandbox', {
      organization_id, hypothetical_actions, ttl_ms,
    });
    if (r.data?.permitted && r.data?.runtime) setLatest(r.data.runtime as EphemeralSandboxRuntimeProfile);
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  const expire = useCallback(async (runtime_id: string) => {
    const r = await portalApi.post(`/api/portal/project/live-sandbox/runtimes/${encodeURIComponent(runtime_id)}/expire`, {});
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { runtimes, latest, loading, error, refresh, submit, expire, streamConnected: stream.connected };
}
