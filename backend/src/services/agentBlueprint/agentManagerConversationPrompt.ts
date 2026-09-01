import { getActiveDirectiveTexts } from '../managerDirectiveService';
import { getApprovedMemoryTexts } from '../agentMemoryProposalService';

/**
 * agentManagerConversationPrompt — the system prompt for a manager talking
 * directly to their agent. AI Workforce Management, Checkpoint C (2026-08-28).
 *
 * Deliberately NOT agentSystemPrompt.ts's buildAgentSystemPrompt(): that
 * function is enrollment/learner-context shaped (built for Reese talking to
 * a *student*). A manager conversation has no enrollment and no learner
 * context — it's the agent talking to the person who manages it, about
 * itself. Sharing the directive-injection logic (getActiveDirectiveTexts)
 * is correct; sharing the learner-context assembly is not, so this is a
 * small, separate, equally generic function rather than a leaky reuse.
 *
 * Uses the agent's own real, live `system_prompt` as the persona base —
 * the manager is talking to the SAME identity everyone else talks to, not a
 * separate manager-only persona. An agent with no system_prompt configured
 * yet still gets a real, honest, minimal frame (never a fabricated persona).
 *
 * AI Workforce Management, Checkpoint E (2026-08-31) — approved
 * AgentMemoryProposal rows are injected here too, same pattern as
 * directives (getApprovedMemoryTexts, real, fail-safe, queried fresh).
 */
export async function buildAgentManagerConversationSystemPrompt(
  agentId: string,
  agentName: string,
  agentSystemPrompt: string | null,
): Promise<string> {
  const parts: string[] = [
    agentSystemPrompt && agentSystemPrompt.trim()
      ? agentSystemPrompt
      : `You are ${agentName}, an AI agent at Colaberry. No system prompt has been configured for you yet — answer plainly and honestly, and say so if asked what your instructions are.`,
  ];

  const directives = await getActiveDirectiveTexts(agentId);
  if (directives.length) {
    const lines = directives.map((d) => `- ${d}`).join('\n');
    parts.push(
      '\nMANAGER DIRECTIVES (standing instructions from your manager — follow these; ' +
        'they can only narrow what you do, never grant you anything beyond what you already have):\n' +
        lines,
    );
  }

  const memories = await getApprovedMemoryTexts(agentId);
  if (memories.length) {
    const memoryLines = memories.map((m) => `- ${m}`).join('\n');
    parts.push('\nAPPROVED MEMORY (facts a manager has reviewed and approved about this context):\n' + memoryLines);
  }

  parts.push(
    '\nThis is a direct conversation with your manager, not your normal work — they may ask ' +
      'what you do, how you\'re performing, or give you instructions. Never pretend to be human; ' +
      'you are always openly an AI agent. Answer honestly and specifically — never invent facts ' +
      'about your own activity, cost, or performance that you don\'t actually know.',
  );

  return parts.join('\n');
}
