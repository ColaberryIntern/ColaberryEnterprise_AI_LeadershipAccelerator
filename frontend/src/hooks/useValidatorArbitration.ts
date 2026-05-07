import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ValidatorVerdict {
  validator_type: string;
  confidence: number;
  recommendation: string;
  rationale: string;
  evidence: any;
  disagreement_flags: string[];
  propagation_concerns: string[];
  stabilization_recommendations: string[];
}

export interface ValidationArbitrationResult {
  mutation_id: string;
  verdicts: ValidatorVerdict[];
  consensus_recommendation: string;
  consensus_confidence: number;
  confidence_range: { min: number; max: number };
  minority_warning: string | null;
  arbitration_risk: number;
  escalation_required: boolean;
  built_at: string;
}

export interface ValidatorTrustEntry {
  validator_type: string;
  trust_score: number;
  agreement_rate: number;
  observations: number;
  drift_signal: 'stable' | 'over_triggering' | 'under_detecting' | 'inconsistent';
}

export interface ValidatorTrustProfile {
  project_id: string;
  entries: ValidatorTrustEntry[];
  disagreement_profiles: any[];
  built_at: string;
}

export function useValidatorArbitration() {
  const [verdicts, setVerdicts] = useState<ValidatorVerdict[]>([]);
  const [arbitration, setArbitration] = useState<ValidationArbitrationResult | null>(null);
  const [validatorTrust, setValidatorTrust] = useState<ValidatorTrustProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const arbitrate = useCallback(async (mutationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/causality/validators/${encodeURIComponent(mutationId)}`);
      setVerdicts((r.data?.verdicts || []) as ValidatorVerdict[]);
      setArbitration((r.data?.arbitration || null) as ValidationArbitrationResult | null);
      setValidatorTrust((r.data?.validator_trust || null) as ValidatorTrustProfile | null);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Validator arbitration failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { verdicts, arbitration, validatorTrust, loading, error, arbitrate };
}
