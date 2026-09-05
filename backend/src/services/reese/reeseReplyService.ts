import OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import RoomMembership from '../../models/RoomMembership';
import RoomMessage from '../../models/RoomMessage';
import { getReeseEnrollmentId, getReeseAdminUserId, getReeseAgentId } from './reeseIdentitySeed';
import { buildReeseSystemPrompt } from './reeseSystemPrompt';
import { ensureReeseTicketForRoom, logReeseExchangeActivity } from './reeseTicketLinkService';
import { agentHasTool } from '../agents/tools/agentToolRegistry';
import { readAttachments, attachmentInstruction } from '../agents/tools/readAttachmentsTool';
import type { AttachmentRef } from '../agents/tools/types';
import { maybeRefreshStudentAssessment } from '../studentHealthAssessment';

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

// Cost-tracking fix (2026-08-27) — Ali, live: "isn't [cost] part of it?"
// This client was tagging `workflow_id: 'reese'` but never `agent_id`, so
// Reese's real, instrumented LLM calls (67 in 30 days, $0.02, 58,908 tokens
// per ai_events) were invisible to every per-agent cost query, including her
// own Trust evidence section and the Trust Command Center's roster. Resolved
// once, memoized (getReeseAgentId() is itself cached) — the singleton is now
// built async so the real id is known before the first real call.
let _openai: OpenAI | null = null;
async function getOpenAI(): Promise<OpenAI> {
  if (!_openai) {
    const agentId = await getReeseAgentId();
    _openai = getInstrumentedOpenAI({ workflow_id: 'reese', agent_id: agentId ?? undefined });
  }
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const HISTORY_LIMIT = 20;

/**
 * Attachment refs persisted on a message by postMessage. Defensive about the
 * shape because `metadata` is a free-form JSONB column — a malformed entry is
 * skipped, never allowed to throw inside the reply path.
 */
function attachmentRefsOf(message: RoomMessage): AttachmentRef[] {
  const meta = message.metadata;
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as Record<string, unknown>).attachments;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is { id: string; name?: string } => !!a && typeof a === 'object' && typeof (a as any).id === 'string')
    .map((a) => ({ id: a.id, name: typeof a.name === 'string' ? a.name : null }));
}

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

    // read_attachments — Reese looks at what the student attached to the
    // message that triggered this reply. Read off the STORED message (which
    // postMessage already owner-verified) rather than off a request body, and
    // scoped to the sender, so an id belonging to anyone else resolves to
    // "not found". Only the triggering message's files are read: replaying
    // images from every message in the 20-message window would multiply the
    // vision cost of a long conversation for context Reese already has in text.
    const attachRefs = triggeringMessage && agentHasTool('reese', 'read_attachments')
      ? attachmentRefsOf(triggeringMessage)
      : [];
    let attach: Awaited<ReturnType<typeof readAttachments>> = { parts: [], skipped: [], attached: 0 };
    if (attachRefs.length) {
      try {
        attach = await readAttachments(senderEnrollmentId, attachRefs);
      } catch (e: any) {
        // A vision failure must not cost the student a reply — Reese answers
        // the text and stays quiet about the image rather than going silent.
        console.warn(JSON.stringify({
          level: 'warn', service: 'reese', event: 'read_attachments_failed',
          room_id: roomId, error_class: e?.name || 'Error', message: String(e?.message || e),
        }));
      }
    }

    const instruction = attachmentInstruction(attach);
    const systemPrompt = await buildReeseSystemPrompt(senderEnrollmentId);
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: instruction ? `${systemPrompt}\n\n${instruction}` : systemPrompt },
      ...ordered.map((m, i) => {
        const role = (m.enrollment_id === reeseEnrollmentId ? 'assistant' : 'user') as 'assistant' | 'user';
        // Images attach to the triggering message only — the last one in the
        // ordered window, and only when it is the student's own turn.
        const isTrigger = i === ordered.length - 1 && role === 'user';
        if (!isTrigger || !attach.parts.length) return { role, content: m.content };
        return { role, content: [{ type: 'text' as const, text: m.content }, ...attach.parts] } as OpenAI.Chat.ChatCompletionMessageParam;
      }),
    ];

    const openai = await getOpenAI();
    const completion = await openai.chat.completions.create({
      // A text-only model 400s on image parts, which would take the whole reply
      // down instead of degrading — so a turn carrying images goes to a known
      // vision-capable model unless the operator named one.
      model: attach.parts.length ? (process.env.REESE_VISION_MODEL || 'gpt-4o') : MODEL,
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

    // Reese Agentic AI Employee mission, Checkpoint D — opportunistic,
    // cost-bounded assessment refresh. Fire-and-forget: never awaited, so a
    // slow or failed LLM call here can never delay or break the reply the
    // student is waiting on. maybeRefreshStudentAssessment() itself no-ops
    // (no LLM call) unless the student's last assessment is missing or past
    // its own reassessment_date — this is the real trigger for Checkpoint D's
    // engine now that it's wired in, since no dedicated cron sweep exists.
    maybeRefreshStudentAssessment(senderEnrollmentId).catch((e: any) => {
      console.warn(JSON.stringify({
        level: 'warn', service: 'reese', event: 'assessment_refresh_failed',
        room_id: roomId, error_class: e?.name || 'Error', message: String(e?.message || e),
      }));
    });

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
