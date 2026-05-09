import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RoutingAttribution {
  validator_role: string;
  target_intent: string | null;
  applied_bias: number;
  reason: string;
  inputs: {
    domain_accuracy: number;
    domain_observations: number;
    validator_drift_tier: string;
    is_strong_in_domain: boolean;
    is_weak_in_domain: boolean;
  };
  operator_override?: { fixed_bias: number; set_by: string; set_at: string };
}

export interface SpecializationRoutingDecision {
  project_id: string;
  target_intent: string;
  attributions: RoutingAttribution[];
  weight_overrides: Record<string, number>;
  stability_tier: 'stable' | 'adaptive' | 'volatile' | 'suppressed' | 'overridden';
  built_at: string;
}

export function useSpecializationRouting() {
  const [decision, setDecision] = useState<SpecializationRoutingDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDecision = useCallback(async (targetIntent: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/operator/specialization-routing?target_intent=${encodeURIComponent(targetIntent)}`);
      const d = (r.data?.decision || null) as SpecializationRoutingDecision | null;
      setDecision(d);
      return d;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load routing decision');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { decision, loading, error, fetchDecision };
}
