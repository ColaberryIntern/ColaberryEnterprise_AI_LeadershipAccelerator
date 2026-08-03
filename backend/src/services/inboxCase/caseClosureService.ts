import InboxCaseItem from '../../models/InboxCaseItem';
import InboxCaseQuestion from '../../models/InboxCaseQuestion';
import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCaseEvent from '../../models/InboxCaseEvent';
import { logCaseEvent } from './caseEventLog';
import { getCaseOrThrow, transitionCase } from './caseRepository';
import { postCaseProgressNote } from './caseTicketService';
import { rejectAction } from './caseApprovalService';

// Closure guard (root directive section 9). Blocks closure and returns
// EXACTLY what remains — never a generic "cannot close" with no
// explanation. All 10 directive conditions are checked; a case only closes
// when every one passes.

export interface ClosureBlocker {
  condition: string;
  detail: string;
}

export interface ClosureGuardResult {
  canClose: boolean;
  blockers: ClosureBlocker[];
}

export async function evaluateClosureGuard(caseId: string): Promise<ClosureGuardResult> {
  const blockers: ClosureBlocker[] = [];
  const [items, questions, actions, events] = await Promise.all([
    InboxCaseItem.findAll({ where: { case_id: caseId } }),
    InboxCaseQuestion.findAll({ where: { case_id: caseId } }),
    InboxCaseAction.findAll({ where: { case_id: caseId } }),
    InboxCaseEvent.findAll({ where: { case_id: caseId } }),
  ]);

  // 1 & 8. Every non-excluded item has a disposition; no unresolved
  // high-confidence candidate remains.
  const undispositioned = items.filter((i) => i.inclusion_status !== 'EXCLUDED' && !i.disposition);
  if (undispositioned.length > 0) {
    blockers.push({
      condition: 'every_item_dispositioned',
      detail: `${undispositioned.length} item(s) still have no disposition: ${undispositioned.map((i) => i.title).slice(0, 5).join('; ')}`,
    });
  }

  // 2. Every blocking question answered.
  const openQuestions = questions.filter((q) => q.status === 'OPEN');
  if (openQuestions.length > 0) {
    blockers.push({
      condition: 'all_questions_answered',
      detail: `${openQuestions.length} question(s) still open: ${openQuestions.map((q) => q.question).slice(0, 5).join('; ')}`,
    });
  }

  // 3. Every action approved, rejected, or skipped — none left PROPOSED.
  const stillProposed = actions.filter((a) => a.status === 'PROPOSED');
  if (stillProposed.length > 0) {
    blockers.push({
      condition: 'no_actions_left_proposed',
      detail: `${stillProposed.length} action(s) still awaiting an approve/reject decision`,
    });
  }

  // 4. Every approved external action has succeeded (none stuck at APPROVED
  // or EXECUTING — execute() should have moved them forward).
  const stuckApprovedOrExecuting = actions.filter((a) => a.status === 'APPROVED' || a.status === 'EXECUTING');
  if (stuckApprovedOrExecuting.length > 0) {
    blockers.push({
      condition: 'all_approved_actions_executed',
      detail: `${stuckApprovedOrExecuting.length} approved action(s) have not finished executing — run Execute again`,
    });
  }

  // 5. Every succeeded action has been verified.
  const unverifiedSucceeded = actions.filter((a) => a.status === 'SUCCEEDED');
  if (unverifiedSucceeded.length > 0) {
    blockers.push({
      condition: 'all_actions_verified',
      detail: `${unverifiedSucceeded.length} succeeded action(s) have not been verified — run Verify again`,
    });
  }

  // A FAILED action must never be silently treated as resolved.
  const anyFailed = actions.some((a) => a.status === 'FAILED');
  if (anyFailed) {
    blockers.push({ condition: 'no_failed_actions', detail: 'At least one action failed and has not been retried or skipped with a reason' });
  }

  // 6. Waiting items have an owner + follow-up date on record.
  const waitingWithoutOwner = items.filter((i) => i.disposition === 'WAITING' && !i.disposition_reason);
  if (waitingWithoutOwner.length > 0) {
    blockers.push({
      condition: 'waiting_items_have_owner_and_followup',
      detail: `${waitingWithoutOwner.length} WAITING item(s) have no owner/follow-up recorded in disposition_reason`,
    });
  }

  // 7. Delegated items have a Basecamp owner + source link.
  const delegatedWithoutLink = items.filter((i) => i.disposition === 'DELEGATED' && (!i.disposition_reason || !i.source_url));
  if (delegatedWithoutLink.length > 0) {
    blockers.push({
      condition: 'delegated_items_have_owner_and_link',
      detail: `${delegatedWithoutLink.length} DELEGATED item(s) are missing an owner note or a Basecamp source link`,
    });
  }

  // 9. The audit event chain is non-empty (a case with zero events was
  // never really opened through the normal flow).
  if (events.length === 0) {
    blockers.push({ condition: 'audit_chain_present', detail: 'No audit events recorded for this case' });
  }

  return { canClose: blockers.length === 0, blockers };
}

export interface CloseCaseResult {
  closed: boolean;
  blockers: ClosureBlocker[];
}

export async function closeCase(caseId: string, closedBy: string): Promise<CloseCaseResult> {
  const caseRow = await getCaseOrThrow(caseId);
  const guard = await evaluateClosureGuard(caseId);

  if (!guard.canClose) {
    await logCaseEvent({
      case_id: caseId,
      event_type: 'closure_blocked',
      actor_type: 'admin',
      actor_id: closedBy,
      details: { blockers: guard.blockers },
      correlation_id: caseRow.correlation_id,
    });
    await postCaseProgressNote(
      caseId,
      `Close blocked — ${guard.blockers.length} item(s) still remaining: ${guard.blockers.map((b) => b.detail).join(' | ')}`
    );
    return { closed: false, blockers: guard.blockers };
  }

  // Attempt the state transition BEFORE stamping closed_at — every other
  // guard condition can pass on a case that's still in DISCOVERING/
  // ASSESSING/NEEDS_ALI/READY_TO_PLAN/AWAITING_APPROVAL (e.g. a fresh
  // auto-synced case with a single, already-dispositioned item, never
  // assessed or planned): only EXECUTING/WAITING/DELEGATED have a legal
  // path to RESOLVED (types/inboxCase.ts's CASE_STATE_TRANSITIONS). A case
  // in one of those other states genuinely cannot close directly — that is
  // reported back as a real blocker, not an uncaught exception, and
  // closed_at is never set on a case that didn't actually resolve
  // (no partial commit).
  if (caseRow.state !== 'RESOLVED') {
    try {
      await transitionCase(caseId, 'RESOLVED', {
        actor_type: 'admin',
        actor_id: closedBy,
        event_type: 'case_resolved',
        details: { closed_by: closedBy },
      });
    } catch (err: any) {
      if (err?.name === 'InvalidCaseTransitionError') {
        const blocker: ClosureBlocker = {
          condition: 'case_not_in_closable_state',
          detail: `Case is in ${caseRow.state} state, which cannot close directly — it needs to go through Execute and Verify first.`,
        };
        await logCaseEvent({
          case_id: caseId,
          event_type: 'closure_blocked',
          actor_type: 'admin',
          actor_id: closedBy,
          details: { blockers: [blocker] },
          correlation_id: caseRow.correlation_id,
        });
        return { closed: false, blockers: [blocker] };
      }
      throw err;
    }
  } else {
    await logCaseEvent({
      case_id: caseId,
      event_type: 'case_resolved',
      actor_type: 'admin',
      actor_id: closedBy,
      details: { closed_by: closedBy, already_resolved: true },
      correlation_id: caseRow.correlation_id,
    });
  }

  await caseRow.update({ closed_at: new Date(), updated_at: new Date() });
  await postCaseProgressNote(caseId, `Case closed by ${closedBy}. All closure conditions met.`);

  return { closed: true, blockers: [] };
}

// One-click "not worth responding to" dismissal from the case list, per
// Ali's request — clears every blocker this system can SAFELY clear
// without ever touching an external side effect that already happened or
// is in flight, then defers to closeCase()'s own real guard for the final
// answer. Never claims success it didn't achieve: a case with a genuinely
// in-flight (EXECUTING) or unverified (SUCCEEDED) action is left exactly
// as-is and reported back via the normal blocker list, since the action
// state machine has no legal transition away from those statuses — this
// is a real limit, not an oversight (see the ACTION_STATE_TRANSITIONS
// check inside rejectAction()/assertActionTransition()).
export async function dismissCase(caseId: string, requestedBy: string): Promise<CloseCaseResult> {
  const caseRow = await getCaseOrThrow(caseId);
  const [questions, actions, items] = await Promise.all([
    InboxCaseQuestion.findAll({ where: { case_id: caseId, status: 'OPEN' } }),
    InboxCaseAction.findAll({ where: { case_id: caseId } }),
    InboxCaseItem.findAll({ where: { case_id: caseId } }),
  ]);

  for (const question of questions) {
    await question.update({ status: 'SKIPPED', updated_at: new Date() });
  }

  // Only PROPOSED and APPROVED have a legal transition to REJECTED — an
  // action already EXECUTING, SUCCEEDED, or FAILED represents real
  // external work already in motion or completed, and force-closing over
  // that would hide a genuine problem rather than dismiss a non-issue.
  const clearableActions = actions.filter((a) => a.status === 'PROPOSED' || a.status === 'APPROVED');
  for (const action of clearableActions) {
    try {
      await rejectAction(caseId, action.id, requestedBy, 'Dismissed by Ali');
    } catch (err: any) {
      console.error(`[InboxCase] Dismiss failed to reject action ${action.id}: ${err?.message}`);
    }
  }

  const undispositionedItems = items.filter((i) => i.disposition === null && i.inclusion_status !== 'EXCLUDED');
  for (const item of undispositionedItems) {
    await item.update({ disposition: 'NO_ACTION', disposition_reason: 'Dismissed by Ali — not worth responding to.', updated_at: new Date() });
  }

  await logCaseEvent({
    case_id: caseId,
    event_type: 'case_dismissed',
    actor_type: 'admin',
    actor_id: requestedBy,
    details: { questions_skipped: questions.length, actions_rejected: clearableActions.length, items_dispositioned: undispositionedItems.length },
    correlation_id: caseRow.correlation_id,
  });

  return closeCase(caseId, requestedBy);
}
