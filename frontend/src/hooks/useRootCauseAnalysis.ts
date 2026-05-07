import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface CausalConfidenceAttribution {
  node_id: string;
  root_cause_confidence: number;
  supporting_evidence: string[];
  propagation_strength: number;
  contradiction_density: number;
  validator_agreement: number;
  lineage_depth_penalty: number;
}

export interface RootCauseAnalysis {
  project_id: string;
  target_mutation_id: string | null;
  identified_roots: Array<{
    node: any;
    attribution: CausalConfidenceAttribution;
    ancestry: any[];
    descendants_count: number;
    stabilization_recommendation: string;
    rollback_targeting_suggestion: string;
  }>;
  built_at: string;
}

export function useRootCauseAnalysis() {
  const [analysis, setAnalysis] = useState<RootCauseAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (mutationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/causality/root-cause/${encodeURIComponent(mutationId)}`);
      const a = (r.data?.analysis || null) as RootCauseAnalysis | null;
      setAnalysis(a);
      return a;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Root-cause analysis failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { analysis, loading, error, analyze };
}
