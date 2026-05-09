import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type ExecutionLifecycleTier =
  | 'pending' | 'running' | 'completed' | 'failed' | 'interrupted' | 'rolled_back';

export interface ExecutionWorkerEnvelope {
  worker_id: string;
  kind: string;
  organization_id: string;
  project_id?: string;
  started_at: string;
  scope_summary: string;
  bounded_envelope: {
    max_duration_ms: number;
    max_attempts: number;
    allowed_namespaces: string[];
    parent_depth_limit: number;
  };
  parent_worker_id?: string;
  parent_depth: number;
  lifecycle_state: ExecutionLifecycleTier;
  attribution: Array<{ recorded_at: string; transition: ExecutionLifecycleTier; note?: string }>;
  last_heartbeat_at?: string;
  completed_at?: string;
  failed_at?: string;
  interrupted_at?: string;
  rolled_back_at?: string;
  failure_reason?: string;
}

export interface ExecutionVisibility {
  organization_id: string;
  active_workers: ExecutionWorkerEnvelope[];
  recent_completed: ExecutionWorkerEnvelope[];
  recent_failed: ExecutionWorkerEnvelope[];
  recent_interrupted: ExecutionWorkerEnvelope[];
  topology: any;
  continuity: any;
  isolation: any;
  governance: any;
  built_at: string;
}

export function useExecutionRuntime(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [visibility, setVisibility] = useState<ExecutionVisibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['worker.started', 'worker.interrupted', 'worker.recovered', 'execution.isolated', 'execution.degraded', 'execution.replayed', 'rollback.orchestrated'],
  });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/execution-substrate/visibility?organization_id=${encodeURIComponent(organization_id)}`);
      setVisibility((r.data || null) as ExecutionVisibility | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load execution visibility');
    } finally { setLoading(false); }
  }, [organization_id]);

  const sweepStalled = useCallback(async () => {
    const r = await portalApi.post('/api/portal/project/execution-substrate/sweep-stalled', {});
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { visibility, loading, error, refresh, sweepStalled, streamConnected: stream.connected };
}
