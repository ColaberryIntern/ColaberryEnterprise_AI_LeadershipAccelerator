/**
 * autonomousRemediationPreparer — drafts PreparedRemediationPlan rows
 * for operator approval. Phase 12 NEVER auto-executes — the row sits
 * at status='draft' until the operator approves it via the existing
 * approval endpoint, after which the existing ui_fix_adaptive flow
 * issues the prompt and stamps applied_at.
 *
 * Rollback fidelity: each plan carries a before_dom_snapshot_id so
 * "rollback" can re-issue a prompt against the original state without
 * needing git operations.
 *
 * Phase 12 §A.4.
 */

import type { PreparedRemediationPlanStatus } from '../../../models/PreparedRemediationPlan';

export interface PreparePlanInput {
  readonly project_id: string;
  readonly capability_id: string;
  readonly cluster_signature: string;
  readonly cluster_type: string;
  readonly issues: ReadonlyArray<{ id: string; title: string; description: string; suggestion?: string; severity: string; element_id?: string }>;
  readonly historical_success_rate: number;
  readonly regression_prone_patterns: ReadonlyArray<{ cluster_signature: string; recommended_alternative: string }>;
  readonly sequence_position: { position: number; total: number; reason: string } | null;
  readonly confidence: number;
  readonly before_dom_snapshot_id: string | null;
  readonly projected_pressure_drop: number;
  readonly projected_cognition_gain: number;
}

export interface PlanPayload {
  readonly target: 'ui_fix_adaptive';
  readonly stepKey: string;
  readonly uiIssues: ReadonlyArray<{ id: string; title: string; description: string; suggestion?: string; severity: string; element_id?: string }>;
  readonly adaptiveRemediation: {
    readonly clusters: ReadonlyArray<{
      cluster_type: string;
      historical_success_rate: number;
      regression_prone_patterns: ReadonlyArray<{ cluster_signature: string; recommended_alternative: string }>;
      sequence_position: { position: number; total: number; reason: string } | null;
      confidence: { confidence: number; tier: 'low' | 'moderate' | 'high'; reasons: ReadonlyArray<string> };
    }>;
  };
  readonly rollback: {
    readonly rollback_prompt_target: 'ui_fix_adaptive';
    readonly rollback_payload: { instruction: string; reference_dom_snapshot_id: string | null };
    readonly before_dom_snapshot_id: string | null;
  };
}

export interface ProjectedOutcome {
  readonly projected_pressure_drop: number;
  readonly projected_cognition_gain: number;
  readonly projected_issues_resolved: number;
  readonly confidence: number;
}

export interface PreparedPlanDraft {
  readonly project_id: string;
  readonly capability_id: string;
  readonly cluster_signature: string;
  readonly plan_payload: PlanPayload;
  readonly projected_outcome: ProjectedOutcome;
  readonly confidence: number;
  readonly status: PreparedRemediationPlanStatus;
}

const STEP_KEY_BY_CLUSTER_TYPE: Record<string, string> = {
  hierarchy: 'layout_hierarchy',
  cta: 'usability',
  spacing: 'mobile_responsiveness',
  accessibility: 'usability',
  workflow: 'usability',
  navigation: 'usability',
  cognition_overload: 'mobile_responsiveness',
};

export function preparePlanDraft(input: PreparePlanInput): PreparedPlanDraft {
  const stepKey = STEP_KEY_BY_CLUSTER_TYPE[input.cluster_type] || 'usability';
  const tier: 'low' | 'moderate' | 'high' =
    input.confidence >= 70 ? 'high' :
    input.confidence >= 45 ? 'moderate' :
    'low';
  const plan_payload: PlanPayload = {
    target: 'ui_fix_adaptive',
    stepKey,
    uiIssues: input.issues,
    adaptiveRemediation: {
      clusters: [
        {
          cluster_type: input.cluster_type,
          historical_success_rate: input.historical_success_rate,
          regression_prone_patterns: input.regression_prone_patterns,
          sequence_position: input.sequence_position,
          confidence: { confidence: input.confidence, tier, reasons: [] },
        },
      ],
    },
    rollback: {
      rollback_prompt_target: 'ui_fix_adaptive',
      rollback_payload: {
        instruction: `Revert the changes made for cluster ${input.cluster_signature}. Restore the page state to match the captured DOM snapshot.`,
        reference_dom_snapshot_id: input.before_dom_snapshot_id,
      },
      before_dom_snapshot_id: input.before_dom_snapshot_id,
    },
  };
  const projected_outcome: ProjectedOutcome = {
    projected_pressure_drop: input.projected_pressure_drop,
    projected_cognition_gain: input.projected_cognition_gain,
    projected_issues_resolved: input.issues.length,
    confidence: input.confidence,
  };
  return {
    project_id: input.project_id,
    capability_id: input.capability_id,
    cluster_signature: input.cluster_signature,
    plan_payload,
    projected_outcome,
    confidence: input.confidence,
    status: 'draft',
  };
}

/**
 * Build the rollback prompt body that the existing ui_fix_adaptive flow
 * will issue when the operator clicks Rollback. Returns null if the
 * plan is missing the required snapshot reference (operator gets a
 * warning in the dashboard).
 *
 * Phase 13 — when a post-execution change set is provided, append a
 * `# POST-EXECUTION CHANGES` section so the rollback prompt can refer
 * to what actually changed (gives Claude Code precise context for the
 * inverse operation).
 */
export function buildRollbackPromptBody(plan_payload: PlanPayload, postExecutionChangeSet?: string | null): string | null {
  if (!plan_payload?.rollback) return null;
  const ref = plan_payload.rollback.before_dom_snapshot_id;
  if (!ref) return null;
  let body = `${plan_payload.rollback.rollback_payload.instruction}\n\n# REFERENCE STATE\n\nBefore-state DOM snapshot id: ${ref}.`;
  if (postExecutionChangeSet && postExecutionChangeSet.trim().length > 0) {
    body += `\n\n# POST-EXECUTION CHANGES\n\n${postExecutionChangeSet.trim()}`;
  }
  return body;
}
