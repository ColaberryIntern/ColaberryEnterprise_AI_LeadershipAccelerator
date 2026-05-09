import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface FederatedEffectivenessProfile {
  archetype_signature: string;
  observed_stabilization_delta: number;
  propagation_reduction: number;
  recovery_success_rate: number;
  anomaly_frequency: number;
  organizational_consistency: number;
  confidence_evolution: Array<{ recorded_at: string; value: number }>;
  built_at: string;
}

export function useFederatedEffectiveness(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profiles, setProfiles] = useState<FederatedEffectivenessProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['archetype.effectiveness.updated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/federated-learning/effectiveness');
      setProfiles((r.data?.profiles || []) as FederatedEffectivenessProfile[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load effectiveness profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  const recordOutcome = useCallback(async (input: {
    archetype_signature: string;
    signal: string;
    stabilization_delta: number;
    propagation_reduction: number;
    recovery_succeeded: boolean;
    anomaly_observed: boolean;
  }) => {
    const r = await portalApi.post('/api/portal/project/governance/federated-learning/effectiveness-observation', input);
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profiles, loading, error, refresh, recordOutcome, streamConnected: stream.connected };
}
