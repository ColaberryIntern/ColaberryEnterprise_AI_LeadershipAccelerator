import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type ArchetypeReliabilityTier =
  | 'emerging' | 'stable' | 'trusted' | 'cautionary' | 'degraded' | 'suppressed';

export interface FederatedLearningAttribution {
  archetype_signature: string;
  refinement_reason: string;
  observed_inputs: {
    observation_count: number;
    net_improvement_count: number;
    net_regression_count: number;
    anomaly_count: number;
    stabilization_consistency_score: number;
  };
  reliability_delta: number;
  stabilization_delta: number;
  anomaly_impact: number;
  confidence_shift: { from: number; to: number };
}

export interface ArchetypeReliabilityProfile {
  archetype_signature: string;
  current_tier: ArchetypeReliabilityTier;
  current_score: number;
  observation_count: number;
  net_improvement_count: number;
  net_regression_count: number;
  stabilization_consistency: number;
  anomaly_pressure: number;
  replay_reliability: number;
  organizational_usefulness: number;
  history: Array<{ recorded_at: string; tier: ArchetypeReliabilityTier; score: number; reason: string }>;
  last_attribution: FederatedLearningAttribution | null;
}

export function useArchetypeReliability(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profiles, setProfiles] = useState<ArchetypeReliabilityProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['archetype.reliability.evolved'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/federated-learning/reliability');
      setProfiles((r.data?.profiles || []) as ArchetypeReliabilityProfile[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load reliability profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  const evolveArchetype = useCallback(async (archetypeSignature: string) => {
    const r = await portalApi.post(`/api/portal/project/governance/federated-learning/reliability/${encodeURIComponent(archetypeSignature)}/evolve`);
    await refresh();
    return r.data?.profile as ArchetypeReliabilityProfile;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profiles, loading, error, refresh, evolveArchetype, streamConnected: stream.connected };
}
