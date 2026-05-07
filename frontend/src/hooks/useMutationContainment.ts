import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ContainmentWorkflow {
  workflow_id: string;
  trigger: string;
  started_at: string;
  steps_completed: string[];
}

export interface ContainmentSnapshot {
  project_id: string;
  contained_classes: string[];
  frozen_classes: string[];
  active_workflows: ContainmentWorkflow[];
}

export function useMutationContainment(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [snapshot, setSnapshot] = useState<ContainmentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['mutation.containment.activated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/mutation/containment');
      setSnapshot((r.data?.containment || null) as ContainmentSnapshot | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load containment snapshot');
    } finally {
      setLoading(false);
    }
  }, []);

  const freezeIntent = useCallback(async (intentClass: string) => {
    const r = await portalApi.post(`/api/admin/governance/mutation/freeze-class/${encodeURIComponent(intentClass)}`);
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { snapshot, loading, error, refresh, freezeIntent, streamConnected: stream.connected };
}
