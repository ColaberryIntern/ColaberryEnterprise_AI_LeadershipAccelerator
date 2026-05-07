import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface UXImpactPrediction {
  workflow_completion_delta: number;
  onboarding_delta: number;
  friction_delta: number;
  accessibility_delta: number;
  adoption_delta: number;
  basis: string[];
}

export function useUXPredictions() {
  const [prediction, setPrediction] = useState<UXImpactPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const predict = useCallback(async (input: {
    suggestion: { kind: string; title: string; expected_ux_impact: number };
    route?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/vision/predict-impact', input);
      setPrediction(r.data?.prediction ?? null);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to predict UX impact');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { prediction, loading, error, predict };
}
