/**
 * interactiveRecoveryCoordinator — Phase 18. Step-by-step recovery
 * orchestration where the engine WAITS BETWEEN STEPS for operator
 * approval.
 *
 * Architectural commitment (per Phase 18 stress-test):
 *   - The engine NEVER autonomously walks the recovery chain.
 *   - Each step exposes forecast impact + rollback consequence + trust
 *     recovery + propagation suppression + stabilization confidence +
 *     blast-radius implication.
 *   - Operator clicks `approve` / `skip` / `abort` per step.
 *   - Sessions persist in memory; status flips to 'completed' / 'aborted'
 *     when the operator finishes / abandons.
 *   - GovernanceAuditEntry rows of kind `recovery_step_executed` carry
 *     the per-step audit history.
 */

import { randomUUID } from 'crypto';
import type {
  InteractiveRecoveryStep, InteractiveRecoverySession, RecoveryStepStatus,
} from './operatorGovernanceTypes';
import { MAX_ACTIVE_RECOVERY_SESSIONS_PER_PROJECT } from './operatorGovernanceTypes';
import type { CausalRecoveryChain } from '../adaptiveGovernance/adaptiveGovernanceTypes';

interface InternalSession {
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

const projectSessions = new Map<string, Map<string, InternalSession>>();

function getProjectMap(project_id: string): Map<string, InternalSession> {
  let m = projectSessions.get(project_id);
  if (!m) {
    m = new Map();
    projectSessions.set(project_id, m);
  }
  return m;
}

export interface CreateRecoverySessionInput {
  readonly project_id: string;
  readonly trigger_summary: string;
  /** A Phase 17 `CausalRecoveryChain` is the natural input — its steps
   *  get translated into `InteractiveRecoveryStep`s with per-step
   *  forecast bounds + estimates. */
  readonly source_chain: CausalRecoveryChain;
}

export function createRecoverySession(input: CreateRecoverySessionInput): InteractiveRecoverySession | { error: string } {
  const map = getProjectMap(input.project_id);
  const active = Array.from(map.values()).filter(s => s.status === 'active').length;
  if (active >= MAX_ACTIVE_RECOVERY_SESSIONS_PER_PROJECT) {
    return { error: `Cannot create more than ${MAX_ACTIVE_RECOVERY_SESSIONS_PER_PROJECT} active recovery sessions per project.` };
  }

  const steps: InteractiveRecoveryStep[] = input.source_chain.steps.map((s, idx) => {
    // v1: derive bounds + estimates from the step kind. Future phases
    // can wire actual per-step forecasting via the Phase 17 forecaster.
    const baseEstimate = baseEstimatesForKind(s.kind);
    return {
      index: idx,
      kind: s.kind,
      subject: s.subject,
      forecast_impact: { low: baseEstimate.impact_low, high: baseEstimate.impact_high, uncertainty_drivers: ['heuristic_per_step', 'no_executed_history'] },
      rollback_consequence: baseEstimate.rollback_consequence,
      trust_recovery_estimate: baseEstimate.trust_recovery,
      propagation_suppression_estimate: baseEstimate.propagation_suppression,
      stabilization_confidence: baseEstimate.stabilization_confidence,
      blast_radius_implication: baseEstimate.blast_radius,
      api_path: s.api_path,
      status: 'pending_operator',
    };
  });

  const session: InternalSession = {
    session_id: `rec-${randomUUID()}`,
    project_id: input.project_id,
    trigger_summary: input.trigger_summary,
    steps,
    current_step_index: 0,
    created_at: new Date().toISOString(),
    last_action_at: new Date().toISOString(),
    status: 'active',
    operator_actions: [],
  };
  map.set(session.session_id, session);
  return toReadonly(session);
}

function baseEstimatesForKind(kind: string): {
  impact_low: number; impact_high: number;
  rollback_consequence: string;
  trust_recovery: number;
  propagation_suppression: number;
  stabilization_confidence: number;
  blast_radius: number;
} {
  switch (kind) {
    case 'contain_root':
      return { impact_low: 30, impact_high: 70, rollback_consequence: 'Containment is reversible via liftContainment endpoint.', trust_recovery: 50, propagation_suppression: 80, stabilization_confidence: 70, blast_radius: 25 };
    case 'rollback_target':
      return { impact_low: 50, impact_high: 90, rollback_consequence: 'Rollback re-applies inverse mutation; confirm before retrying forward path.', trust_recovery: 40, propagation_suppression: 70, stabilization_confidence: 65, blast_radius: 50 };
    case 'recalibrate_trust':
      return { impact_low: 10, impact_high: 35, rollback_consequence: 'Trust adjustment is a one-shot in-memory change; recalibrate again to revert.', trust_recovery: 20, propagation_suppression: 30, stabilization_confidence: 55, blast_radius: 15 };
    case 'reenable_governance':
      return { impact_low: 20, impact_high: 50, rollback_consequence: 'Set automation_mode back to supervised to re-quarantine.', trust_recovery: 60, propagation_suppression: 20, stabilization_confidence: 75, blast_radius: 20 };
    case 'suppress_propagation_branch':
      return { impact_low: 25, impact_high: 60, rollback_consequence: 'Propagation suppression is operator-driven; remove the freeze to lift.', trust_recovery: 30, propagation_suppression: 85, stabilization_confidence: 60, blast_radius: 30 };
    case 'monitor_only':
      return { impact_low: 0, impact_high: 10, rollback_consequence: 'No-op; nothing to revert.', trust_recovery: 0, propagation_suppression: 0, stabilization_confidence: 80, blast_radius: 0 };
    default:
      return { impact_low: 10, impact_high: 50, rollback_consequence: 'Unknown step kind; consult audit.', trust_recovery: 25, propagation_suppression: 25, stabilization_confidence: 50, blast_radius: 25 };
  }
}

export interface StepActionInput {
  readonly project_id: string;
  readonly session_id: string;
  readonly action: 'approve' | 'skip' | 'abort';
  readonly operator_id: string;
}

export async function performStepAction(input: StepActionInput): Promise<InteractiveRecoverySession> {
  const session = getProjectMap(input.project_id).get(input.session_id);
  if (!session) throw new Error(`Recovery session ${input.session_id} not found`);
  if (session.status !== 'active') throw new Error(`Session is ${session.status}; no further actions allowed`);

  const idx = session.current_step_index;
  if (idx >= session.steps.length) {
    session.status = 'completed';
    return toReadonly(session);
  }
  const step = session.steps[idx];

  const newStatus: RecoveryStepStatus = input.action === 'approve' ? 'approved' : input.action === 'skip' ? 'skipped' : 'aborted';
  session.steps[idx] = { ...step, status: newStatus };
  session.operator_actions.push({
    step_index: idx, action: input.action, operator_id: input.operator_id, recorded_at: new Date().toISOString(),
  });
  session.last_action_at = new Date().toISOString();

  // Audit per step
  await writeStepAudit(session, step, input.action, input.operator_id);

  if (input.action === 'abort') {
    session.status = 'aborted';
    return toReadonly(session);
  }

  // Approved or skipped → advance one step. Engine WAITS here for the
  // next operator click — does NOT autonomously execute the next step.
  session.current_step_index = idx + 1;
  if (session.current_step_index >= session.steps.length) {
    session.status = 'completed';
    // Mark any still-pending steps as completed implicitly? No — only
    // the actually-executed step is 'approved'. Status='completed' is
    // session-level.
  }
  return toReadonly(session);
}

export function getRecoverySession(project_id: string, session_id: string): InteractiveRecoverySession | null {
  const session = getProjectMap(project_id).get(session_id);
  return session ? toReadonly(session) : null;
}

export function listRecoverySessions(project_id: string): ReadonlyArray<InteractiveRecoverySession> {
  return Array.from(getProjectMap(project_id).values()).map(toReadonly);
}

function toReadonly(s: InternalSession): InteractiveRecoverySession {
  return {
    session_id: s.session_id,
    project_id: s.project_id,
    trigger_summary: s.trigger_summary,
    steps: s.steps,
    current_step_index: s.current_step_index,
    created_at: s.created_at,
    last_action_at: s.last_action_at,
    status: s.status,
    operator_actions: s.operator_actions,
  };
}

async function writeStepAudit(session: InternalSession, step: InteractiveRecoveryStep, action: string, operator_id: string): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: session.project_id,
      kind: 'recovery_step_executed',
      subject_id: session.session_id,
      payload: {
        step_index: step.index,
        kind: step.kind,
        subject: step.subject,
        action,
        forecast_impact: step.forecast_impact,
        stabilization_confidence: step.stabilization_confidence,
      },
      operator_id,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[interactiveRecoveryCoordinator] audit write failed:', err?.message);
  }
}

export function _resetInteractiveRecovery(): void {
  projectSessions.clear();
}

export const _MAX_ACTIVE_RECOVERY_SESSIONS_FOR_TESTS = MAX_ACTIVE_RECOVERY_SESSIONS_PER_PROJECT;
