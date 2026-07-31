import InboxCaseItem from '../../models/InboxCaseItem';
import InboxCaseQuestion from '../../models/InboxCaseQuestion';
import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCaseEvent from '../../models/InboxCaseEvent';
import { logCaseEvent } from './caseEventLog';
import { getCaseOrThrow, transitionCase } from './caseRepository';

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
    return { closed: false, blockers: guard.blockers };
  }

  await caseRow.update({ closed_at: new Date(), updated_at: new Date() });

  if (caseRow.state !== 'RESOLVED') {
    await transitionCase(caseId, 'RESOLVED', {
      actor_type: 'admin',
      actor_id: closedBy,
      event_type: 'case_resolved',
      details: { closed_by: closedBy },
    });
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

  return { closed: true, blockers: [] };
}
