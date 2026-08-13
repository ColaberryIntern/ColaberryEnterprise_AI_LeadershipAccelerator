import InboxCaseAction from '../../models/InboxCaseAction';
import { assertActionTransition } from './actionStateMachine';
import { logCaseEvent } from './caseEventLog';
import { getCaseOrThrow } from './caseRepository';

// Approve/Reject controls (root directive section 10). Approval is
// always human-driven: nothing here ever moves an action past PROPOSED on
// its own. "Approve all low-risk" only ever touches actions that are BOTH
// risk_level=LOW AND requires_individual_approval=false — anything in
// ALWAYS_INDIVIDUAL_APPROVAL (email sends, Basecamp writes, etc., see
// types/inboxCase.ts) or HIGH risk is excluded from bulk approval by
// construction, not by a runtime check the caller could bypass.

export class ActionNotFoundError extends Error {
  error_class = 'ActionNotFoundError';
  statusCode = 404;
}

async function findActionOrThrow(caseId: string, actionId: string): Promise<InboxCaseAction> {
  const action = await InboxCaseAction.findOne({ where: { id: actionId, case_id: caseId } });
  if (!action) throw new ActionNotFoundError(`Action ${actionId} not found on case ${caseId}`);
  return action;
}

export async function approveAction(
  caseId: string,
  actionId: string,
  approvedBy: string,
  editedPayload?: Record<string, unknown>
): Promise<InboxCaseAction> {
  const caseRow = await getCaseOrThrow(caseId);
  const action = await findActionOrThrow(caseId, actionId);
  assertActionTransition(action.status, 'APPROVED');

  const payload = editedPayload ? { ...action.payload, ...editedPayload } : action.payload;
  await action.update({ status: 'APPROVED', approved_by: approvedBy, approved_at: new Date(), payload, updated_at: new Date() });

  await logCaseEvent({
    case_id: caseId,
    action_id: actionId,
    event_type: 'action_approved',
    actor_type: 'admin',
    actor_id: approvedBy,
    details: { edited: !!editedPayload },
    correlation_id: caseRow.correlation_id,
  });

  return action;
}

export async function rejectAction(caseId: string, actionId: string, rejectedBy: string, reason: string): Promise<InboxCaseAction> {
  const caseRow = await getCaseOrThrow(caseId);
  const action = await findActionOrThrow(caseId, actionId);
  assertActionTransition(action.status, 'REJECTED');

  await action.update({ status: 'REJECTED', updated_at: new Date() });

  await logCaseEvent({
    case_id: caseId,
    action_id: actionId,
    event_type: 'action_rejected',
    actor_type: 'admin',
    actor_id: rejectedBy,
    details: { reason },
    correlation_id: caseRow.correlation_id,
  });

  return action;
}

export interface ApproveLowRiskResult {
  approved: number;
  skippedHighRiskOrIndividual: number;
}

export async function approveLowRiskActions(caseId: string, approvedBy: string): Promise<ApproveLowRiskResult> {
  const caseRow = await getCaseOrThrow(caseId);
  const proposed = await InboxCaseAction.findAll({ where: { case_id: caseId, status: 'PROPOSED' } });

  let approved = 0;
  let skipped = 0;

  for (const action of proposed) {
    if (action.risk_level !== 'LOW' || action.requires_individual_approval) {
      skipped++;
      continue;
    }
    await action.update({ status: 'APPROVED', approved_by: approvedBy, approved_at: new Date(), updated_at: new Date() });
    await logCaseEvent({
      case_id: caseId,
      action_id: action.id,
      event_type: 'action_approved',
      actor_type: 'admin',
      actor_id: approvedBy,
      details: { bundled_low_risk_approval: true },
      correlation_id: caseRow.correlation_id,
    });
    approved++;
  }

  return { approved, skippedHighRiskOrIndividual: skipped };
}
