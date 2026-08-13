import {
  ensureAgentTicketForRoom,
  logAgentExchangeActivity,
  snippet,
} from '../agentBlueprint/agentTicketLinkService';
import { getReeseAdminUserId } from './reeseIdentitySeed';
import { resolveStudentDisplayName } from './resolveStudentDisplayName';

// Reese Phase 1 — ProofDesk integration (the core requirement: Ali must be able
// to see the ticket, who Reese is talking to, why, and follow up over time).
//
// Reese Phase 3 (Agent Blueprint) — the ensure-ticket-for-room + log-exchange-activity
// core now lives in backend/src/services/agentBlueprint/agentTicketLinkService.ts as a
// generic module any future agent can call. Reese is that module's first caller —
// this file is now a thin wrapper supplying Reese's own title/description/type/
// intent-prefix. Every exported name/signature below is UNCHANGED from before the
// extraction; only the implementation moved.
//
// Idempotency: see agentTicketLinkService.ts's header comment — unchanged from before.

export async function ensureReeseTicketForRoom(
  roomId: string,
  studentEnrollmentId: string,
  firstMessageContent: string,
): Promise<{ id: string }> {
  const reeseAdminUserId = await getReeseAdminUserId();
  // Real student name, never the raw enrollmentId, in human-facing text (Ali's
  // live feedback: "reporting the id of the user is not helpful"). entity_id
  // below is the roomId (unaffected — this ticket was never keyed on the
  // enrollmentId to begin with).
  const studentName = await resolveStudentDisplayName(studentEnrollmentId);

  return ensureAgentTicketForRoom({
    roomId,
    agentAdminUserId: reeseAdminUserId,
    agentLabel: 'Reese',
    title: `Student support — DM conversation (${studentName})`,
    description:
      `Reese is in a direct-message conversation with ${studentName}. ` +
      `Opening message: "${snippet(firstMessageContent)}"`,
    type: 'student_support',
    entityType: 'community_room',
  });
}

/**
 * Logs one side of an exchange (a student message OR a Reese reply) onto the
 * room's ticket. See agentTicketLinkService.ts's logAgentExchangeActivity() for the
 * shared mechanic — this wrapper supplies Reese's own 'reese' intent-prefix and
 * 'student_support' domain.
 */
export async function logReeseExchangeActivity(
  ticketId: string,
  actorType: 'human' | 'ai_staff',
  actorId: string,
  messageId: string,
  content: string,
): Promise<void> {
  return logAgentExchangeActivity(ticketId, actorType, actorId, messageId, content, 'reese', 'student_support');
}
