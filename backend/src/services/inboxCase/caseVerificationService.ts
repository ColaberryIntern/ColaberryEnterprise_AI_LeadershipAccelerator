import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCaseItem from '../../models/InboxCaseItem';
import { ActionStatus, ActionType } from '../../types/inboxCase';
import { assertActionTransition } from './actionStateMachine';
import { logCaseEvent } from './caseEventLog';
import { getCaseOrThrow, transitionCase } from './caseRepository';
import { postCaseProgressNote } from './caseTicketService';
import { promoteWaitingFromAction } from './waitingLedgerService';
import { verifyExternalEffect, VerifyOutcome } from './externalVerifiers';

// Verify (root directive section 12/24 — "Execution is verified"). For each
// SUCCEEDED action, confirms the external effect actually landed rather
// than trusting the executor's return value alone. Internal action types
// (MARK_WAITING, NO_ACTION, etc.) have no external state to re-check —
// their receipt IS the verification. External types are checked for
// receipt shape AND then re-fetched live against Gmail / Graph / Basecamp
// (externalVerifiers.ts, /inbox-zero T5) — the gap this file used to
// document is closed. Three outcomes:
//   verified     -> VERIFIED
//   missing      -> FAILED + VERIFICATION_FAILED (a real failure; Retry Failed exists for it)
//   unverifiable -> stays SUCCEEDED with verification PENDING and
//                   verification_attempt_count++. On the third attempt it is
//                   settled SUCCEEDED -> FAILED -> SKIPPED (both edges legal
//                   in ACTION_STATE_TRANSITIONS) with error_class
//                   VerificationExhausted, and its item is dispositioned
//                   NEEDS_ALI: a human must confirm the send landed. SKIPPED
//                   is a settled status, so the closure guard no longer
//                   blocks on it, but the CASE lands in FAILED from this run,
//                   so nothing auto-resolves it — only Ali's explicit close.

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

// How many times an UNVERIFIABLE action is re-checked before it is settled
// and handed to Ali. Bounded so a permanently unreachable provider cannot
// leave a case re-fetching forever on every Verify.
export const MAX_VERIFICATION_ATTEMPTS = 3;

// Every status write goes through the action state machine — including the
// two legal hops an exhausted verification takes. Kept as a helper so the
// transition is asserted in exactly one place.
async function moveAction(action: InboxCaseAction, to: ActionStatus, patch: Record<string, unknown>): Promise<void> {
  assertActionTransition(action.status, to);
  await action.update({ status: to, ...patch, updated_at: new Date() });
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
  unverifiable: number;
  exhausted: number;
  finalCaseState: string;
}

// Internal types verify by receipt alone. External types must pass the
// receipt-shape check AND the live re-fetch.
async function verifyOne(action: InboxCaseAction): Promise<VerifyOutcome> {
  if (INTERNAL_ACTION_TYPES.includes(action.action_type)) return { kind: 'verified', detail: 'internal action: receipt is the verification' };
  if (!verifyReceipt(action)) return { kind: 'missing', detail: `receipt lacks ${RECEIPT_KEY_BY_TYPE[action.action_type] ?? 'an id'}` };
  const item = action.item_id ? await InboxCaseItem.findByPk(action.item_id) : null;
  return verifyExternalEffect(action, item);
}

// On exhaustion the item gets a real disposition so the closure guard's
// every_item_dispositioned passes — and NEEDS_ALI is the truthful one: a
// human must confirm the effect landed. Never overwrites a disposition set
// by another path.
async function dispositionItemNeedsAli(action: InboxCaseAction, caseId: string, detail: string, attempts: number): Promise<void> {
  if (!action.item_id) return;
  const item = await InboxCaseItem.findOne({ where: { id: action.item_id, case_id: caseId } });
  if (!item || item.disposition) return;
  await item.update({
    disposition: 'NEEDS_ALI',
    disposition_reason: `Verification exhausted after ${attempts} attempts: ${detail}`.slice(0, 2000),
    updated_at: new Date(),
  });
}

export async function verifyCase(caseId: string, requestedBy: string): Promise<VerifyResult> {
  const caseRow = await getCaseOrThrow(caseId);
  const actions = await InboxCaseAction.findAll({ where: { case_id: caseId } });

  let verified = 0;
  let verificationFailed = 0;
  let unverifiable = 0;
  let exhausted = 0;

  for (const action of actions.filter((a) => a.status === 'SUCCEEDED')) {
    const outcome = await verifyOne(action);
    const now = new Date();

    if (outcome.kind === 'verified') {
      await moveAction(action, 'VERIFIED', { verification_status: 'VERIFIED', verified_at: now });
      verified++;
    } else if (outcome.kind === 'missing') {
      await moveAction(action, 'FAILED', { verification_status: 'VERIFICATION_FAILED', verified_at: now, error_class: 'VerificationMissing', error_message: outcome.detail });
      verificationFailed++;
    } else {
      // unverifiable: could not ask the provider. Bounded retry, then settle.
      const attempts = (action.verification_attempt_count ?? 0) + 1;
      if (attempts < MAX_VERIFICATION_ATTEMPTS) {
        await action.update({ verification_status: 'PENDING', verification_attempt_count: attempts, error_class: outcome.error_class, error_message: outcome.detail, updated_at: now });
        unverifiable++;
      } else {
        await moveAction(action, 'FAILED', { verification_status: 'VERIFICATION_FAILED', verification_attempt_count: attempts, verified_at: now, error_class: 'VerificationExhausted', error_message: outcome.detail });
        await moveAction(action, 'SKIPPED', {});
        await dispositionItemNeedsAli(action, caseId, outcome.detail, attempts);
        await logCaseEvent({
          case_id: caseId,
          action_id: action.id,
          item_id: action.item_id ?? undefined,
          event_type: 'action_verification_exhausted',
          actor_type: 'system',
          actor_id: 'case_verification_service',
          details: { attempts, action_type: action.action_type, last_error_class: outcome.error_class, detail: outcome.detail },
          correlation_id: action.correlation_id,
        });
        exhausted++;
      }
    }

    await logCaseEvent({
      case_id: caseId,
      action_id: action.id,
      event_type: 'action_verified',
      actor_type: 'system',
      actor_id: 'case_verification_service',
      details: { ok: outcome.kind === 'verified', outcome: outcome.kind, action_type: action.action_type, detail: outcome.detail },
      correlation_id: action.correlation_id,
    });

    // /inbox-zero waiting-on ledger: a verified MARK_WAITING is the moment the
    // wait officially starts. Promote the planner's follow_up_date out of the
    // action payload onto the case's queryable columns (idempotent inside).
    if (outcome.kind === 'verified') await promoteWaitingFromAction(action, caseRow);
  }

  await applyAutoDispositions(caseId, caseRow.correlation_id, actions);

  await caseRow.update({ last_verified_at: new Date(), updated_at: new Date() });

  // An exhausted verification counts as failed at the CASE level even though
  // the action itself settled as SKIPPED: the case must land in FAILED (never
  // auto-RESOLVED) so that only Ali's explicit decision can close it.
  const anyFailed = verificationFailed > 0 || exhausted > 0 || actions.some((a) => a.status === 'FAILED');
  const anyWaiting = actions.some((a) => a.action_type === 'MARK_WAITING' && ['SUCCEEDED', 'VERIFIED'].includes(a.status));
  const anyDelegated = actions.some((a) => a.action_type === 'MARK_DELEGATED' && ['SUCCEEDED', 'VERIFIED'].includes(a.status));

  let target: 'FAILED' | 'WAITING' | 'DELEGATED' | 'RESOLVED';
  if (anyFailed) target = 'FAILED';
  else if (anyWaiting) target = 'WAITING';
  else if (anyDelegated) target = 'DELEGATED';
  else target = 'RESOLVED';

  // A still-PENDING verification means an action is SUCCEEDED but unconfirmed.
  // Moving the case anywhere would either auto-resolve an unconfirmed send or
  // hide it behind WAITING; it stays in EXECUTING so the next Verify retries.
  const pendingRetry = unverifiable > 0 && !anyFailed;

  if (caseRow.state === 'EXECUTING' && !pendingRetry) {
    await transitionCase(caseId, target, {
      actor_type: 'system',
      actor_id: 'case_verification_service',
      event_type: 'case_verification_completed',
      details: { requested_by: requestedBy, verified, verification_failed: verificationFailed, target },
    });
  }

  await postCaseProgressNote(
    caseId,
    `Verification: ${verified} action(s) confirmed, ${verificationFailed} failed verification` +
      (unverifiable ? `, ${unverifiable} could not be checked yet (will retry)` : '') +
      (exhausted ? `, ${exhausted} handed to Ali after ${MAX_VERIFICATION_ATTEMPTS} failed checks` : '') +
      `. Case status: ${target}.`
  );

  return { verified, verificationFailed, unverifiable, exhausted, finalCaseState: pendingRetry ? caseRow.state : (caseRow.state === 'EXECUTING' ? target : caseRow.state) };
}
