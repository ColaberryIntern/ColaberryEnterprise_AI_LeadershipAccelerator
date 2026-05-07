import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RollbackPreparationResult {
  rollback_prompt: string | null;
  before_dom_snapshot_id: string | null;
  post_execution_change_set: string | null;
  rollback_replay_checkpoint_snapshot_id: string | null;
  rollback_confidence: number;
  notes: string[];
}

/**
 * Phase 13 — fetches rollback readiness for a single plan by triggering
 * the rollback endpoint in dry-run mode (or peeking at the plan's
 * current rollback prep). v1: a stub that exposes the rollback prompt
 * via the existing /rollback endpoint with a trial change-set.
 */
export function useRollbackReadiness(planId: string | null) {
  const [data, setData] = useState<{ rollback: RollbackPreparationResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.post(`/api/portal/project/governance/autonomy/${planId}/rollback`, { post_execution_change_set: '' });
      setData(r.data as { rollback: RollbackPreparationResult });
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to probe rollback');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  return { data, loading, error, probe };
}
