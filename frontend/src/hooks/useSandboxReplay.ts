import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface SandboxReplayBundle {
  organization_id: string;
  runtimes: any[];
  rollback_rehearsals: any[];
  preview_narratives: any[];
  determinism_bounds: Array<{
    runtime_id: string;
    replay_hash: string;
    replayable: boolean;
    deterministic: boolean;
    runtime_expired: boolean;
    bounded_reason?: string;
  }>;
  built_at: string;
}

export function useSandboxReplay(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [bundle, setBundle] = useState<SandboxReplayBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['sandbox.replay.generated', 'sandbox.runtime.completed', 'sandbox.runtime.expired'],
  });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/live-sandbox/replay?organization_id=${encodeURIComponent(organization_id)}`);
      setBundle((r.data || null) as SandboxReplayBundle | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load sandbox replay bundle');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { bundle, loading, error, refresh, streamConnected: stream.connected };
}
