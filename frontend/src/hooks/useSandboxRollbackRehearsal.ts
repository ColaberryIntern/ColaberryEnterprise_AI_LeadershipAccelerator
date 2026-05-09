import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface SandboxRollbackRehearsalReplay {
  rehearsal_id: string;
  runtime_id: string;
  experiment_id: string;
  organization_id: string;
  underlying_phase_25_simulation: any;
  preview_citation: any;
  determinism: any;
  built_at: string;
}

export function useSandboxRollbackRehearsal(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [rehearsals, setRehearsals] = useState<SandboxRollbackRehearsalReplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['sandbox.rollback.rehearsed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/live-sandbox/rollback-rehearsals?organization_id=${encodeURIComponent(organization_id)}`);
      setRehearsals((r.data?.rehearsals || []) as SandboxRollbackRehearsalReplay[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load sandbox rollback rehearsals');
    } finally { setLoading(false); }
  }, [organization_id]);

  const rehearse = useCallback(async (
    runtime_id: string,
    plan_id?: string,
    source_chain_ids?: string[],
  ) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/live-sandbox/rollback-rehearsal', {
      runtime_id, organization_id, plan_id, source_chain_ids,
    });
    await refresh();
    return r.data as SandboxRollbackRehearsalReplay;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { rehearsals, loading, error, refresh, rehearse, streamConnected: stream.connected };
}
