/**
 * useCognitiveIncidents — list + manage autonomous cognitive incidents.
 *
 * Pull-based from `GET /awareness/incidents` plus a refresh hook on
 * `incident.opened` / `incident.updated` / `incident.resolved` SSE events.
 */
import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface CognitiveIncident {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'error';
  state: 'open' | 'acknowledged' | 'resolved' | 'expired';
  affected_routes: string[];
  cognition_impact: number | null;
  recommended_actions: string[];
  opened_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  occurrence_count: number;
}

export interface UseCognitiveIncidentsOptions {
  state?: 'open' | 'acknowledged' | 'resolved' | 'expired';
  limit?: number;
}

export function useCognitiveIncidents(opts: UseCognitiveIncidentsOptions = {}) {
  const [incidents, setIncidents] = useState<CognitiveIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/awareness/incidents', {
        params: { state: opts.state, limit: opts.limit ?? 50 },
      });
      setIncidents((r.data?.incidents ?? []) as CognitiveIncident[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [opts.state, opts.limit]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Re-fetch whenever an incident-related stream event arrives.
  const { events } = useRealtimeAwareness({
    kinds: ['incident.opened', 'incident.updated', 'incident.resolved'],
    buffer_size: 10,
  });
  useEffect(() => {
    if (events.length > 0) void refresh();
  }, [events.length, refresh]);

  const acknowledge = useCallback(async (incidentId: string) => {
    await portalApi.put(`/api/portal/project/awareness/incidents/${encodeURIComponent(incidentId)}`, { state: 'acknowledged' });
    await refresh();
  }, [refresh]);

  const resolve = useCallback(async (incidentId: string) => {
    await portalApi.put(`/api/portal/project/awareness/incidents/${encodeURIComponent(incidentId)}`, { state: 'resolved' });
    await refresh();
  }, [refresh]);

  return { incidents, loading, error, refresh, acknowledge, resolve };
}
