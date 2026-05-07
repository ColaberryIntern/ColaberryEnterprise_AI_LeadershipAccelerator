import { useCallback, useEffect, useMemo, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface SelfHealEntry {
  id: string;
  project_id: string;
  kind: string;
  subject_id: string | null;
  payload: any;
  operator_id: string | null;
  recorded_at: string;
}

const KINDS = ['autonomy.self_heal.triggered'];

/**
 * Phase 14: recent self-heal audit events. Uses the existing replay
 * endpoint then filters client-side to the self-heal kind, since the
 * `/handoffs` endpoint covers the execution kinds and replay covers
 * the broader autonomy_% kinds.
 */
export function useSelfHealingActivity(opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const limit = opts?.limit ?? 50;
  const [entries, setEntries] = useState<SelfHealEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: KINDS });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/autonomy/replay?limit=${limit}`);
      const audits = (r.data?.audits || []) as SelfHealEntry[];
      setEntries(audits.filter(a => a.kind === 'autonomy_self_heal_triggered'));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load self-heal activity');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  const summary = useMemo(() => {
    const byAction: Record<string, number> = {};
    for (const e of entries) {
      const action = (e.payload || {}).action || 'unknown';
      byAction[action] = (byAction[action] || 0) + 1;
    }
    return { total: entries.length, by_action: byAction };
  }, [entries]);

  return { entries, summary, loading, error, refresh, streamConnected: stream.connected };
}
