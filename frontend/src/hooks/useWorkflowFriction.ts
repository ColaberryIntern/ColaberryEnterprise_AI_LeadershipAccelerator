import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface FrictionFinding {
  kind: string;
  severity: 'low' | 'medium' | 'high';
  route: string;
  description: string;
  evidence: Record<string, unknown>;
}

export interface WorkflowFrictionResponse {
  friction_score: number;
  findings: FrictionFinding[];
}

export function useWorkflowFriction(opts: { autoFetch?: boolean } = {}) {
  const [data, setData] = useState<WorkflowFrictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/visual-review/workflow-friction');
      setData(r.data as WorkflowFrictionResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load workflow friction');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) void refresh();
  }, [autoFetch, refresh]);

  return { data, loading, error, refresh };
}
