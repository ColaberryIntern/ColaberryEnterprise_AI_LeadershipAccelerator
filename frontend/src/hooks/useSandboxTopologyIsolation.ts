import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { EphemeralSandboxRuntimeProfile } from './useLiveSandbox';

export interface SandboxTopologyIsolationProfile {
  runtime_id: string;
  organization_id: string;
  detachment_proofs: {
    production_topology_detached: true;
    federation_topology_detached: true;
    distributed_runtime_detached: true;
    cross_org_attempts_blocked: true;
  };
  snapshot_lineage: {
    phase_22_graph_snapshot_hash: string;
    phase_23_substrate_snapshot_hash: string;
    snapshot_taken_at: string;
  };
  verification_hash: string;
  built_at: string;
}

/** Reads topology isolation profile via the runtime endpoint (which
 *  carries the runtime profile + boundary proof chain). The dedicated
 *  topology isolation profile is regenerated as part of the visibility
 *  composite; this hook surfaces the proof chain for a single runtime. */
export function useSandboxTopologyIsolation(organization_id: string | null, runtime_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [runtime, setRuntime] = useState<EphemeralSandboxRuntimeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['sandbox.isolation.verified', 'sandbox.runtime.started'] });

  const refresh = useCallback(async () => {
    if (!organization_id || !runtime_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/live-sandbox/runtimes/${encodeURIComponent(runtime_id)}`);
      setRuntime((r.data || null) as EphemeralSandboxRuntimeProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load topology isolation profile');
    } finally { setLoading(false); }
  }, [organization_id, runtime_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { runtime, boundary_proof: runtime?.boundary_proof ?? null, loading, error, refresh, streamConnected: stream.connected };
}
