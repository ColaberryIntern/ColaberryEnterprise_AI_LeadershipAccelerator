import crypto from 'crypto';
import { createTicket, addTicketComment } from '../ticketService';
import { emitEvent } from '../workLedger/workLedgerService';
import { getReeseAdminUserId } from './reeseIdentitySeed';

// Reese Phase 1 — ProofDesk integration (the core requirement: Ali must be able
// to see the ticket, who Reese is talking to, why, and follow up over time).
//
// Idempotency: ensureReeseTicketForRoom() is safe to call on EVERY message in a
// Reese DM room. ticketService.createTicket() already dedupes on
// (entity_type, entity_id, type) against any non-terminal ticket — the first
// call creates a ticket, every later call for the SAME room returns the SAME
// ticket (no duplicate), which is exactly "first message creates a ticket,
// second message in the existing thread updates the same ticket." If a ticket
// is ever closed ('done'/'cancelled'), the NEXT message starts a fresh ticket —
// a deliberate choice: closure means the story arc concluded; new contact is
// new work, not a reopen of old work. The DM's own message history (RoomMessage)
// is unaffected either way — nothing here ever loses conversation content.
const MAX_SNIPPET = 300;
function snippet(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > MAX_SNIPPET ? trimmed.slice(0, MAX_SNIPPET) + '…' : trimmed;
}

export async function ensureReeseTicketForRoom(
  roomId: string,
  studentEnrollmentId: string,
  firstMessageContent: string,
): Promise<{ id: string }> {
  const reeseAdminUserId = await getReeseAdminUserId();
  if (!reeseAdminUserId) {
    throw new Error('[Reese] ensureReeseTicketForRoom() called before Reese\'s AdminUser identity was seeded.');
  }

  return createTicket({
    title: `Student support — DM conversation (${studentEnrollmentId})`,
    description:
      `Reese is in a direct-message conversation with student enrollment ` +
      `${studentEnrollmentId}. Opening message: "${snippet(firstMessageContent)}"`,
    type: 'student_support',
    created_by_type: 'ai_staff',
    created_by_id: reeseAdminUserId,
    assigned_to_type: 'ai_staff',
    assigned_to_id: reeseAdminUserId,
    entity_type: 'community_room',
    entity_id: roomId,
  });
}

/**
 * Logs one side of an exchange (a student message OR a Reese reply) onto the
 * room's ticket: a human-readable TicketActivity comment (Story tab) plus a
 * work-ledger event (Technical tab). Never throws — a logging failure must
 * never break message delivery, which has already happened by the time this
 * is called.
 */
export async function logReeseExchangeActivity(
  ticketId: string,
  actorType: 'human' | 'ai_staff',
  actorId: string,
  messageId: string,
  content: string,
): Promise<void> {
  try {
    await addTicketComment(ticketId, snippet(content), actorType, actorId);
    await emitEvent({
      ticketId,
      traceId: crypto.randomUUID(),
      actorType,
      actorId,
      intent: actorType === 'ai_staff' ? 'reese.reply' : 'reese.student_message',
      domain: 'student_support',
      actionClass: 'dm_message',
      targetType: 'ticket',
      targetId: ticketId,
      idempotencyKey: `reese-exchange:${messageId}`,
      result: 'success',
      sourceRecordType: 'room_message',
      sourceRecordId: messageId,
    });
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'reese', event: 'ticket_link_failed',
      ticket_id: ticketId, message_id: messageId,
      error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
  }
}
