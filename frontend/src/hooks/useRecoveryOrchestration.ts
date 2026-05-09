import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface InteractiveRecoveryStep {
  index: number;
  kind: string;
  subject: string;
  forecast_impact: { low: number; high: number; uncertainty_drivers: string[] };
  rollback_consequence: string;
  trust_recovery_estimate: number;
  propagation_suppression_estimate: number;
  stabilization_confidence: number;
  blast_radius_implication: number;
  api_path: string | null;
  status: 'pending_operator' | 'approved' | 'skipped' | 'aborted' | 'completed';
}

export interface InteractiveRecoverySession {
  session_id: string;
  project_id: string;
  trigger_summary: string;
  steps: InteractiveRecoveryStep[];
  current_step_index: number;
  created_at: string;
  last_action_at: string;
  status: 'active' | 'completed' | 'aborted';
  operator_actions: Array<{ step_index: number; action: 'approve' | 'skip' | 'abort'; operator_id: string | null; recorded_at: string }>;
}

export function useRecoveryOrchestration(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [sessions, setSessions] = useState<InteractiveRecoverySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['recovery.step.executed', 'recovery.chain.generated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/operator/recovery-sessions');
      setSessions((r.data?.sessions || []) as InteractiveRecoverySession[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load recovery sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  const performStep = useCallback(async (sessionId: string, action: 'approve' | 'skip' | 'abort') => {
    const r = await portalApi.post(`/api/portal/project/governance/operator/recovery-sessions/${encodeURIComponent(sessionId)}/step`, { action });
    await refresh();
    return r.data?.session as InteractiveRecoverySession;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  const activeSessions = sessions.filter(s => s.status === 'active');

  return { sessions, activeSessions, loading, error, refresh, performStep, streamConnected: stream.connected };
}
