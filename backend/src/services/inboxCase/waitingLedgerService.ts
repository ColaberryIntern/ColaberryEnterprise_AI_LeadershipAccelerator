import { Op } from 'sequelize';
import InboxCase from '../../models/InboxCase';
import InboxCaseAction from '../../models/InboxCaseAction';
import { logCaseEvent } from './caseEventLog';

// Waiting-on ledger: what OTHER people owe Ali, and when it went stale.
//
// Before this file, the planner computed a follow-up date for every
// MARK_WAITING action (caseActionPlanner.ts buildWaitingActions) and buried
// it in the action's payload JSONB and its preview string. Nothing read it
// back. "Waiting on someone" was therefore a state the engine could enter
// but never query, so a promise that slipped was invisible until Ali opened
// the case by hand. This service promotes that payload onto the two
// queryable columns T2 added (inbox_cases.waiting_since, sla_due_at) at the
// moment the MARK_WAITING action verifies, and exposes the two reads the
// /inbox-zero console needs: everything waiting, and everything overdue.
//
// The mirror image — what ALI owes others — is deliberately not here; that
// is the commitment ledger (T8), which the planner used to discard.

const SERVICE = 'waitingLedgerService';

export interface WaitingPromotion {
  promoted: boolean;
  reason: 'promoted' | 'not_mark_waiting' | 'already_waiting' | 'no_follow_up_date';
}

/**
 * Parse the planner's `follow_up_date` (YYYY-MM-DD) into the instant the
 * item becomes stale: the START of that day, UTC. Start rather than end so
 * a follow-up "due Friday" surfaces first thing Friday, not at midnight
 * Saturday. Returns null for anything unparseable rather than guessing.
 */
export function followUpDateToDueAt(followUpDate: unknown): Date | null {
  if (typeof followUpDate !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(followUpDate.trim());
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(y, mo - 1, day));
  // Date.UTC silently rolls an out-of-range month/day forward ("2026-13-40"
  // becomes 2027-02-09), so round-trip the fields to reject that.
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Called by the verifier once a MARK_WAITING action has verified. Writes
 * waiting_since (when the wait began) and sla_due_at (when it goes stale)
 * onto the case. Idempotent: a case that is already waiting keeps its
 * original waiting_since — re-running Verify must not make a stale wait
 * look fresh.
 */
export async function promoteWaitingFromAction(action: InboxCaseAction, caseRow: InboxCase): Promise<WaitingPromotion> {
  if (action.action_type !== 'MARK_WAITING') return { promoted: false, reason: 'not_mark_waiting' };
  if (caseRow.waiting_since) return { promoted: false, reason: 'already_waiting' };

  const payload = (action.payload ?? {}) as Record<string, unknown>;
  const dueAt = followUpDateToDueAt(payload.follow_up_date);
  if (!dueAt) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        service: SERVICE,
        event: 'waiting_promotion_skipped',
        outcome: 'partial',
        error_class: 'ValidationError',
        context: { case_id: caseRow.id, action_id: action.id, reason: 'no_follow_up_date' },
      }),
    );
    return { promoted: false, reason: 'no_follow_up_date' };
  }

  const waitingSince = action.verified_at ?? new Date();
  await caseRow.update({ waiting_since: waitingSince, sla_due_at: dueAt, updated_at: new Date() });

  await logCaseEvent({
    case_id: caseRow.id,
    action_id: action.id,
    event_type: 'case_waiting_promoted',
    actor_type: 'system',
    actor_id: SERVICE,
    details: {
      owner: payload.owner ?? null,
      waiting_since: waitingSince.toISOString(),
      sla_due_at: dueAt.toISOString(),
    },
    correlation_id: caseRow.correlation_id,
  });

  return { promoted: true, reason: 'promoted' };
}

/** Every open case currently waiting on someone else, oldest wait first. */
export async function listWaiting(): Promise<InboxCase[]> {
  return InboxCase.findAll({
    where: { state: 'WAITING', waiting_since: { [Op.ne]: null } } as any, // `as any`: Op-keyed where is not expressible in this model's WhereOptions typing (same as caseRepository)
    order: [['waiting_since', 'ASC']],
  });
}

/**
 * Waiting cases whose follow-up date has passed as of `asOf`. These are the
 * ones the console must resurface: the other party has gone quiet past the
 * point Ali said he would chase.
 */
export async function listStaleWaiting(asOf: Date = new Date()): Promise<InboxCase[]> {
  return InboxCase.findAll({
    where: { state: 'WAITING', sla_due_at: { [Op.lt]: asOf } } as any, // see listWaiting
    order: [['sla_due_at', 'ASC']],
  });
}
