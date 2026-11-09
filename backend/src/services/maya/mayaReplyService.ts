import OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import RoomMembership from '../../models/RoomMembership';
import RoomMessage from '../../models/RoomMessage';
import { getMayaEnrollmentId, getMayaAgentId } from '../mayaIdentitySeed';
import { logAgentActivity } from '../agentBlueprint/agentActivityLogService';
import { buildMayaPortalSystemPrompt } from './mayaPortalPrompt';
import { MAYA_PORTAL_TOOLS, executeMayaPortalTool, BOOK_CALL_LINK, BOOK_CALL_PATH, TOUR_LINK, TOUR_PATH } from './mayaPortalTools';
import { guardLinks } from './mayaLinkGuard';
import { resolveMayaMode } from './mayaPromotion';
import { classifyNonAuthoritativeTopic } from './mayaTopicGuard';
import { governedTopicReply, person360Block, withAiDisclosure } from './mayaDmGovernance';

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
 * M31 (2026-11-09): this is respond_to_explorer_dm. Its mode comes from the M37 switch (mayaPromotion.resolveMayaMode):
 *   off     kill switch on/unreadable, or ENABLE_CHAT off -> nothing at all.
 *   shadow  reverted by an admin -> the reply is built and LOGGED, nothing is posted, no tool runs, no handoff is written.
 *   live    the default (Ali, "Q2: A"), as before.
 * A question about seats, deadlines, consent or cohort dates (mayaTopicGuard) never reaches the model: it gets a fixed
 * reply and a real handoff (mayaDmGovernance.governedTopicReply). Her first message in a room says she is an AI.
 *
 * ENABLEMENT, AND WHAT IS DELIBERATELY NOT DONE. ENABLE_CHAT still gates her replies (through the M37 resolver), the same
 * flag that puts her campus desk on duty (campusStaffDesks.mayaDesk) and switches on her site chat. Her AiAgent row stays
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

/** C123: the same for the tour link, so "here is the tour" always carries the button that starts it. */
export function withTourLink(reply: string, offered: boolean): string {
  if (!offered || reply.includes(TOUR_PATH)) return reply;
  return `${reply}\n\n${TOUR_LINK}`;
}

async function logActivity(result: 'success' | 'failed', reason: string, roomId: string, extra: Record<string, unknown> = {}): Promise<void> {
  const agentId = await getMayaAgentId().catch(() => null);
  if (agentId) await logAgentActivity({ agentId, action: 'maya_dm_reply', result, reason, details: { room_id: roomId, ...extra } });
}

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

/**
 * The model's reply. Tools are offered only when `withTools` (live): in shadow nothing may be written, and every tool
 * but the read-only ones writes something (a callback row, a handoff), so shadow gets no tools at all.
 */
async function modelReply(roomId: string, messages: ChatMessage[], withTools: boolean, senderEnrollmentId: string): Promise<string | null> {
  const openai = await getOpenAI();
  let completion = await complete(openai, roomId, withTools
    ? { model: MODEL, messages, temperature: 0.5, max_tokens: 400, tools: MAYA_PORTAL_TOOLS, tool_choice: 'auto' }
    : { model: MODEL, messages, temperature: 0.5, max_tokens: 400 });

  let bookingOffered = false;
  let tourOffered = false;
  const calls = withTools ? completion.choices[0]?.message?.tool_calls : undefined;
  if (calls && calls.length > 0) {
    messages.push(completion.choices[0].message as ChatMessage);
    for (const call of calls) {
      if (call.type !== 'function') continue;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* malformed args: the tool sees none and answers honestly */ }
      if (call.function.name === 'book_admissions_call') bookingOffered = true;
      if (call.function.name === 'start_campus_tour') tourOffered = true;
      const result = await executeMayaPortalTool(call.function.name, args, { senderEnrollmentId });
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
    completion = await complete(openai, roomId, { model: MODEL, messages, temperature: 0.5, max_tokens: 400 });
  }

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) return null;

  /**
   * A link the renderer will not render reaches the learner as raw markdown, so the guard runs
   * BEFORE the two appenders: anything it repaired is already the real path, which the
   * appenders then see and correctly leave alone rather than adding a second copy.
   *
   * This is the backstop for the 2026-11-08 failure, where she answered with an invented tour
   * link without calling the tool, so `tourOffered` was false and `withTourLink` never fired.
   */
  const guarded = guardLinks(text);
  if (guarded.removed.length > 0) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'maya', event: 'fabricated_link_guarded', outcome: 'partial',
      room_id: roomId, removed: guarded.removed,
      repaired_tour: guarded.repairedTour, repaired_booking: guarded.repairedBooking,
      tool_called: { book: bookingOffered, tour: tourOffered },
    }));
  }
  return withTourLink(withBookingLink(guarded.reply, bookingOffered), tourOffered);
}

export async function maybeTriggerMayaReply(roomId: string, senderEnrollmentId: string): Promise<void> {
  let mayaRoom = false; // the fallback line is only ever posted into a room Maya is confirmed to be in
  let live = false; // ...and only when she is live: a shadow failure is logged, never posted
  try {
    const mode = await resolveMayaMode('respondToExplorerDm');
    if (mode.mode === 'off') return;
    live = mode.mode === 'live';

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
    const mayaHasSpoken = await RoomMessage.count({ where: { room_id: roomId, enrollment_id: mayaEnrollmentId } }) > 0;

    // M31: seats, deadlines, consent and cohort dates are never answered by the model.
    const topic = classifyNonAuthoritativeTopic(triggering?.content);
    let body: string | null;
    if (topic) {
      body = (await governedTopicReply(topic, senderEnrollmentId, { dryRun: !live })).text;
    } else {
      const [base, person] = await Promise.all([
        buildMayaPortalSystemPrompt(senderEnrollmentId, triggering?.content ?? ''),
        person360Block(senderEnrollmentId),
      ]);
      const messages: ChatMessage[] = [
        { role: 'system', content: [base, person].filter(Boolean).join('\n\n') },
        ...ordered.map((m) => ({ role: (m.enrollment_id === mayaEnrollmentId ? 'assistant' : 'user') as 'assistant' | 'user', content: m.content })),
      ];
      body = await modelReply(roomId, messages, live, senderEnrollmentId);
    }
    if (!body) return;
    const reply = withAiDisclosure(body, mayaHasSpoken);

    if (!live) {
      // SHADOW: record what she would have said. Nothing is posted.
      await logActivity('success', 'shadow_not_posted', roomId, { mode: mode.mode, mode_reason: mode.reason, topic, would_reply: reply.slice(0, 1000) });
      return;
    }

    // Dynamic import breaks the dmService <-> mayaReplyService cycle (same convention as Reese and Dara).
    const { sendDmMessage } = await import('../communityRooms/dmService');
    await sendDmMessage({ enrollmentId: mayaEnrollmentId, cohortId: null, isAdmin: false }, roomId, reply);
    await logActivity('success', topic ? `reply_sent_governed:${topic}` : 'reply_sent', roomId);
  } catch (e: any) {
    warn('reply_failed', roomId, e);
    await logActivity('failed', String(e?.message || e), roomId).catch(() => undefined);
    // One deterministic line, never LLM-generated. Its own send re-enters this function, where the loop guard stops it.
    try {
      const mayaEnrollmentId = await getMayaEnrollmentId();
      if (live && mayaRoom && mayaEnrollmentId && senderEnrollmentId !== mayaEnrollmentId) {
        const { sendDmMessage } = await import('../communityRooms/dmService');
        await sendDmMessage({ enrollmentId: mayaEnrollmentId, cohortId: null, isAdmin: false }, roomId, MAYA_REPLY_FAILURE_MESSAGE);
      }
    } catch (fallbackError: any) {
      warn('reply_failure_fallback_also_failed', roomId, fallbackError);
    }
  }
}
