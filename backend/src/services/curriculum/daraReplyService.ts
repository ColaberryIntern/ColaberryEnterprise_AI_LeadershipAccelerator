import OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import RoomMembership from '../../models/RoomMembership';
import RoomMessage from '../../models/RoomMessage';
import { getDaraEnrollmentId, getDaraAdminUserId, getDaraAgentId } from './daraIdentitySeed';
import { buildDaraSystemPrompt } from './daraSystemPrompt';
import { ensureDaraTicketForRoom, logDaraExchangeActivity } from './daraTicketLinkService';
import { logAgentActivity } from '../agentBlueprint/agentActivityLogService';
import { agentHasTool } from '../agents/tools/agentToolRegistry';
import { readAttachments, attachmentInstruction } from '../agents/tools/readAttachmentsTool';
import type { AttachmentRef } from '../agents/tools/types';
import { executeDaraTool, DARA_TOOLS } from './daraTools';

// Dara v2 Phase 3 — the ONLY place a Dara-authored student DM message is ever
// produced. Reactive, guarded, never proactive — mirrors reeseReplyService.ts
// exactly for the same structural reasons:
//   1. Fires ONLY from dmService.ts's sendDmMessage(), i.e. only in direct
//      response to a real inbound RoomMessage that was just persisted.
//   2. Loop guard: if the SENDER of that inbound message is Dara's own
//      identity, this immediately no-ops — Dara's own messages can never
//      retrigger a reply. Structurally impossible, not just policy.
//   3. Scope guard: if Dara is not a member of the room, this no-ops — no
//      cost, no LLM call, for any conversation that isn't actually with Dara.
//   4. There is no scheduler, cron, or risk-signal call site anywhere that
//      calls this module — Dara has no autonomous/proactive outreach in this
//      release (charter Boundaries §1, unchanged by the v2 mission for this
//      surface).

let _openai: OpenAI | null = null;
async function getOpenAI(): Promise<OpenAI> {
  if (!_openai) {
    const agentId = await getDaraAgentId();
    _openai = getInstrumentedOpenAI({ workflow_id: 'dara', agent_id: agentId ?? undefined });
  }
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const HISTORY_LIMIT = 20;

/**
 * Attachment refs persisted on a message by postMessage. Defensive about the
 * shape because `metadata` is a free-form JSONB column — a malformed entry is
 * skipped, never allowed to throw inside the reply path. Byte-for-byte the
 * same helper as reeseReplyService.ts's (kept local rather than shared, same
 * posture as the rest of this file's deliberate mirroring).
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
 * Dara's reply (if this is actually a Dara DM and the sender isn't Dara) and
 * posts it back through the identical sendDmMessage() path a human uses.
 * Never throws — a reply-generation failure must never break the student's
 * own send request.
 */
export async function maybeTriggerDaraReply(roomId: string, senderEnrollmentId: string): Promise<void> {
  try {
    const daraEnrollmentId = await getDaraEnrollmentId();
    if (!daraEnrollmentId) return; // identity not seeded yet — nothing to reply as

    // Loop guard — MUST be checked before anything else touches the network
    // or the DB beyond the id lookup above.
    if (senderEnrollmentId === daraEnrollmentId) return;

    const daraMembership = await RoomMembership.findOne({
      where: { room_id: roomId, enrollment_id: daraEnrollmentId, access_state: 'active' },
    });
    if (!daraMembership) return; // not a conversation with Dara — no-op

    const recent = await RoomMessage.findAll({
      where: { room_id: roomId, deleted_at: null },
      order: [['created_at', 'DESC']],
      limit: HISTORY_LIMIT,
    });
    const triggeringMessage = recent[0]; // newest = the message that just fired this hook
    const ordered = recent.slice().reverse();

    // ProofDesk linkage — every conversation with Dara is backed by a real
    // ticket. Idempotent (see daraTicketLinkService.ts's header comment).
    let ticketId: string | null = null;
    if (triggeringMessage) {
      try {
        const ticket = await ensureDaraTicketForRoom(roomId, senderEnrollmentId, triggeringMessage.content);
        ticketId = ticket.id;
        await logDaraExchangeActivity(
          ticketId, 'human', senderEnrollmentId, triggeringMessage.id, triggeringMessage.content,
        );
      } catch (e: any) {
        console.warn(JSON.stringify({
          level: 'warn', service: 'dara', event: 'ticket_ensure_failed',
          room_id: roomId, error_class: e?.name || 'Error', message: String(e?.message || e),
        }));
      }
    }

    // read_attachments — same pattern as Reese: read off the STORED
    // triggering message (already owner-verified by postMessage), scoped to
    // the sender.
    const attachRefs = triggeringMessage && agentHasTool('dara', 'read_attachments')
      ? attachmentRefsOf(triggeringMessage)
      : [];
    let attach: Awaited<ReturnType<typeof readAttachments>> = { parts: [], skipped: [], attached: 0 };
    if (attachRefs.length) {
      try {
        attach = await readAttachments(senderEnrollmentId, attachRefs);
      } catch (e: any) {
        console.warn(JSON.stringify({
          level: 'warn', service: 'dara', event: 'read_attachments_failed',
          room_id: roomId, error_class: e?.name || 'Error', message: String(e?.message || e),
        }));
      }
    }

    const instruction = attachmentInstruction(attach);
    const systemPrompt = await buildDaraSystemPrompt(senderEnrollmentId);
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: instruction ? `${systemPrompt}\n\n${instruction}` : systemPrompt },
      ...ordered.map((m, i) => {
        const role = (m.enrollment_id === daraEnrollmentId ? 'assistant' : 'user') as 'assistant' | 'user';
        const isTrigger = i === ordered.length - 1 && role === 'user';
        if (!isTrigger || !attach.parts.length) return { role, content: m.content };
        return { role, content: [{ type: 'text' as const, text: m.content }, ...attach.parts] } as OpenAI.Chat.ChatCompletionMessageParam;
      }),
    ];

    const openai = await getOpenAI();
    const completionModel = attach.parts.length ? (process.env.DARA_VISION_MODEL || 'gpt-4o') : MODEL;
    let completion = await openai.chat.completions.create({
      model: completionModel,
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 500,
      tools: DARA_TOOLS,
      tool_choice: 'auto',
    });

    // At most one tool round: the model may call escalate_to_human once, then
    // MUST answer — no further tool offers on the follow-up call, so a model
    // that keeps requesting tools can never loop the reply pipeline
    // indefinitely (same structural cap as Reese's Checkpoint E tools).
    const requestedToolCalls = completion.choices[0]?.message?.tool_calls;
    if (requestedToolCalls && requestedToolCalls.length > 0) {
      chatMessages.push(completion.choices[0].message as OpenAI.Chat.ChatCompletionMessageParam);
      const daraAdminUserId = await getDaraAdminUserId();
      for (const call of requestedToolCalls) {
        if (call.type !== 'function') continue;
        let args: { reason?: string } = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* malformed args -> empty, tool degrades gracefully */ }
        const result = await executeDaraTool(call.function.name, args, {
          ticketId,
          daraAdminUserId,
          studentEnrollmentId: senderEnrollmentId,
          triggeringMessageId: triggeringMessage?.id ?? null,
        });
        chatMessages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      completion = await openai.chat.completions.create({
        model: completionModel,
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 500,
      });
    }

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) return;

    // Dynamic import breaks the dmService.ts <-> daraReplyService.ts circular
    // dependency, same convention reeseReplyService.ts uses.
    const { sendDmMessage } = await import('../communityRooms/dmService');
    const replyMessage = await sendDmMessage(
      { enrollmentId: daraEnrollmentId, cohortId: null, isAdmin: false }, roomId, reply,
    );

    // Real activity logging under Dara's OWN AiAgent.id — same GOALS-score
    // fix reasoning as Reese's, decoupled from ticket-linking success.
    const daraAgentId = await getDaraAgentId();
    if (daraAgentId) {
      await logAgentActivity({
        agentId: daraAgentId,
        action: 'dara_dm_reply',
        result: 'success',
        reason: 'reply_sent',
        details: { room_id: roomId },
      });
    }

    if (ticketId) {
      const daraAdminUserId = await getDaraAdminUserId();
      if (daraAdminUserId) {
        await logDaraExchangeActivity(ticketId, 'ai_staff', daraAdminUserId, replyMessage.id, reply);
      }
    }
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'dara', event: 'reply_failed',
      room_id: roomId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    const daraAgentId = await getDaraAgentId().catch(() => null);
    if (daraAgentId) {
      await logAgentActivity({
        agentId: daraAgentId,
        action: 'dara_dm_reply',
        result: 'failed',
        reason: String(e?.message || e),
        details: { room_id: roomId },
      });
    }
  }
}
