import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface CalibrationImpactDelta {
  metric: 'stabilization_confidence' | 'contradiction_count' | 'routing_volatility' | 'forecast_within_bounds_rate' | 'recovery_success_rate';
  before_value: number;
  after_value: number;
  delta: number;
  direction: 'improved' | 'unchanged' | 'degraded';
  notes: string[];
}

export interface CalibrationImpactReplay {
  project_id: string;
  proposal_id: string;
  approval_timestamp: string;
  window_hours: number;
  deltas: CalibrationImpactDelta[];
  overall_assessment: 'net_improvement' | 'net_neutral' | 'net_regression';
  built_at: string;
}

export function useCalibrationImpactReplay() {
  const [replay, setReplay] = useState<CalibrationImpactReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchImpact = useCallback(async (proposalId: string, windowHours?: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = typeof windowHours === 'number' ? `?window_hours=${windowHours}` : '';
      const r = await portalApi.get(`/api/portal/project/governance/federation/calibration-impact/${encodeURIComponent(proposalId)}${params}`);
      const data = r.data?.replay;
      if (data && (data as any).error) {
        setError((data as any).error);
        setReplay(null);
        return null;
      }
      setReplay(data as CalibrationImpactReplay);
      return data as CalibrationImpactReplay;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to replay calibration impact');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { replay, loading, error, fetchImpact };
}
