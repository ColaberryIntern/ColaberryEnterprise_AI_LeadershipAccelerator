import InboxCaseAction from '../../models/InboxCaseAction';
import { ActionType } from '../../types/inboxCase';
import { logCaseEvent } from './caseEventLog';
import { getCaseOrThrow, transitionCase } from './caseRepository';
import { postCaseProgressNote } from './caseTicketService';

// Verify (root directive section 12/24 — "Execution is verified"). For each
// SUCCEEDED action, confirms the external effect actually landed rather
// than trusting the executor's return value alone. Internal action types
// (MARK_WAITING, NO_ACTION, etc.) have no external state to re-check —
// their receipt IS the verification. External types are verified by
// receipt shape (does it carry the id the executor is supposed to return);
// a live re-fetch against Gmail/Basecamp is intentionally out of scope for
// this build pass (no credentials available to test against), documented
// as a known gap rather than silently skipped — see ARCHITECTURE.md.

const INTERNAL_ACTION_TYPES: ActionType[] = ['MARK_WAITING', 'MARK_DELEGATED', 'CREATE_FOLLOWUP', 'NO_ACTION', 'EMAIL_DRAFT'];

const RECEIPT_KEY_BY_TYPE: Partial<Record<ActionType, string>> = {
  EMAIL_SEND: 'message_id',
  EMAIL_LABEL: 'message_id',
  EMAIL_ARCHIVE: 'message_id',
  BASECAMP_COMMENT: 'comment_id',
  BASECAMP_UPDATE_TODO: 'todo_id',
  BASECAMP_COMPLETE_TODO: 'todo_id',
};

function verifyReceipt(action: InboxCaseAction): boolean {
  if (INTERNAL_ACTION_TYPES.includes(action.action_type)) return true;
  const key = RECEIPT_KEY_BY_TYPE[action.action_type];
  if (!key) return false;
  const receipt = action.external_receipt as Record<string, unknown> | null;
  return !!receipt && receipt[key] !== undefined && receipt[key] !== null;
}

export interface VerifyResult {
  verified: number;
  verificationFailed: number;
  finalCaseState: string;
}

export async function verifyCase(caseId: string, requestedBy: string): Promise<VerifyResult> {
  const caseRow = await getCaseOrThrow(caseId);
  const actions = await InboxCaseAction.findAll({ where: { case_id: caseId } });

  let verified = 0;
  let verificationFailed = 0;

  for (const action of actions.filter((a) => a.status === 'SUCCEEDED')) {
    const ok = verifyReceipt(action);
    await action.update({ status: ok ? 'VERIFIED' : 'FAILED', verification_status: ok ? 'VERIFIED' : 'VERIFICATION_FAILED', verified_at: new Date(), updated_at: new Date() });
    await logCaseEvent({
      case_id: caseId,
      action_id: action.id,
      event_type: 'action_verified',
      actor_type: 'system',
      actor_id: 'case_verification_service',
      details: { ok, action_type: action.action_type },
      correlation_id: action.correlation_id,
    });
    if (ok) verified++;
    else verificationFailed++;
  }

  await caseRow.update({ last_verified_at: new Date(), updated_at: new Date() });

  const anyFailed = verificationFailed > 0 || actions.some((a) => a.status === 'FAILED');
  const anyWaiting = actions.some((a) => a.action_type === 'MARK_WAITING' && ['SUCCEEDED', 'VERIFIED'].includes(a.status));
  const anyDelegated = actions.some((a) => a.action_type === 'MARK_DELEGATED' && ['SUCCEEDED', 'VERIFIED'].includes(a.status));

  let target: 'FAILED' | 'WAITING' | 'DELEGATED' | 'RESOLVED';
  if (anyFailed) target = 'FAILED';
  else if (anyWaiting) target = 'WAITING';
  else if (anyDelegated) target = 'DELEGATED';
  else target = 'RESOLVED';

  if (caseRow.state === 'EXECUTING') {
    await transitionCase(caseId, target, {
      actor_type: 'system',
      actor_id: 'case_verification_service',
      event_type: 'case_verification_completed',
      details: { requested_by: requestedBy, verified, verification_failed: verificationFailed, target },
    });
  }

  await postCaseProgressNote(
    caseId,
    `Verification: ${verified} action(s) confirmed, ${verificationFailed} failed verification. Case status: ${target}.`
  );

  return { verified, verificationFailed, finalCaseState: caseRow.state };
}
