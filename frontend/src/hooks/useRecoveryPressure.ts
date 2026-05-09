import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type RecoveryPressureTier =
  | 'low' | 'moderate' | 'elevated' | 'critical' | 'saturated';

export interface RecoveryPressureProfile {
  organization_id: string;
  tier: RecoveryPressureTier;
  score: number;
  observed_counters: {
    rollback_replay_count_24h: number;
    continuity_replay_count_24h: number;
    topology_recovery_plans_24h: number;
    distributed_recovery_plans_24h: number;
    partition_fragmentation_active: number;
    quota_exhaustions_24h: number;
    broker_isolations_active: number;
    execution_worker_failures_24h: number;
  };
  sample_hash: string;
  recorded_at: string;
}

export interface RecoveryPressureContainmentAttribution {
  partition_id: string;
  pressure_tier: RecoveryPressureTier;
  topology_contained: boolean;
  rollback_coverage_verified: boolean;
  replay_integrity_verified: boolean;
  drivers: string[];
  deterministic_hash: string;
  recorded_at: string;
}

export function useRecoveryPressure(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<RecoveryPressureProfile | null>(null);
  const [containment, setContainment] = useState<RecoveryPressureContainmentAttribution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['stabilization.pressure.detected'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/stabilization/pressure?organization_id=${encodeURIComponent(organization_id)}`);
      setProfile(r.data?.profile as RecoveryPressureProfile);
      setContainment(r.data?.containment as RecoveryPressureContainmentAttribution);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load recovery pressure');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { profile, containment, loading, error, refresh, streamConnected: stream.connected };
}
