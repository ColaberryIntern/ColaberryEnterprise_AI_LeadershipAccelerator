import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ValidatorSpecializationEntry {
  validator_role: string;
  domain: string;
  observations: number;
  accuracy_in_domain: number;
  relative_strength: number;
  is_strong: boolean;
  is_weak: boolean;
  note: string;
}

export interface ValidatorSpecializationMap {
  project_id: string;
  entries: ValidatorSpecializationEntry[];
  strongest_per_domain: Record<string, string>;
  weakest_per_domain: Record<string, string>;
  built_at: string;
}

export function useValidatorSpecialization(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [map, setMap] = useState<ValidatorSpecializationMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['validator.specialization.detected', 'arbitration.completed'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/adaptive/specialization');
      setMap((r.data?.specialization || null) as ValidatorSpecializationMap | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load specialization map');
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

  return { map, loading, error, refresh, streamConnected: stream.connected };
}
