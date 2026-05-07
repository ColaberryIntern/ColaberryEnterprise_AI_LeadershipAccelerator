import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RouteBehavioral {
  route: string;
  session_count: number;
  total_events: number;
  rage_clicks: number;
  hesitations: number;
  nav_loops: number;
  form_retries: number;
  form_abandons: number;
  dead_end_exits: number;
  scroll_abandons: number;
  abandonment_rate: number;
  friction_pressure: number;
}

export interface UserFlowResponse {
  edges: { from: string; to: string; count: number }[];
  drop_off_points: { route: string; count: number; ratio: number }[];
  loop_routes: { route: string; loop_count: number }[];
  completion_rate: number;
  friction_zones: { route: string; friction_events: number }[];
}

export interface BehavioralFlowResponse {
  behavioral: {
    per_route: RouteBehavioral[];
    worst_route: string | null;
    project_friction_pressure: number;
  };
  user_flow: UserFlowResponse;
}

export function useBehavioralTelemetry(opts: { autoFetch?: boolean; pollIntervalMs?: number } = {}) {
  const [data, setData] = useState<BehavioralFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/behavioral/flow');
      setData(r.data as BehavioralFlowResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load behavioral telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  useEffect(() => {
    if (!opts.pollIntervalMs || opts.pollIntervalMs <= 0) return;
    const id = window.setInterval(() => { void refresh(); }, opts.pollIntervalMs);
    return () => window.clearInterval(id);
  }, [opts.pollIntervalMs, refresh]);

  return { data, loading, error, refresh };
}

/** Helper: emit a single behavioral event. Fire-and-forget. */
export async function recordBehavioralEvent(event: {
  route: string;
  kind: string;
  session_id: string;
  target_selector?: string;
  target_x?: number;
  target_y?: number;
  duration_ms?: number;
  metadata?: any;
}) {
  try {
    await portalApi.post('/api/portal/project/behavioral/event', event);
  } catch { /* silent */ }
}
