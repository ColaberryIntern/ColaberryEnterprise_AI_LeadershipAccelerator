import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface VisualSessionDetail {
  session: any;
  critiques: any[];
  suggestions: any[];
  decisions: any[];
}

export interface UseVisualReviewSession {
  data: VisualSessionDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addCritique: (input: {
    kind: string;
    severity: string;
    description: string;
    region?: { x: number; y: number; width: number; height: number } | null;
    target_selector?: string | null;
    workflow_id?: string | null;
    expected_outcome?: string | null;
  }) => Promise<void>;
  decide: (input: { suggestion_id?: string; critique_id?: string; verdict: 'accepted' | 'rejected' | 'deferred'; rationale?: string }) => Promise<void>;
  generatePrompt: () => Promise<any>;
}

export function useVisualReviewSession(sessionId: string | null): UseVisualReviewSession {
  const [data, setData] = useState<VisualSessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) { setData(null); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/visual-review/session/${encodeURIComponent(sessionId)}`);
      setData(r.data as VisualSessionDetail);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const addCritique = useCallback(async (input: any) => {
    if (!sessionId) return;
    await portalApi.post(`/api/portal/project/visual-review/session/${encodeURIComponent(sessionId)}/critique`, input);
    await refresh();
  }, [sessionId, refresh]);

  const decide = useCallback(async (input: any) => {
    if (!sessionId) return;
    await portalApi.post(`/api/portal/project/visual-review/session/${encodeURIComponent(sessionId)}/decision`, input);
    await refresh();
  }, [sessionId, refresh]);

  const generatePrompt = useCallback(async () => {
    if (!sessionId) return null;
    const r = await portalApi.post(`/api/portal/project/visual-review/session/${encodeURIComponent(sessionId)}/generate-prompt`, {});
    await refresh();
    return r.data;
  }, [sessionId, refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh, addCritique, decide, generatePrompt };
}
