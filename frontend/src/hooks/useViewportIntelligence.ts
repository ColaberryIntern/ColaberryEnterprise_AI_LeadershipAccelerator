import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ViewportFinding {
  viewport: 'desktop' | 'tablet' | 'mobile';
  kind: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface ViewportIntelligence {
  findings: ViewportFinding[];
  cognition_by_viewport: Record<'desktop' | 'tablet' | 'mobile', number | null>;
  worst_viewport: 'desktop' | 'tablet' | 'mobile' | null;
}

export function useViewportIntelligence(route: string | null, opts: { autoFetch?: boolean } = {}) {
  const [data, setData] = useState<ViewportIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autoFetch = true } = opts;

  const refresh = useCallback(async () => {
    if (!route) { setData(null); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/multimodal/viewport', { params: { route } });
      setData(r.data as ViewportIntelligence);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load viewport intelligence');
    } finally {
      setLoading(false);
    }
  }, [route]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { data, loading, error, refresh };
}
