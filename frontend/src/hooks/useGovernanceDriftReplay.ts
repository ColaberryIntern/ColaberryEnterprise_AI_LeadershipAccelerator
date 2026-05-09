import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface GovernanceDriftEntry {
  index: number;
  kind: string;
  observed_at: string;
  summary: string;
  severity: 'info' | 'warning' | 'error';
  delta_from_baseline: number;
  source_audit_kind: string;
}

export interface GovernanceDriftReplay {
  project_id: string;
  entries: GovernanceDriftEntry[];
  window_start: string;
  window_end: string;
  worst_kind: string | null;
  truncated: boolean;
  built_at: string;
}

export function useGovernanceDriftReplay(opts?: { autoFetch?: boolean; window_hours?: number; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const [replay, setReplay] = useState<GovernanceDriftReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['governance.drift.detected', 'governance.calibration.approved', 'governance.calibration.rejected', 'specialization.routing.updated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (opts?.window_hours) params.set('window_hours', String(opts.window_hours));
      if (opts?.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const r = await portalApi.get(`/api/portal/project/governance/federation/governance-drift${qs}`);
      setReplay((r.data?.replay || null) as GovernanceDriftReplay | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load governance drift replay');
    } finally {
      setLoading(false);
    }
  }, [opts?.window_hours, opts?.limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { replay, loading, error, refresh, streamConnected: stream.connected };
}
