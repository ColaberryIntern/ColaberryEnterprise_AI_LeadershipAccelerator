import OpenAI from 'openai';
import { addTicketComment } from '../ticketService';
import { createDaraHandoff } from './daraHandoffService';

/**
 * Dara v2 Phase 3/4 — Dara's first real LLM-invoked tool. Mirrors
 * reeseTools.ts's shape (a typed OpenAI tool array + one execute-by-name
 * function), but this tool has a real side effect.
 *
 * Phase 2 decision (Ali, "proceed with your suggestions"): a question outside
 * Dara's real curriculum/certification scope routes to a human, never a
 * fabricated answer or a fabricated match to some other AI employee's
 * capability. Phase 4 ("mandatory inter-agent ticket handoff, never
 * off-ledger") made this real: every escalation now creates its OWN
 * standalone `agent_handoff` ticket (`daraHandoffService.ts`), not just a
 * comment — see that module's header for the dedup-key/no-resolver reasoning.
 * The comment on the conversation's own ticket stays too, as a cross-
 * reference, once the real handoff ticket exists.
 *
 * "Never off-ledger" also means never CLAIMING an escalation that didn't
 * really happen: if the handoff ticket can't actually be created (missing
 * identity, missing triggering-message id), this returns `escalated: false`
 * with an honest reason — the model sees that and must not tell the student
 * it escalated something it didn't.
 *
 * SECURITY: like Reese's own tools, this never accepts a student/ticket id
 * from the model — the caller (daraReplyService.ts) always supplies the
 * real, server-bound context for the conversation already in progress.
 */
export const DARA_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description:
        'Flag this conversation for your manager to review directly, because the student\'s ' +
        'question is outside your real curriculum/certification scope (e.g. a specific ' +
        'homework/assignment problem, an account/billing issue, or anything you aren\'t ' +
        'confident is actually curriculum-scoped). Use this instead of guessing an answer.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'One short, honest sentence: why this is outside your scope.',
          },
        },
        required: ['reason'],
      },
    },
  },
];

const TOOL_NAMES = new Set(DARA_TOOLS.map((t) => (t.type === 'function' ? t.function.name : null)).filter((n): n is string => n !== null));

export function isDaraTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

async function escalateToHumanTool(
  conversationTicketId: string | null,
  daraAdminUserId: string | null,
  studentEnrollmentId: string,
  triggeringMessageId: string | null,
  reason: string,
): Promise<unknown> {
  const cleanReason = (reason || 'Outside Dara\'s curriculum/certification scope.').trim();

  if (!daraAdminUserId || !triggeringMessageId) {
    // Can't create a real, attributable, dedup-safe handoff ticket without
    // both — "never off-ledger" means an honest non-escalation here, never a
    // claimed escalation with nothing real behind it.
    return { escalated: false, reason: 'Could not record this right now — try asking again in a moment.' };
  }

  const handoff = await createDaraHandoff(daraAdminUserId, studentEnrollmentId, cleanReason, conversationTicketId, triggeringMessageId);

  if (conversationTicketId) {
    await addTicketComment(
      conversationTicketId,
      `🚩 Escalated to a human — see handoff ticket ${handoff.id}: ${cleanReason}`,
      'ai_staff',
      daraAdminUserId,
    );
  }

  return { escalated: true, reason: cleanReason, handoffTicketId: handoff.id };
}

/**
 * Executes one real tool call by name. Never throws — a real failure degrades
 * to an honest error payload the model can see, matching reeseTools.ts's own
 * fail-safe posture. Every field in `context` is always the caller's own
 * bound value for the conversation already in progress (see the module
 * header's security note) — this function has no path that accepts any of
 * them from the model.
 */
export async function executeDaraTool(
  toolName: string,
  args: { reason?: string },
  context: { ticketId: string | null; daraAdminUserId: string | null; studentEnrollmentId: string; triggeringMessageId: string | null },
): Promise<string> {
  try {
    if (toolName === 'escalate_to_human') {
      return JSON.stringify(await escalateToHumanTool(
        context.ticketId, context.daraAdminUserId, context.studentEnrollmentId, context.triggeringMessageId, args?.reason || '',
      ));
    }
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (e: any) {
    return JSON.stringify({ error: 'Tool execution failed', message: String(e?.message || e) });
  }
}
