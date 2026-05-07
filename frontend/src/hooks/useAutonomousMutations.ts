import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface MutationEnvelopeRow {
  id: string;
  project_id: string;
  kind: string;
  subject_id: string | null;
  payload: any;
  operator_id: string | null;
  recorded_at: string;
}

const KINDS = [
  'mutation.execution.started',
  'mutation.execution.verified',
  'mutation.execution.failed',
  'mutation.rollback.started',
  'mutation.rollback.completed',
  'mutation.containment.activated',
  'mutation.empirical.validation',
  'mutation.trust.changed',
];

export function useAutonomousMutations(opts?: { autoFetch?: boolean; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const limit = opts?.limit ?? 50;
  const [envelopes, setEnvelopes] = useState<MutationEnvelopeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: KINDS });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/mutation/envelopes?limit=${limit}`);
      setEnvelopes((r.data?.envelopes || []) as MutationEnvelopeRow[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load mutations');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const rollback = useCallback(async (mutationId: string, mode: string = 'full', partial_count?: number, reason?: string) => {
    const r = await portalApi.post(`/api/portal/project/governance/mutation/${mutationId}/rollback`, { mode, partial_count, reason });
    await refresh();
    return r.data?.rollback;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { envelopes, loading, error, refresh, rollback, streamConnected: stream.connected };
}
