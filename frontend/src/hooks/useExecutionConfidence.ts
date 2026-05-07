import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface ExecutionConfidenceSnapshot {
  // Pulled from the autonomy trust response which already exposes
  // execution_success_rate + rollback_frequency. Confidence is derived
  // client-side as a quick traffic light; deeper inputs are fetched on
  // demand via the autonomy/decisions endpoint.
  execution_success_rate: number;
  rollback_frequency: number;
  confidence: number;        // 0-100 (heuristic)
  tier: 'low' | 'moderate' | 'high';
}

export function useExecutionConfidence(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [data, setData] = useState<ExecutionConfidenceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['autonomy.execution.applied', 'autonomy.execution.rolled_back', 'autonomy.trust.changed'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/autonomy/trust');
      const successRate = r.data?.execution_success_rate ?? 100;
      const rbFreq = r.data?.rollback_frequency ?? 0;
      // Heuristic blend: success rate weighted heavier; rollback frequency penalizes.
      const confidence = Math.max(0, Math.min(100, Math.round(successRate * 0.7 - rbFreq * 0.5 + 30)));
      const tier: ExecutionConfidenceSnapshot['tier'] = confidence >= 70 ? 'high' : confidence >= 45 ? 'moderate' : 'low';
      setData({ execution_success_rate: successRate, rollback_frequency: rbFreq, confidence, tier });
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load execution confidence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { data, loading, error, refresh, streamConnected: stream.connected };
}
