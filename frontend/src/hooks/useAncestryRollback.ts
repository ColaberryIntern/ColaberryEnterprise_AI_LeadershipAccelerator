import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface AncestryRollbackStep {
  index: number;
  target_node_id: string;
  node_kind: string;
  mutation_intent: string | null;
  forecast: { low: number; high: number; confidence_range: number; uncertainty_drivers: string[] };
  blast_score: number;
  trust_recovery_estimate: number;
  propagation_consequences: string[];
  rollback_command: string;
}

export interface AncestryRollbackPlan {
  project_id: string;
  target_mutation_id: string;
  steps: AncestryRollbackStep[];
  total_estimated_blast: number;
  recommended_pacing_ms: number;
  operator_action_required: string;
  truncated: boolean;
  built_at: string;
}

/**
 * Phase 17 — operator-assisted ancestry rollback. The hook fetches the
 * plan; execution remains operator-driven via the existing per-mutation
 * rollback endpoints.
 */
export function useAncestryRollback() {
  const [plan, setPlan] = useState<AncestryRollbackPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPlan = useCallback(async (mutationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/governance/adaptive/ancestry-rollback/${encodeURIComponent(mutationId)}`);
      const p = (r.data?.plan || null) as AncestryRollbackPlan | null;
      setPlan(p);
      return p;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to build ancestry rollback plan');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Execute a single step of the plan. The actual rollback runs through
   * the existing /mutation/:id/rollback endpoint — this hook is a thin
   * wrapper that operators click through one step at a time.
   */
  const executeStep = useCallback(async (step: AncestryRollbackStep, mode: string = 'full') => {
    if (step.node_kind !== 'mutation') {
      return { skipped: true, reason: `Step ${step.index} is a ${step.node_kind} — no direct rollback target` };
    }
    const r = await portalApi.post(`/api/portal/project/governance/mutation/${encodeURIComponent(step.target_node_id)}/rollback`, {
      mode,
      reason: `ancestry_step_${step.index}`,
    });
    return r.data;
  }, []);

  return { plan, loading, error, buildPlan, executeStep };
}
