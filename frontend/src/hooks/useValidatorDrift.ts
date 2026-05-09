import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type ValidatorStabilityTier = 'stable' | 'cautionary' | 'drifting' | 'unstable' | 'suppressed';

export interface ValidatorDriftSignal {
  validator_role: string;
  tier: ValidatorStabilityTier;
  signals: string[];
  confidence_inflation_pct: number;
  over_trigger_pct: number;
  under_detect_pct: number;
  disagreement_drift_pct: number;
  recommended_action: 'monitor' | 'recalibrate' | 'suppress' | 'noop';
}

export interface ValidatorDriftProfile {
  project_id: string;
  signals: ValidatorDriftSignal[];
  worst_tier: ValidatorStabilityTier;
  built_at: string;
}

export function useValidatorDrift(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [profile, setProfile] = useState<ValidatorDriftProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['validator.drift.detected', 'validator.reliability.shifted'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/adaptive/drift');
      setProfile((r.data?.drift || null) as ValidatorDriftProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load drift profile');
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
