import {
  ensureAgentTicketForRoom,
  logAgentExchangeActivity,
  snippet,
} from '../agentBlueprint/agentTicketLinkService';
import { getDaraAdminUserId } from './daraIdentitySeed';
import { resolveStudentDisplayName } from '../reese/resolveStudentDisplayName';

// Dara v2 Phase 3 — ProofDesk integration, same requirement Reese's own
// ticket-linkage exists for: Swati must be able to see the ticket, who Dara
// is talking to, why, and follow up over time. Thin wrapper over the generic
// agentTicketLinkService.ts core (Reese is that module's first caller; this
// is its second), supplying Dara's own title/description/type.
//
// Idempotency: see agentTicketLinkService.ts's header comment — createTicket()
// dedupes on (entity_type, entity_id, type) against any non-terminal ticket,
// so this is safe to call on every message in the room.

export async function ensureDaraTicketForRoom(
  roomId: string,
  studentEnrollmentId: string,
  firstMessageContent: string,
): Promise<{ id: string }> {
  const daraAdminUserId = await getDaraAdminUserId();
  const studentName = await resolveStudentDisplayName(studentEnrollmentId);

  return ensureAgentTicketForRoom({
    roomId,
    agentAdminUserId: daraAdminUserId,
    agentLabel: 'Dara',
    title: `Curriculum support — DM conversation (${studentName})`,
    description:
      `Dara is in a direct-message conversation with ${studentName}. ` +
      `Opening message: "${snippet(firstMessageContent)}"`,
    type: 'curriculum_support',
    entityType: 'community_room',
  });
}

/**
 * Logs one side of an exchange (a student message OR a Dara reply) onto the
 * room's ticket. See agentTicketLinkService.ts's logAgentExchangeActivity()
 * for the shared mechanic — this wrapper supplies Dara's own 'dara'
 * intent-prefix and 'curriculum_support' domain.
 */
export async function logDaraExchangeActivity(
  ticketId: string,
  actorType: 'human' | 'ai_staff',
  actorId: string,
  messageId: string,
  content: string,
): Promise<void> {
  return logAgentExchangeActivity(ticketId, actorType, actorId, messageId, content, 'dara', 'curriculum_support');
}
