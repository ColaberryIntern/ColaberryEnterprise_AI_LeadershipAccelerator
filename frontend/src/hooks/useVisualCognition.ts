import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface VisionContradiction {
  kind: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  evidence: Record<string, unknown>;
  capability_id?: string;
}

export interface VisualCognitionResponse {
  worst_route: string | null;
  worst_cognition_score: number;
  contradiction_count: number;
  contradictions: VisionContradiction[];
  regression_count: number;
  snapshot_count: number;
  behavioral_event_count: number;
}

export function useVisualCognition(opts: { autoFetch?: boolean } = {}) {
  const [data, setData] = useState<VisualCognitionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/vision/cognition');
      setData(r.data as VisualCognitionResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load visual cognition');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { data, loading, error, refresh };
}
