import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { OperationalNarrative } from './useOperationalNarratives';

export interface ContinuityNarrative {
  narrative: OperationalNarrative;
  interrupted_worker_count: number;
  stalled_worker_count: number;
  restored_worker_count: number;
  built_at: string;
}

export function useContinuityStories(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [continuity, setContinuity] = useState<ContinuityNarrative | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['continuity.restored', 'worker.interrupted', 'execution.replayed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/cognitive-compression/continuity-narrative?organization_id=${encodeURIComponent(organization_id)}`);
      setContinuity((r.data || null) as ContinuityNarrative | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load continuity narrative');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { continuity, loading, error, refresh, streamConnected: stream.connected };
}
