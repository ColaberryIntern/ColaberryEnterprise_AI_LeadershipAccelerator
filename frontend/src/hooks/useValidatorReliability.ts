import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ValidatorReliabilityMetrics {
  validator_role: string;
  observations: number;
  accuracy: number;
  false_positive_rate: number;
  false_negative_rate: number;
  rollback_prevention_rate: number;
  arbitration_agreement_quality: number;
  stabilization_success_rate: number;
}

export interface AdaptiveWeightAttribution {
  validator_role: string;
  prior_weight: number;
  adjusted_weight: number;
  adjustment_reason: string;
  reliability_inputs: { accuracy: number; observations: number };
  drift_inputs: { tier: string; confidence_inflation_pct: number };
  specialization_inputs: { strong_domains: string[]; weak_domains: string[] };
}

export function useValidatorReliability(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [reliability, setReliability] = useState<Record<string, ValidatorReliabilityMetrics> | null>(null);
  const [attributions, setAttributions] = useState<AdaptiveWeightAttribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['validator.reliability.shifted', 'arbitration.completed'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/adaptive/validator-reliability');
      setReliability((r.data?.reliability?.metrics_by_role || null));
      setAttributions((r.data?.adaptive_weights?.attributions || []) as AdaptiveWeightAttribution[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load validator reliability');
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

  return { reliability, attributions, loading, error, refresh, streamConnected: stream.connected };
}
