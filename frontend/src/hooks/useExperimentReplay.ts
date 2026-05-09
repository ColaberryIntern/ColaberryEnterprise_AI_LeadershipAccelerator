import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ExperimentReplayBundle {
  organization_id: string;
  sandboxes: any[];
  rollback_simulations: any[];
  propagation_previews: any[];
  rehearsals: any[];
  determinism_hashes: Array<{
    artifact_id: string;
    artifact_kind: 'sandbox' | 'rollback_simulation' | 'rehearsal';
    hash: string;
    recorded_at: string;
  }>;
  built_at: string;
}

export function useExperimentReplay(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [bundle, setBundle] = useState<ExperimentReplayBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['sandbox.completed', 'rollback.simulated', 'propagation.previewed', 'rehearsal.executed', 'experimentation.replayed'],
  });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/experimentation/replay?organization_id=${encodeURIComponent(organization_id)}`);
      setBundle((r.data || null) as ExperimentReplayBundle | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load experiment replay bundle');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { bundle, loading, error, refresh, streamConnected: stream.connected };
}
