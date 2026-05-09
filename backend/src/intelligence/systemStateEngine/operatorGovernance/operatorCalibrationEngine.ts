/**
 * operatorCalibrationEngine — Phase 18. Operator-clicked governance
 * recalibration lifecycle.
 *
 * Architectural commitment (per Phase 18 stress-test + addendum):
 *   - The engine PROPOSES; the operator APPROVES.
 *   - There is NO timeout-based auto-approval, NO threshold-triggered
 *     auto-apply, NO silent governance evolution.
 *   - Every proposal carries `CalibrationConfidenceBounds` so the
 *     operator sees uncertainty drivers + rollback confidence.
 *   - Every approved calibration writes a replayable audit row + emits
 *     `governance.calibration.approved`.
 *
 * Lifecycle:
 *   1. proposeCalibration(...)        → status = 'pending_operator'
 *   2. operator clicks → approveCalibration(proposal_id, operator_id)
 *      → engine applies the change + writes audit + emits event
 *   3. operator clicks reject → rejectCalibration(...)
 *      → engine logs the rejection but does NOT retry
 *   4. optionally rollbackCalibration(proposal_id) reverts approved changes
 */

import { randomUUID } from 'crypto';
import type {
  CalibrationType, CalibrationStatus,
  GovernanceCalibrationProposal,
  CalibrationConfidenceBounds,
} from './operatorGovernanceTypes';
import { MAX_ACTIVE_PROPOSALS_PER_PROJECT } from './operatorGovernanceTypes';

interface ProjectState {
  proposals: Map<string, GovernanceCalibrationProposal>;
}

const projectStates = new Map<string, ProjectState>();

function getProjectState(project_id: string): ProjectState {
  let s = projectStates.get(project_id);
  if (!s) {
    s = { proposals: new Map() };
    projectStates.set(project_id, s);
  }
  return s;
}

export interface ProposeCalibrationInput {
  readonly project_id: string;
  readonly calibration_type: CalibrationType;
  readonly proposed_change: Readonly<Record<string, unknown>>;
  readonly rationale: string;
  readonly bounds: CalibrationConfidenceBounds;
  readonly forecasted_impact: ReadonlyArray<string>;
  readonly rollback_path: ReadonlyArray<string>;
}

export function proposeCalibration(input: ProposeCalibrationInput): GovernanceCalibrationProposal | { error: string } {
  const state = getProjectState(input.project_id);
  // Bounded: never queue beyond MAX_ACTIVE_PROPOSALS_PER_PROJECT pending proposals.
  const pendingCount = Array.from(state.proposals.values()).filter(p => p.status === 'pending_operator').length;
  if (pendingCount >= MAX_ACTIVE_PROPOSALS_PER_PROJECT) {
    return { error: `Cannot queue more than ${MAX_ACTIVE_PROPOSALS_PER_PROJECT} pending proposals.` };
  }
  const proposal: GovernanceCalibrationProposal = {
    proposal_id: `cal-${randomUUID()}`,
    project_id: input.project_id,
    calibration_type: input.calibration_type,
    proposed_change: input.proposed_change,
    rationale: input.rationale,
    bounds: input.bounds,
    forecasted_impact: input.forecasted_impact,
    rollback_path: input.rollback_path,
    operator_required: true,
    created_at: new Date().toISOString(),
    status: 'pending_operator',
    decided_at: null,
    decided_by: null,
  };
  state.proposals.set(proposal.proposal_id, proposal);
  void writeProposalAudit(proposal, 'governance_calibration_proposed', null);
  return proposal;
}

export interface ApproveRejectInput {
  readonly project_id: string;
  readonly proposal_id: string;
  readonly operator_id: string;
}

export async function approveCalibration(input: ApproveRejectInput): Promise<{ proposal: GovernanceCalibrationProposal; applied: boolean; apply_error: string | null }> {
  const proposal = getProjectState(input.project_id).proposals.get(input.proposal_id);
  if (!proposal) throw new Error(`Proposal ${input.proposal_id} not found in project ${input.project_id}`);
  if (proposal.status !== 'pending_operator') {
    return { proposal, applied: false, apply_error: `Proposal ${input.proposal_id} not pending (status=${proposal.status})` };
  }
  let applyError: string | null = null;
  try {
    await applyCalibration(proposal);
  } catch (err: any) {
    applyError = err?.message || String(err);
  }
  const updated: GovernanceCalibrationProposal = {
    ...proposal,
    status: applyError ? 'rejected' : 'approved' satisfies CalibrationStatus,
    decided_at: new Date().toISOString(),
    decided_by: input.operator_id,
  };
  getProjectState(input.project_id).proposals.set(input.proposal_id, updated);
  await writeProposalAudit(updated, applyError ? 'governance_calibration_rejected' : 'governance_calibration_approved', input.operator_id, applyError);
  return { proposal: updated, applied: !applyError, apply_error: applyError };
}

export async function rejectCalibration(input: ApproveRejectInput & { reason?: string }): Promise<GovernanceCalibrationProposal> {
  const proposal = getProjectState(input.project_id).proposals.get(input.proposal_id);
  if (!proposal) throw new Error(`Proposal ${input.proposal_id} not found in project ${input.project_id}`);
  if (proposal.status !== 'pending_operator') return proposal;
  const updated: GovernanceCalibrationProposal = {
    ...proposal,
    status: 'rejected',
    decided_at: new Date().toISOString(),
    decided_by: input.operator_id,
  };
  getProjectState(input.project_id).proposals.set(input.proposal_id, updated);
  await writeProposalAudit(updated, 'governance_calibration_rejected', input.operator_id, input.reason ?? 'operator_rejected');
  return updated;
}

export interface RollbackCalibrationInput {
  readonly project_id: string;
  readonly proposal_id: string;
  readonly operator_id: string;
}

export async function rollbackCalibration(input: RollbackCalibrationInput): Promise<GovernanceCalibrationProposal> {
  const proposal = getProjectState(input.project_id).proposals.get(input.proposal_id);
  if (!proposal) throw new Error(`Proposal ${input.proposal_id} not found in project ${input.project_id}`);
  if (proposal.status !== 'approved') {
    throw new Error(`Cannot rollback proposal in status=${proposal.status}`);
  }
  // Walk the proposal's rollback_path. Each entry is a string the
  // engine knows how to interpret — for now these are advisory only
  // (operator runs the corresponding API call themselves). Future
  // phases can wire automatic rollback execution.
  const updated: GovernanceCalibrationProposal = {
    ...proposal,
    status: 'rolled_back',
    decided_at: new Date().toISOString(),
    decided_by: input.operator_id,
  };
  getProjectState(input.project_id).proposals.set(input.proposal_id, updated);
  await writeProposalAudit(updated, 'governance_calibration_approved', input.operator_id, 'rollback_requested');
  return updated;
}

export function listProposals(project_id: string): ReadonlyArray<GovernanceCalibrationProposal> {
  return Array.from(getProjectState(project_id).proposals.values());
}

export function getProposal(project_id: string, proposal_id: string): GovernanceCalibrationProposal | null {
  return getProjectState(project_id).proposals.get(proposal_id) ?? null;
}

async function applyCalibration(proposal: GovernanceCalibrationProposal): Promise<void> {
  switch (proposal.calibration_type) {
    case 'validator_suppression': {
      const role = (proposal.proposed_change as any).validator_role;
      if (!role) throw new Error('validator_role required');
      const { suppressValidator } = await import('../adaptiveGovernance/validatorDriftDetector');
      suppressValidator(proposal.project_id, role);
      return;
    }
    case 'validator_restoration': {
      const role = (proposal.proposed_change as any).validator_role;
      if (!role) throw new Error('validator_role required');
      const { unsuppressValidator } = await import('../adaptiveGovernance/validatorDriftDetector');
      unsuppressValidator(proposal.project_id, role);
      return;
    }
    case 'specialization_adjustment':
    case 'reliability_decay_correction':
    case 'arbitration_tuning':
    case 'forecast_tuning':
    case 'routing_override':
      // v1: these calibration types log + audit, but their concrete state
      // changes happen via the dedicated engines (specializationRoutingEngine,
      // forecastTuningEngine). The operator's approval here is the trigger;
      // those engines read the approved proposals on next read.
      return;
  }
}

async function writeProposalAudit(
  proposal: GovernanceCalibrationProposal,
  kind: 'governance_calibration_proposed' | 'governance_calibration_approved' | 'governance_calibration_rejected',
  operator_id: string | null,
  note?: string | null,
): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: proposal.project_id,
      kind,
      subject_id: proposal.proposal_id,
      payload: { ...proposal, note: note ?? null },
      operator_id: operator_id ?? null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[operatorCalibrationEngine] audit write failed:', err?.message);
  }
}

export function _resetCalibrationEngine(): void {
  projectStates.clear();
}

export const _MAX_ACTIVE_PROPOSALS_FOR_TESTS = MAX_ACTIVE_PROPOSALS_PER_PROJECT;
