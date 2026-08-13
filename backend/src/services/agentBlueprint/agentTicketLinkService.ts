import crypto from 'crypto';
import { createTicket, addTicketComment } from '../ticketService';
import { emitEvent } from '../workLedger/workLedgerService';
import type { TicketType, TicketActorType } from '../../models/Ticket';

// Reese Phase 3 (Agent Blueprint) — the ensure-ticket-for-room + log-exchange-activity
// ProofDesk-linkage core, extracted from Reese Phase 1's reeseTicketLinkService.ts so
// the NEXT platform agent doesn't re-derive this shape from scratch. Reese is the
// first caller of this generic module (see
// backend/src/services/reese/reeseTicketLinkService.ts), refactored to delegate here
// with zero behavior change.
//
// Idempotency: ensureAgentTicketForRoom() is safe to call on EVERY message in an
// agent's DM/conversation room. ticketService.createTicket() already dedupes on
// (entity_type, entity_id, type) against any non-terminal ticket — the first call
// creates a ticket, every later call for the SAME room returns the SAME ticket (no
// duplicate). If a ticket is ever closed ('done'/'cancelled'), the NEXT message
// starts a fresh ticket — closure means the story arc concluded; new contact is new
// work, not a reopen of old work.

export const MAX_SNIPPET = 300;

export function snippet(content: string, maxLen: number = MAX_SNIPPET): string {
  const trimmed = content.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + '…' : trimmed;
}

export interface EnsureAgentTicketForRoomInput {
  roomId: string;
  /** The agent's own AdminUser id (from getAgentAdminUserId()). Null throws — see below. */
  agentAdminUserId: string | null;
  /** Used only in the not-seeded-yet error message, e.g. 'Reese' or 'CurriculumQA'. */
  agentLabel: string;
  title: string;
  description: string;
  type: TicketType;
  entityType: string;
}

export async function ensureAgentTicketForRoom(
  input: EnsureAgentTicketForRoomInput,
): Promise<{ id: string }> {
  if (!input.agentAdminUserId) {
    throw new Error(
      `[${input.agentLabel}] ensureAgentTicketForRoom() called before ${input.agentLabel}'s AdminUser identity was seeded.`,
    );
  }

  return createTicket({
    title: input.title,
    description: input.description,
    type: input.type,
    created_by_type: 'ai_staff',
    created_by_id: input.agentAdminUserId,
    assigned_to_type: 'ai_staff',
    assigned_to_id: input.agentAdminUserId,
    entity_type: input.entityType,
    entity_id: input.roomId,
  });
}

/**
 * Logs one side of an exchange (a human message OR an agent reply) onto the room's
 * ticket: a human-readable TicketActivity comment (Story tab) plus a work-ledger
 * event (Technical tab). Never throws — a logging failure must never break message
 * delivery, which has already happened by the time this is called.
 *
 * `intentPrefix` namespaces the ledger event intent (e.g. 'reese' produces
 * 'reese.reply' / 'reese.student_message'); `domain` is the work-ledger domain
 * (e.g. 'student_support').
 */
export async function logAgentExchangeActivity(
  ticketId: string,
  actorType: TicketActorType,
  actorId: string,
  messageId: string,
  content: string,
  intentPrefix: string,
  domain: string,
): Promise<void> {
  try {
    await addTicketComment(ticketId, snippet(content), actorType, actorId);
    await emitEvent({
      ticketId,
      traceId: crypto.randomUUID(),
      actorType,
      actorId,
      intent: actorType === 'ai_staff' ? `${intentPrefix}.reply` : `${intentPrefix}.student_message`,
      domain,
      actionClass: 'dm_message',
      targetType: 'ticket',
      targetId: ticketId,
      idempotencyKey: `${intentPrefix}-exchange:${messageId}`,
      result: 'success',
      sourceRecordType: 'room_message',
      sourceRecordId: messageId,
    });
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: intentPrefix, event: 'ticket_link_failed',
      ticket_id: ticketId, message_id: messageId,
      error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
  }
}
