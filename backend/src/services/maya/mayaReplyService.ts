import OpenAI from 'openai';
import { env } from '../../config/env';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import RoomMembership from '../../models/RoomMembership';
import RoomMessage from '../../models/RoomMessage';
import { getMayaEnrollmentId, getMayaAgentId } from '../mayaIdentitySeed';
import { logAgentActivity } from '../agentBlueprint/agentActivityLogService';
import { buildMayaPortalSystemPrompt } from './mayaPortalPrompt';
import { MAYA_PORTAL_TOOLS, executeMayaPortalTool, BOOK_CALL_LINK, BOOK_CALL_PATH } from './mayaPortalTools';

/**
 * C121 — the ONLY place a Maya-authored portal DM is produced. Ali, 2026-11-06: "I think we should probably put Maya in
 * the same IM system as everyone else." Built in the shape of curriculum/daraReplyService.ts, for the same reasons:
 *   1. Reactive only: fires from dmService.sendDmMessage() after a real inbound message was persisted. No scheduler,
 *      cron or proactive path calls this module.
 *   2. Loop guard: a message Maya sent never triggers a reply (checked before any other DB or network work).
 *   3. Scope guard: a room Maya is not an active member of is a no-op: no LLM call, no cost.
 *   4. At most ONE tool round, then the model must answer with no tools offered, so it can never loop.
 *   5. Never throws; a failure posts one deterministic, honest line instead of leaving the learner in silence.
 *
 * ENABLEMENT, AND WHAT IS DELIBERATELY NOT DONE. Her replies are gated on env.enableChat (ENABLE_CHAT), the same flag
 * that puts her campus desk on duty (campusStaffDesks.mayaDesk) and switches on her site chat. Her AiAgent row stays
 * `enabled: false` and there is still no isMayaEnabled(): mayaIdentitySeed.ts records why (flipping or wiring that row
 * needs Ali's sign-off and would switch her site chat off). This file does not touch either.
 *
 * WHY NO TICKET OR authorizeTicketDispatch, unlike Dara. That bridge evaluates the AiAgent row, and Maya's row is
 * disabled on purpose: every reply would be recorded as a would_block approval request (status 'pending', a review
 * queue item per message) and, under ABAC enforce, held. That contradicts the gating decision above. Her portal tools
 * are read-only except request_callback, whose result is a row the admissions team already reviews (callback_requests).
 * Activity is still logged under her own AiAgent id.
 *
 * SECURITY: every tool runs for the SENDER of the triggering message (senderEnrollmentId); no id is taken from the model.
 */

let _openai: OpenAI | null = null;
async function getOpenAI(): Promise<OpenAI> {
  if (!_openai) {
    const agentId = await getMayaAgentId().catch(() => null);
    // Explicit timeout and no SDK retries: the one bounded retry below is the whole retry policy.
    _openai = getInstrumentedOpenAI({ workflow_id: 'maya_portal_dm', agent_id: agentId ?? undefined }, { timeout: 30_000, maxRetries: 0 });
  }
  return _openai;
}
/** Test-only: drop the memoized client so a test can swap the OpenAI mock. */
export function __resetMayaReplyClientForTests(): void { _openai = null; }

const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const HISTORY_LIMIT = 20;
const COMPLETION_RETRY_DELAY_MS = 800;

export const MAYA_REPLY_FAILURE_MESSAGE =
  "Sorry, I ran into a technical issue and couldn't answer that. Please try again in a moment, or use the Book a call button in Admissions.";

function warn(event: string, roomId: string, e: any): void {
  console.warn(JSON.stringify({
    level: 'warn', service: 'maya', event, outcome: 'failure', room_id: roomId,
    error_class: e?.name || 'Error', message: String(e?.message || e),
  }));
}

async function complete(openai: OpenAI, roomId: string, params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.ChatCompletion> {
  try {
    return await openai.chat.completions.create(params);
  } catch (e: any) {
    warn('completion_failed_retrying', roomId, e);
    await new Promise((resolve) => setTimeout(resolve, COMPLETION_RETRY_DELAY_MS));
    return openai.chat.completions.create(params);
  }
}

/** The booking link is the action; when Maya offered it but paraphrased it away, the real link is added. */
export function withBookingLink(reply: string, offered: boolean): string {
  if (!offered || reply.includes(BOOK_CALL_PATH)) return reply;
  return `${reply}\n\n${BOOK_CALL_LINK}`;
}

async function logActivity(result: 'success' | 'failed', reason: string, roomId: string): Promise<void> {
  const agentId = await getMayaAgentId().catch(() => null);
  if (agentId) await logAgentActivity({ agentId, action: 'maya_dm_reply', result, reason, details: { room_id: roomId } });
}

export async function maybeTriggerMayaReply(roomId: string, senderEnrollmentId: string): Promise<void> {
  let mayaRoom = false; // the fallback line is only ever posted into a room Maya is confirmed to be in
  try {
    if (env.enableChat !== true) return;

    const mayaEnrollmentId = await getMayaEnrollmentId();
    if (!mayaEnrollmentId) return; // identity not seeded yet
    if (senderEnrollmentId === mayaEnrollmentId) return; // loop guard

    const membership = await RoomMembership.findOne({
      where: { room_id: roomId, enrollment_id: mayaEnrollmentId, access_state: 'active' },
    });
    if (!membership) return; // not a conversation with Maya
    mayaRoom = true;

    const recent = await RoomMessage.findAll({
      where: { room_id: roomId, deleted_at: null },
      order: [['created_at', 'DESC']],
      limit: HISTORY_LIMIT,
    });
    const triggering = recent[0];
    const ordered = recent.slice().reverse();

    const systemPrompt = await buildMayaPortalSystemPrompt(senderEnrollmentId, triggering?.content ?? '');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...ordered.map((m) => ({ role: (m.enrollment_id === mayaEnrollmentId ? 'assistant' : 'user') as 'assistant' | 'user', content: m.content })),
    ];

    const openai = await getOpenAI();
    let completion = await complete(openai, roomId, {
      model: MODEL, messages, temperature: 0.5, max_tokens: 400, tools: MAYA_PORTAL_TOOLS, tool_choice: 'auto',
    });

    let bookingOffered = false;
    const calls = completion.choices[0]?.message?.tool_calls;
    if (calls && calls.length > 0) {
      messages.push(completion.choices[0].message as OpenAI.Chat.ChatCompletionMessageParam);
      for (const call of calls) {
        if (call.type !== 'function') continue;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* malformed args: the tool sees none and answers honestly */ }
        if (call.function.name === 'book_admissions_call') bookingOffered = true;
        const result = await executeMayaPortalTool(call.function.name, args, { senderEnrollmentId });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      completion = await complete(openai, roomId, { model: MODEL, messages, temperature: 0.5, max_tokens: 400 });
    }

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return;
    const reply = withBookingLink(text, bookingOffered);

    // Dynamic import breaks the dmService <-> mayaReplyService cycle (same convention as Reese and Dara).
    const { sendDmMessage } = await import('../communityRooms/dmService');
    await sendDmMessage({ enrollmentId: mayaEnrollmentId, cohortId: null, isAdmin: false }, roomId, reply);
    await logActivity('success', 'reply_sent', roomId);
  } catch (e: any) {
    warn('reply_failed', roomId, e);
    await logActivity('failed', String(e?.message || e), roomId).catch(() => undefined);
    // One deterministic line, never LLM-generated. Its own send re-enters this function, where the loop guard stops it.
    try {
      const mayaEnrollmentId = await getMayaEnrollmentId();
      if (mayaRoom && mayaEnrollmentId && senderEnrollmentId !== mayaEnrollmentId) {
        const { sendDmMessage } = await import('../communityRooms/dmService');
        await sendDmMessage({ enrollmentId: mayaEnrollmentId, cohortId: null, isAdmin: false }, roomId, MAYA_REPLY_FAILURE_MESSAGE);
      }
    } catch (fallbackError: any) {
      warn('reply_failure_fallback_also_failed', roomId, fallbackError);
    }
  }
}
