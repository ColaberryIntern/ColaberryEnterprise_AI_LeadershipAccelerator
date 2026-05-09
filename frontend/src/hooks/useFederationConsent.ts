import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type ArchetypeKind =
  | 'contradiction_archetype'
  | 'recovery_archetype'
  | 'routing_archetype'
  | 'governance_drift_signature'
  | 'stabilization_pattern';

export type FederationIsolationTier =
  | 'isolated' | 'local_only' | 'organizational' | 'restricted' | 'visibility_limited';

export interface FederationConsentProfile {
  project_id: string;
  organization_id: string | null;
  federation_enabled: boolean;
  share_permissions: Record<ArchetypeKind, boolean>;
  consume_permissions: Record<ArchetypeKind, boolean>;
  anonymization_level: 'standard' | 'strict';
  isolation_tier: FederationIsolationTier;
  updated_at: string;
  updated_by: string | null;
}

export function useFederationConsent(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [consent, setConsent] = useState<FederationConsentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['federation.enabled', 'federation.disabled', 'federation.visibility.updated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/federation/consent');
      setConsent((r.data?.consent || null) as FederationConsentProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load federation consent');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConsent = useCallback(async (updates: Partial<FederationConsentProfile> & { organization_id?: string | null }) => {
    const r = await portalApi.post('/api/portal/project/governance/federation/consent', updates);
    setConsent((r.data?.consent || null) as FederationConsentProfile | null);
    return r.data?.consent;
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { consent, loading, error, refresh, updateConsent, streamConnected: stream.connected };
}
