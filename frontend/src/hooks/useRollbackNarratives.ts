import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { OperationalNarrative } from './useOperationalNarratives';

export interface RollbackNarrativeReplay {
  narrative: OperationalNarrative;
  rollback_chain_ids: string[];
  source_phase_breakdown: Record<string, number>;
  outcome_summary: 'all_full' | 'partial' | 'mixed' | 'failed' | 'unknown';
  built_at: string;
}

export function useRollbackNarratives(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [replay, setReplay] = useState<RollbackNarrativeReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['rollback.explained', 'rollback.orchestrated'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/cognitive-compression/rollback-narrative?organization_id=${encodeURIComponent(organization_id)}`);
      setReplay((r.data || null) as RollbackNarrativeReplay | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load rollback narrative');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { replay, loading, error, refresh, streamConnected: stream.connected };
}
