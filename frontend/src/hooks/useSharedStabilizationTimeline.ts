import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface SharedStabilizationTimelinePoint {
  recorded_at: string;
  event_kind: string;
  operator_id: string;
  session_id: string;
  handoff_id?: string;
  subject_kind?: string;
  subject_id?: string;
  deterministic_hash: string;
}

export interface SharedStabilizationTimeline {
  organization_id: string;
  points: SharedStabilizationTimelinePoint[];
  handoff_count: number;
  read_only: true;
  engine_never_ranks: true;
  derived_from_phase_31: true;
  window_start?: string;
  window_end?: string;
  timeline_hash: string;
  built_at: string;
}

export function useSharedStabilizationTimeline(organization_id: string | null, opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const limit = opts?.limit ?? 50;
  const [timeline, setTimeline] = useState<SharedStabilizationTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['shared.timeline.updated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/handoff/timeline?organization_id=${encodeURIComponent(organization_id)}&limit=${limit}`);
      setTimeline(r.data as SharedStabilizationTimeline);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load shared timeline');
    } finally { setLoading(false); }
  }, [organization_id, limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { timeline, loading, error, refresh, streamConnected: stream.connected };
}
