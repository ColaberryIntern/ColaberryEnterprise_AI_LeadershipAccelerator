import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type MemoryDensityTier =
  | 'sparse' | 'partial' | 'developed' | 'dense' | 'compressed';

export interface OperatorContinuityProfile {
  organization_id: string;
  total_sessions: number;
  active_sessions: number;
  closed_sessions: number;
  total_events: number;
  events_by_kind: Record<string, number>;
  distinct_operator_count: number;
  distinct_operator_ids: string[];
  engine_never_profiles: true;
  density_tier: MemoryDensityTier;
  profile_hash: string;
  built_at: string;
}

export function useGovernanceMemory(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<OperatorContinuityProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['governance.memory.persisted', 'governance.memory.verified'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/memory/continuity?organization_id=${encodeURIComponent(organization_id)}`);
      setProfile(r.data as OperatorContinuityProfile);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load continuity profile');
    } finally { setLoading(false); }
  }, [organization_id]);

  const openSession = useCallback(async (note?: string) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/memory/session/open', { organization_id, note });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  const recordEvent = useCallback(async (
    session_id: string, event_kind: string,
    subject_kind?: string, subject_id?: string, note?: string,
  ) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/memory/session/event', {
      organization_id, session_id, event_kind, subject_kind, subject_id, note,
    });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  const closeSession = useCallback(async (session_id: string, note?: string) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/memory/session/close', {
      organization_id, session_id, note,
    });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return {
    profile, loading, error, refresh,
    openSession, recordEvent, closeSession,
    streamConnected: stream.connected,
  };
}
