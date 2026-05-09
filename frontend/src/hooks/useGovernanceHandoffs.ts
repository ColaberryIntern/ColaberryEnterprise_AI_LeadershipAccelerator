import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type HandoffLifecycleState =
  | 'started' | 'acknowledged' | 'completed' | 'declined' | 'expired';

export interface GovernanceHandoffProfile {
  handoff_id: string;
  organization_id: string;
  from_operator_id: string;
  to_operator_id: string;
  lifecycle_state: HandoffLifecycleState;
  started_at: string;
  acknowledged_at?: string;
  completed_at?: string;
  declined_at?: string;
  expired_at?: string;
  context_summary: string;
  reason: string;
  source_session_id?: string;
  transfer_bundle_id?: string;
  authority_transfer_supported: false;
  engine_never_ranks: true;
  deterministic_hash: string;
}

export function useGovernanceHandoffs(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [handoffs, setHandoffs] = useState<GovernanceHandoffProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['governance.handoff.persisted', 'handoff.governance.verified'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/handoff/visibility?organization_id=${encodeURIComponent(organization_id)}`);
      setHandoffs((r.data?.recent_handoffs || []) as GovernanceHandoffProfile[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load handoffs');
    } finally { setLoading(false); }
  }, [organization_id]);

  const recordHandoff = useCallback(async (input: {
    to_operator_id: string; context_summary: string; reason: string;
    source_session_id?: string; transfer_bundle_id?: string;
  }) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/handoff/record', { organization_id, ...input });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  const acknowledgeHandoff = useCallback(async (handoff_id: string) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/handoff/acknowledge', { organization_id, handoff_id });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  const declineHandoff = useCallback(async (handoff_id: string) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/handoff/decline', { organization_id, handoff_id });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { handoffs, loading, error, refresh, recordHandoff, acknowledgeHandoff, declineHandoff, streamConnected: stream.connected };
}
