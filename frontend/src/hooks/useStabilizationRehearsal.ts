import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { HypotheticalAction } from './useExecutionSandbox';

export interface StabilizationRehearsalReplay {
  rehearsal_id: string;
  experiment_id: string;
  organization_id: string;
  steps: Array<{
    step_index: number;
    action: HypotheticalAction;
    projected_deltas: any[];
    projected_continuity_status: 'continuous' | 'degraded' | 'broken' | 'restored';
    explanation: string;
  }>;
  projected_final_status: 'continuous' | 'degraded' | 'broken' | 'restored';
  determinism: any;
  bounded_reason?: string;
  built_at: string;
}

export function useStabilizationRehearsal(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [rehearsals, setRehearsals] = useState<StabilizationRehearsalReplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['rehearsal.executed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/experimentation/rehearsals?organization_id=${encodeURIComponent(organization_id)}`);
      setRehearsals((r.data?.rehearsals || []) as StabilizationRehearsalReplay[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load rehearsals');
    } finally { setLoading(false); }
  }, [organization_id]);

  const rehearse = useCallback(async (chain: HypotheticalAction[]) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/experimentation/rehearsal', { organization_id, chain });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { rehearsals, loading, error, refresh, rehearse, streamConnected: stream.connected };
}
