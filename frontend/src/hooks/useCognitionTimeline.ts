/**
 * useCognitionTimeline — Phase 31 wrapper around the timeline surface
 * with explicit window controls + filtering.
 */
import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';
import type { CognitionTimelineSurface } from './useStabilizationTimeline';

export type { CognitionTimelineSurface } from './useStabilizationTimeline';

export function useCognitionTimeline(organization_id: string | null) {
  const [surface, setSurface] = useState<CognitionTimelineSurface | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (filter?: {
    window_start?: string; window_end?: string;
    operator_id_filter?: string; session_id_filter?: string;
    limit?: number;
  }) => {
    if (!organization_id) return null;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ organization_id });
      if (filter?.window_start) params.set('window_start', filter.window_start);
      if (filter?.window_end) params.set('window_end', filter.window_end);
      if (filter?.operator_id_filter) params.set('operator_id_filter', filter.operator_id_filter);
      if (filter?.session_id_filter) params.set('session_id_filter', filter.session_id_filter);
      if (filter?.limit !== undefined) params.set('limit', String(filter.limit));
      const r = await portalApi.get(`/api/portal/project/memory/timeline?${params.toString()}`);
      setSurface(r.data as CognitionTimelineSurface);
      return r.data as CognitionTimelineSurface;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build cognition timeline');
      return null;
    } finally { setLoading(false); }
  }, [organization_id]);

  return { surface, loading, error, build };
}
