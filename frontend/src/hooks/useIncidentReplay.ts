/**
 * useIncidentReplay — lists historical dispatch logs + lets the UI replay
 * the escalation chain for a specific incident.
 */
import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface DispatchLogEntry {
  id: string;
  incident_id: string;
  severity: 'info' | 'warning' | 'error';
  type: string;
  attempted_subscribers: string[];
  succeeded: number;
  failed: number;
  elapsed_ms: number;
  outcomes: any[];
  dispatched_at: string;
}

export function useIncidentReplay(opts: { limit?: number } = {}) {
  const [entries, setEntries] = useState<DispatchLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/cognitive/dispatch-log', { params: { limit: opts.limit ?? 50 } });
      setEntries((r.data?.entries ?? []) as DispatchLogEntry[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load dispatch log');
    } finally {
      setLoading(false);
    }
  }, [opts.limit]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { entries, loading, error, refresh };
}
