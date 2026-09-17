import OpenAI from 'openai';
import { addTicketComment } from '../ticketService';
import { Ticket } from '../../models';

/**
 * Dara v2 Phase 3 — Dara's first (and, for this phase, only) real LLM-invoked
 * tool. Mirrors reeseTools.ts's shape (a typed OpenAI tool array + one
 * execute-by-name function), but this tool has a real side effect: flagging
 * the current conversation's ticket for the human Dara reports to, rather
 * than a read-only lookup.
 *
 * Phase 2 decision (Ali, "proceed with your suggestions"): a question outside
 * Dara's real curriculum/certification scope routes to a human via the
 * conversation's own ProofDesk ticket — never a fabricated answer, and never
 * a fabricated match to some other AI employee's capability. This tool is
 * that mechanism: it adds a clearly-labeled comment and raises the ticket's
 * priority so it doesn't sit invisibly at the default. It deliberately does
 * NOT attempt a ticket status transition (`updateTicketStatus`) — the
 * ticket's status machine (`ticketService.ts`'s VALID_TRANSITIONS) has no
 * direct backlog -> in_review edge, and forcing one here would be exactly the
 * kind of state-machine workaround this repo's own incident history warns
 * against. Visibility (comment + priority), not a fabricated status jump.
 *
 * SECURITY: like Reese's own tools, this never accepts a student/ticket id
 * from the model — the caller (daraReplyService.ts) always supplies the
 * real, server-bound ticketId/actorId for the conversation already in
 * progress.
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

async function escalateToHumanTool(ticketId: string, daraAdminUserId: string | null, reason: string): Promise<unknown> {
  const cleanReason = (reason || 'Outside Dara\'s curriculum/certification scope.').trim();
  if (daraAdminUserId) {
    await addTicketComment(ticketId, `🚩 Escalated to a human: ${cleanReason}`, 'ai_staff', daraAdminUserId);
  }
  await Ticket.update({ priority: 'high' } as any, { where: { id: ticketId } });
  return { escalated: true, reason: cleanReason };
}

/**
 * Executes one real tool call by name. Never throws — a real failure degrades
 * to an honest error payload the model can see, matching reeseTools.ts's own
 * fail-safe posture. `ticketId`/`daraAdminUserId` are always the caller's own
 * bound values for the conversation already in progress (see the module
 * header's security note) — this function has no path that accepts either
 * from the model.
 */
export async function executeDaraTool(
  toolName: string,
  args: { reason?: string },
  context: { ticketId: string | null; daraAdminUserId: string | null },
): Promise<string> {
  try {
    if (toolName === 'escalate_to_human') {
      if (!context.ticketId) {
        // No ticket to flag (ensureDaraTicketForRoom failed earlier this turn)
        // — still an honest, non-throwing result the model can act on.
        return JSON.stringify({ escalated: false, reason: 'No ticket available to flag this turn.' });
      }
      return JSON.stringify(await escalateToHumanTool(context.ticketId, context.daraAdminUserId, args?.reason || ''));
    }
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (e: any) {
    return JSON.stringify({ error: 'Tool execution failed', message: String(e?.message || e) });
  }
}
