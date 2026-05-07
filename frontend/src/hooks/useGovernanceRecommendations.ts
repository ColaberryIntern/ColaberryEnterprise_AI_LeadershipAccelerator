import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface GovernanceRecommendation {
  id: string;
  project_id: string;
  type: string;
  recommendation_text: string;
  rationale: string;
  confidence: number;
  risk_level: 'low' | 'moderate' | 'elevated' | 'high';
  supporting_evidence: any;
  projected_outcomes: any;
  priority: number;
  requires_review_within_min: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  operator_decision_at: string | null;
  operator_id: string | null;
  decision_reason: string | null;
  created_at: string;
}

const KINDS = ['governance.recommendation.created', 'governance.recommendation.decided'];

/**
 * Phase 12 — operator-facing recommendations with SSE auto-refresh.
 * Mirrors useLiveRemediationIntelligence pattern: poll on mount,
 * SSE-trigger refetches debounced + deduped.
 */
export function useGovernanceRecommendations(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [recommendations, setRecommendations] = useState<GovernanceRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: KINDS });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/recommendations?status=pending');
      setRecommendations((r.data?.recommendations || []) as GovernanceRecommendation[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  const decide = useCallback(async (id: string, decision: 'accepted' | 'rejected', reason?: string) => {
    await portalApi.post(`/api/portal/project/governance/recommendations/${id}/decision`, { decision, reason });
    await refresh();
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const handle = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(handle);
  }, [stream.latest, refresh]);

  return { recommendations, loading, error, refresh, decide, streamConnected: stream.connected };
}
