import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { DelegatedAuthorityEnvelope, DelegatableActionKind } from './useDelegatedExecution';

export interface IssueEnvelopeRequest {
  action_kind: DelegatableActionKind;
  target_namespace?: string;
  target_kind?: string;
  target_organization_id: string;
  target_plan_id?: string;
  target_step_id?: string;
  rollback_chain_id: string;
  topology_containment_proof: string;
  ttl_ms?: number;
}

export function useAuthorityEnvelope(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [envelopes, setEnvelopes] = useState<DelegatedAuthorityEnvelope[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({
    kinds: ['delegation.issued', 'delegation.executed', 'delegation.expired', 'delegation.rejected'],
  });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/delegated-execution/envelopes?organization_id=${encodeURIComponent(organization_id)}`);
      setEnvelopes((r.data?.envelopes || []) as DelegatedAuthorityEnvelope[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load envelopes');
    } finally { setLoading(false); }
  }, [organization_id]);

  const issue = useCallback(async (req: IssueEnvelopeRequest) => {
    const r = await portalApi.post('/api/portal/project/delegated-execution/envelope', req);
    await refresh();
    return r.data?.envelope as DelegatedAuthorityEnvelope | undefined;
  }, [refresh]);

  const revoke = useCallback(async (envelope_id: string) => {
    const r = await portalApi.post(`/api/portal/project/delegated-execution/envelope/${encodeURIComponent(envelope_id)}/revoke`, {});
    await refresh();
    return r.data as DelegatedAuthorityEnvelope;
  }, [refresh]);

  const get = useCallback(async (envelope_id: string) => {
    const r = await portalApi.get(`/api/portal/project/delegated-execution/envelope/${encodeURIComponent(envelope_id)}`);
    return r.data as DelegatedAuthorityEnvelope;
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { envelopes, loading, error, refresh, issue, revoke, get, streamConnected: stream.connected };
}
