import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type FederationDriftTier = 'stable' | 'monitoring' | 'fragmenting' | 'unstable';

export interface FederationDriftSignal {
  kind: string;
  score: number;
  explanation: string;
  observed_at: string;
}

export interface FederationDriftProfile {
  organization_id: string;
  tier: FederationDriftTier;
  signals: FederationDriftSignal[];
  drift_pressure_score: number;
  built_at: string;
}

export function useFederationDrift(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<FederationDriftProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['federation.drift.detected', 'archetype.reliability.evolved'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/federated-learning/drift');
      setProfile((r.data?.profile || null) as FederationDriftProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load federation drift profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, loading, error, refresh, streamConnected: stream.connected };
}
