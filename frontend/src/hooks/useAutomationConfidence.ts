import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface AutomationConfidence {
  automation_allowed: boolean;
  confidence: number;
  tier: 'low' | 'moderate' | 'high';
  blocking_reasons: string[];
  evidence_strength: number;
  regression_risk: number;
  governance_risk: number;
  required_human_review: boolean;
  mode_decision: { action: 'apply' | 'queue_for_review' | 'reject'; reason: string; mode: string };
}

export interface AutomationConfidenceResponse {
  automation_confidence: AutomationConfidence;
  automation_mode: 'autonomous' | 'supervised' | 'frozen';
  governance_summary: {
    active_clusters: number;
    recent_regression_count: number;
    override_velocity: number;
    unsafe_pattern_count: number;
    successful_pattern_count: number;
  };
  generated_at: string;
}

const KINDS = ['automation.blocked', 'automation.ready', 'operator.override', 'governance.policy.changed'];

export function useAutomationConfidence(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [data, setData] = useState<AutomationConfidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: KINDS });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/automation-confidence');
      setData(r.data as AutomationConfidenceResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load automation confidence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const handle = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(handle);
  }, [stream.latest, refresh]);

  return { data, loading, error, refresh, streamConnected: stream.connected };
}
