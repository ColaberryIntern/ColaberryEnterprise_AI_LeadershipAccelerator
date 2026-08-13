import OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import RoomMembership from '../../models/RoomMembership';
import RoomMessage from '../../models/RoomMessage';
import { getReeseEnrollmentId, getReeseAdminUserId } from './reeseIdentitySeed';
import { buildReeseSystemPrompt } from './reeseSystemPrompt';
import { ensureReeseTicketForRoom, logReeseExchangeActivity } from './reeseTicketLinkService';

// Reese Phase 1 — the ONLY place Reese-authored DM content is ever produced.
// Reactive, guarded, never proactive:
//   1. Fires ONLY from dmService.ts's sendDmMessage(), i.e. only in direct
//      response to a real inbound RoomMessage that was just persisted.
//   2. Loop guard: if the SENDER of that inbound message is Reese's own
//      identity, this immediately no-ops — Reese's own messages can never
//      retrigger a reply. This is what makes an autonomous send-loop
//      structurally impossible, not just policy.
//   3. Scope guard: if Reese is not a member of the room, this no-ops — no
//      cost, no LLM call, for any conversation that isn't actually with Reese.
//   4. There is no scheduler, cron, or risk-signal call site anywhere that
//      calls this module — see T014's grep-evidence regression sweep.
// Reuses mentorService.ts's LLM-call plumbing pattern (getInstrumentedOpenAI,
// same model env var) rather than a new client.

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = getInstrumentedOpenAI({ workflow_id: 'reese' });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const HISTORY_LIMIT = 20;

/**
 * Called after a message is successfully persisted into a DM room. Builds
 * Reese's reply (if this is actually a Reese DM and the sender isn't Reese)
 * and posts it back through the identical sendDmMessage() path a human uses.
 * Never throws — a reply-generation failure must never break the student's own
 * send request (same fail-open-but-logged posture as emitLedgerEventSafe()).
 */
export async function maybeTriggerReeseReply(roomId: string, senderEnrollmentId: string): Promise<void> {
  try {
    const reeseEnrollmentId = await getReeseEnrollmentId();
    if (!reeseEnrollmentId) return; // identity not seeded yet — nothing to reply as

    // Loop guard — MUST be checked before anything else touches the network
    // or the DB beyond the id lookup above.
    if (senderEnrollmentId === reeseEnrollmentId) return;

    const reeseMembership = await RoomMembership.findOne({
      where: { room_id: roomId, enrollment_id: reeseEnrollmentId, access_state: 'active' },
    });
    if (!reeseMembership) return; // not a conversation with Reese — no-op

    const recent = await RoomMessage.findAll({
      where: { room_id: roomId, deleted_at: null },
      order: [['created_at', 'DESC']],
      limit: HISTORY_LIMIT,
    });
    const triggeringMessage = recent[0]; // newest = the message that just fired this hook
    const ordered = recent.slice().reverse();

    // ProofDesk linkage — every conversation with Reese is backed by a real
    // ticket. Idempotent: createTicket() dedupes on (entity_type, entity_id,
    // type) so this is safe to call on every message (see
    // reeseTicketLinkService.ts's header comment). Ticket-linking failures are
    // swallowed inside logReese*/ensureReese* themselves where reasonable, but
    // this whole function is also wrapped in try/catch, so a ticket-layer
    // problem never blocks the reply itself.
    let ticketId: string | null = null;
    if (triggeringMessage) {
      try {
        const ticket = await ensureReeseTicketForRoom(roomId, senderEnrollmentId, triggeringMessage.content);
        ticketId = ticket.id;
        await logReeseExchangeActivity(
          ticketId, 'human', senderEnrollmentId, triggeringMessage.id, triggeringMessage.content,
        );
      } catch (e: any) {
        console.warn(JSON.stringify({
          level: 'warn', service: 'reese', event: 'ticket_ensure_failed',
          room_id: roomId, error_class: e?.name || 'Error', message: String(e?.message || e),
        }));
      }
    }

    const systemPrompt = await buildReeseSystemPrompt(senderEnrollmentId);
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...ordered.map((m) => ({
        role: (m.enrollment_id === reeseEnrollmentId ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
    ];

    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 500,
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) return;

    // Dynamic import breaks the dmService.ts <-> reeseReplyService.ts circular
    // dependency (dmService calls this module; this module posts back through
    // dmService's own sendDmMessage) — same lazy-import convention already used
    // elsewhere in this codebase (e.g. mentorService.ts's MiniSection import).
    const { sendDmMessage } = await import('../communityRooms/dmService');
    const replyMessage = await sendDmMessage(
      { enrollmentId: reeseEnrollmentId, cohortId: null, isAdmin: false }, roomId, reply,
    );

    if (ticketId) {
      // 'ai_staff' ticket activity is attributed to Reese's AdminUser id (the
      // SAME id used as the ticket's created_by_id/assigned_to_id in
      // ensureReeseTicketForRoom) — NOT the enrollment id, which is a
      // different identity row used only for presence/DM membership.
      const reeseAdminUserId = await getReeseAdminUserId();
      if (reeseAdminUserId) {
        await logReeseExchangeActivity(ticketId, 'ai_staff', reeseAdminUserId, replyMessage.id, reply);
      }
    }
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'reese', event: 'reply_failed',
      room_id: roomId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
  }
}
