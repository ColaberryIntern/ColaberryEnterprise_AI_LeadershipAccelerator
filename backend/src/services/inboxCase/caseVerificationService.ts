import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCaseItem from '../../models/InboxCaseItem';
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

// Settled = this action will never move again on its own; it's safe to
// judge an item's overall state by looking only at settled actions.
const SETTLED_ACTION_STATUSES = ['VERIFIED', 'REJECTED', 'SKIPPED'];

// Closes the gap where an item whose action(s) actually ran and verified
// successfully never picked up a disposition — only the manual dropdown and
// the Handled/Ignore quick-resolve buttons used to set it, so a fully
// completed item sat open forever, needlessly blocking Close Case. Only
// touches items with disposition still null; never overwrites a disposition
// set by any other path (manual, quick-resolve, or a prior verify run).
async function applyAutoDispositions(caseId: string, correlationId: string, actions: InboxCaseAction[]): Promise<number> {
  const actionsByItemId = new Map<string, InboxCaseAction[]>();
  for (const action of actions) {
    if (!action.item_id) continue;
    const list = actionsByItemId.get(action.item_id) || [];
    list.push(action);
    actionsByItemId.set(action.item_id, list);
  }
  if (actionsByItemId.size === 0) return 0;

  const items = await InboxCaseItem.findAll({ where: { case_id: caseId, disposition: null } });
  let count = 0;

  for (const item of items) {
    const itemActions = actionsByItemId.get(item.id);
    if (!itemActions || itemActions.length === 0) continue; // never targeted — still requires manual/quick-resolve

    const allSettled = itemActions.every((a) => SETTLED_ACTION_STATUSES.includes(a.status));
    if (!allSettled) continue; // still in flight (PROPOSED/APPROVED/EXECUTING/SUCCEEDED/FAILED) — not this item's turn yet

    const verifiedActions = itemActions.filter((a) => a.status === 'VERIFIED');
    if (verifiedActions.length === 0) continue; // every action on this item was rejected/skipped — no real work happened

    const delegated = verifiedActions.find((a) => a.action_type === 'MARK_DELEGATED');
    const waiting = verifiedActions.find((a) => a.action_type === 'MARK_WAITING');

    let disposition: 'RESOLVED' | 'WAITING' | 'DELEGATED';
    let reasonSource: string | null = null;

    if (delegated) {
      if (!item.source_url) continue; // closure condition 7 needs a source link too — don't trade one blocker for another
      disposition = 'DELEGATED';
      reasonSource = delegated.preview;
    } else if (waiting) {
      disposition = 'WAITING';
      reasonSource = waiting.preview;
    } else {
      disposition = 'RESOLVED';
    }

    const patch: Record<string, unknown> = { disposition, updated_at: new Date() };
    if (reasonSource && !item.disposition_reason) patch.disposition_reason = reasonSource;
    await item.update(patch);

    await logCaseEvent({
      case_id: caseId,
      item_id: item.id,
      event_type: 'item_auto_dispositioned',
      actor_type: 'system',
      actor_id: 'case_verification_service',
      details: { disposition, action_ids: itemActions.map((a) => a.id) },
      correlation_id: correlationId,
    });
    count++;
  }

  return count;
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

  await applyAutoDispositions(caseId, caseRow.correlation_id, actions);

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
