import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface GuidanceItem {
  attribution: {
    guidance_id: string;
    action_kind: string;
    urgency_score: number;
    ranked_by_rule: string;
    source_attributions: Array<{
      source_kind: string;
      source_id: string;
      source_phase: string;
      recorded_at: string;
      fragment_quoted: string;
    }>;
    operator_clickable_phase: string;
    ranking_reason: string;
  };
  description: string;
  target_namespace?: string;
  target_kind?: string;
  target_organization_id: string;
  target_endpoint_hint: string;
}

export interface OperatorGuidancePlan {
  plan_id: string;
  organization_id: string;
  items: GuidanceItem[];
  bounded_reason: string;
  built_at: string;
}

export interface CognitiveLoadProfile {
  organization_id: string;
  tier: 'light' | 'moderate' | 'dense' | 'overloaded';
  load_score: number;
  drivers: Array<{ metric: string; observed_value: number; contribution: number }>;
  observable_signals: {
    pending_propagations: number;
    active_broker_isolations: number;
    active_execution_isolations: number;
    recent_failures_24h: number;
    recovery_plan_count: number;
    fragmentation_pressure: number;
    replay_backlog: number;
  };
  built_at: string;
}

export function useOperatorGuidance(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [latest, setLatest] = useState<OperatorGuidancePlan | null>(null);
  const [history, setHistory] = useState<OperatorGuidancePlan[]>([]);
  const [load, setLoad] = useState<CognitiveLoadProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['guidance.generated', 'cognitive_load.detected', 'execution.isolated', 'topology.fragmented'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const [g, l] = await Promise.all([
        portalApi.get(`/api/portal/project/cognitive-compression/operator-guidance?organization_id=${encodeURIComponent(organization_id)}`),
        portalApi.get(`/api/portal/project/cognitive-compression/cognitive-load?organization_id=${encodeURIComponent(organization_id)}`),
      ]);
      setLatest((g.data?.latest || null) as OperatorGuidancePlan | null);
      setHistory((g.data?.history || []) as OperatorGuidancePlan[]);
      setLoad((l.data || null) as CognitiveLoadProfile | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load operator guidance');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { latest, history, load, loading, error, refresh, streamConnected: stream.connected };
}
