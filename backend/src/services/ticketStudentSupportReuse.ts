import crypto from 'crypto';
import { Ticket, TicketActivity } from '../models';
import { emitLedgerEventSafe } from './workLedger/emitLedgerEventSafe';
import type { CreateTicketData } from './ticketService';

// "Tickets should combine conversations if it's with the same person. One
// ticket per person per hour." (Ali, live feedback.) Applies ONLY to
// student_support tickets — every other ticket type (task/bug/agent_action/
// reese_autonomous_outreach/etc.) keeps createTicket()'s original,
// unbounded-while-open dedup unchanged. Reese's autonomous-outreach cadence
// (7-day cap, reeseAutonomousOutreachService.ts) is a deliberately different,
// already-correct rule on a disjoint entity_type — this module must never
// widen to cover it.
//
// Extracted into its own file (T009, ticket-ux-fixes run) rather than left
// inline in ticketService.ts, per CLAUDE.md's Modular Composition Rule (file/
// function size ceilings — the change that would have pushed createTicket()
// and ticketService.ts over their hard ceilings is the one required to split
// it). Imports `CreateTicketData` as a type-only import specifically so this
// file can depend on ticketService.ts's type surface without creating a
// runtime circular import back into it — `emitLedgerEventSafe` was pulled out
// to its own module for the same reason (the "missing third module C" a real
// two-way dependency between this file and ticketService.ts would otherwise need).

const STUDENT_SUPPORT_REUSE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Deliberate, narrow bypass of ticketService.ts's VALID_TRANSITIONS state
 * machine (done/cancelled are terminal there): new student activity within
 * the hour reopens a closed conversation rather than starting a duplicate
 * thread. Logged as a real activity + ledger event, same shape as
 * updateTicketStatus()'s own transitions, so this is never a silent status
 * change.
 */
async function reopenStudentSupportTicket(ticket: Ticket, data: CreateTicketData): Promise<void> {
  const fromStatus = ticket.status;
  await ticket.update({ status: 'todo', updated_at: new Date() });
  const activity = await TicketActivity.create({
    ticket_id: ticket.id,
    actor_type: data.created_by_type,
    actor_id: data.created_by_id,
    action: 'reopened',
    from_value: fromStatus,
    to_value: 'todo',
    comment: 'Reopened — new student activity within the 1-hour reuse window.',
  });
  await emitLedgerEventSafe({
    ticketId: ticket.id,
    traceId: crypto.randomUUID(),
    actorType: data.created_by_type,
    actorId: data.created_by_id,
    intent: 'ticket.reopened',
    domain: 'tickets',
    actionClass: 'status_change',
    targetType: 'ticket',
    targetId: ticket.id,
    idempotencyKey: `ticket-reopened:${activity.id}`,
    result: 'success',
    beforeStateRef: fromStatus,
    afterStateRef: 'todo',
    sourceRecordType: 'ticket_activity',
    sourceRecordId: activity.id,
  });
}

/**
 * The student_support half of createTicket()'s dedup/reuse decision. Returns
 * the ticket to reuse (reopening it first if it was closed), or null if none
 * qualifies and the caller should fall through to creating a fresh one.
 */
export async function tryReuseStudentSupportTicket(data: CreateTicketData): Promise<Ticket | null> {
  if (!data.entity_type || !data.entity_id) return null;

  const mostRecent = await Ticket.findOne({
    where: { entity_type: data.entity_type, entity_id: data.entity_id, type: 'student_support' },
    order: [['updated_at', 'DESC']],
  });
  if (!mostRecent) return null;

  const lastActivity = mostRecent.updated_at ?? mostRecent.created_at;
  const withinHour = Boolean(lastActivity) && Date.now() - new Date(lastActivity).getTime() <= STUDENT_SUPPORT_REUSE_WINDOW_MS;
  // More than an hour since this student's last activity — the caller starts
  // a fresh ticket rather than reopening an old, possibly-stale one indefinitely.
  if (!withinHour) return null;

  if (mostRecent.status === 'done' || mostRecent.status === 'cancelled') {
    await reopenStudentSupportTicket(mostRecent, data);
  } else {
    // Already open — no status change needed, but this call itself IS the
    // "new activity" (createTicket is invoked on every incoming student
    // message via ensureReeseTicketForRoom), so bump updated_at here rather
    // than relying solely on the caller's own follow-up comment write. Keeps
    // the reuse rule's own "last activity" bookkeeping correct even if a
    // future caller doesn't immediately log an activity.
    await mostRecent.update({ updated_at: new Date() });
  }
  return mostRecent;
}
