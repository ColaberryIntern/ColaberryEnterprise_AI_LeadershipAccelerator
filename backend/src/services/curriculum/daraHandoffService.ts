import { createTicket } from '../ticketService';
import { resolveStudentDisplayName } from '../reese/resolveStudentDisplayName';
import { snippet } from '../agentBlueprint/agentTicketLinkService';
import { createBasecampTodoForHandoff } from './daraBasecampGatewayService';

/**
 * Dara v2 Phase 4 — mandatory inter-agent ticket handoff ("never off-ledger").
 *
 * Every real escalation gets its OWN standalone `agent_handoff` ticket, not
 * just a comment on the room's ongoing `curriculum_support` conversation
 * ticket (Phase 3's `daraTicketLinkService.ts`) — so it is independently
 * trackable, assignable, and visible regardless of what happens to the
 * conversation itself. Today the only real recipient is Dara's own
 * reports_to human (Swati) — Phase 1's discovery found no AI employee has a
 * matching capability to hand off TO yet; this is deliberately built as
 * agent-name-agnostic (the ticket has no hardcoded recipient beyond the
 * standard reports_to resolution) so a future real recipient agent doesn't
 * require redesigning this mechanism.
 *
 * Dedup key: `entity_type: 'room_message'` / `entity_id: <the triggering
 * message id>` — a stable, real key (directives/register-ticket-creating-
 * agent.md's "never a per-cycle value" rule). If the SAME triggering message
 * somehow escalates twice (a retried tool call), it dedupes to the same
 * ticket; a different message escalating a different, later question creates
 * a genuinely new one — each real question is its own unit of work.
 *
 * No recurring resolver: an agent_handoff ticket has no automated
 * terminal-state signal (see validateAgentTicketStandard.ts's
 * AGENT_TICKET_RESOLVER_REGISTRY entry for Dara) — it stays open until a
 * human actually resolves it. Never closed by elapsed time.
 *
 * Phase 7 activation (Ali, 2026-09-17, "keep moving fwd") — every real
 * handoff now also attempts a real Basecamp todo (Phase 6's gateway,
 * Phase 7's CB System identity) as a secondary, best-effort notification in
 * the tool a human actually checks day to day. The internal ticket above is
 * the one guarantee ("never off-ledger") — the Basecamp echo is additive and
 * its own failure (or the gateway simply being unconfigured) never blocks or
 * un-does the real ticket already created; `createBasecampTodoForHandoff()`
 * never throws, by its own contract.
 */
export interface DaraHandoffResult {
  id: string;
  basecampTodoUrl?: string;
}

export async function createDaraHandoff(
  daraAdminUserId: string,
  studentEnrollmentId: string,
  reason: string,
  conversationTicketId: string | null,
  triggeringMessageId: string,
): Promise<DaraHandoffResult> {
  const studentName = await resolveStudentDisplayName(studentEnrollmentId);
  const cleanReason = snippet((reason || "Outside Dara's curriculum/certification scope.").trim());
  const title = `Curriculum handoff — ${studentName} (needs a human)`;

  const ticket = await createTicket({
    title,
    description:
      `Dara escalated a real-time conversation with ${studentName}: ${cleanReason}` +
      (conversationTicketId ? `\n\nSee the ongoing conversation ticket for full context.` : ''),
    type: 'agent_handoff',
    priority: 'high',
    created_by_type: 'ai_staff',
    created_by_id: daraAdminUserId,
    parent_ticket_id: conversationTicketId,
    entity_type: 'room_message',
    entity_id: triggeringMessageId,
  });

  const basecampResult = await createBasecampTodoForHandoff(ticket.id, title, studentName, cleanReason);

  return { id: ticket.id, basecampTodoUrl: basecampResult.basecampAppUrl };
}
