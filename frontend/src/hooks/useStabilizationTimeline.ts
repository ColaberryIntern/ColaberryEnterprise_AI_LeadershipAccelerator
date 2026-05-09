import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface CognitionTimelinePoint {
  recorded_at: string;
  event_kind: string;
  subject_kind?: string;
  subject_id?: string;
  operator_id: string;
  session_id: string;
  deterministic_hash: string;
}

export interface CognitionTimelineSurface {
  organization_id: string;
  points: CognitionTimelinePoint[];
  window_start?: string;
  window_end?: string;
  read_only: true;
  engine_never_ranks: true;
  timeline_surface_hash: string;
  built_at: string;
}

export function useStabilizationTimeline(organization_id: string | null, opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const limit = opts?.limit ?? 50;
  const [surface, setSurface] = useState<CognitionTimelineSurface | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['stabilization.timeline.updated', 'cognition.timeline.updated'] });

  const refresh = useCallback(async (filter?: {
    window_start?: string; window_end?: string;
    operator_id_filter?: string; session_id_filter?: string;
  }) => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ organization_id, limit: String(limit) });
      if (filter?.window_start) params.set('window_start', filter.window_start);
      if (filter?.window_end) params.set('window_end', filter.window_end);
      if (filter?.operator_id_filter) params.set('operator_id_filter', filter.operator_id_filter);
      if (filter?.session_id_filter) params.set('session_id_filter', filter.session_id_filter);
      const r = await portalApi.get(`/api/portal/project/memory/timeline?${params.toString()}`);
      setSurface(r.data as CognitionTimelineSurface);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load timeline');
    } finally { setLoading(false); }
  }, [organization_id, limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { surface, loading, error, refresh, streamConnected: stream.connected };
}
