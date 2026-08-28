import { getLearnerContextBlock } from '../learnerContextService';
import { getActiveDirectiveTexts } from '../managerDirectiveService';

/**
 * Reese Phase 3 (Agent Blueprint) — the persona-block + learner-context
 * prompt-assembly mechanic, extracted from Reese Phase 1's reeseSystemPrompt.ts so
 * the NEXT platform agent doesn't re-derive this shape from scratch. Reese is the
 * first caller of this generic module (see
 * backend/src/services/reese/reeseSystemPrompt.ts), refactored to delegate here with
 * BYTE-FOR-BYTE identical output — only the implementation moved, the persona text
 * itself and the closing framing line stay Reese's own.
 *
 * A new agent supplies its own persona block (see docs/CORY_PERSONA_SPEC.md for the
 * locked voice/persona spec pattern Reese's block was transplanted from — name-swap
 * per agent, keep the same VOICE PRINCIPLES / GUARDRAILS shape) and, optionally, its
 * own closing framing line if its conversational surface differs from a DM thread.
 *
 * AI Workforce Management, Checkpoint C (2026-08-28) — this is the durable-
 * instruction runtime injection point the mission's non-negotiable #4 requires:
 * a manager's ManagerDirective rows are injected here, into the ASSEMBLED
 * prompt, on every call — AiAgent.system_prompt itself is never touched.
 * `agentId` is optional and backward compatible: omitting it (as every
 * existing caller does until it opts in) reproduces the exact prior output,
 * byte for byte — no directive block, nothing new. This function never
 * grants anything through a directive: it only ever appends instruction TEXT
 * to a prompt string. No code path here (or anywhere else in this repo) lets
 * a ManagerDirective change autonomy_level, tools_granted, or bypass
 * agentAuthorizationService — that is the actual, mechanically-enforced
 * "restrict-only" boundary, not a check on what the directive's text says.
 */
export interface BuildAgentSystemPromptOptions {
  /** Lowercased, used only in the learner-context-failure log line's `service` field. */
  agentLabel?: string;
  /** Appended after the (optional) learner-context block. Defaults to Reese's own DM framing line. */
  closingLine?: string;
  /** This agent's real `ai_agents.id` — when provided, active ManagerDirective
   * rows for it are fetched and injected. Omit to reproduce the exact prior
   * (pre-Checkpoint-C) output. */
  agentId?: string;
}

const DEFAULT_CLOSING_LINE =
  '\nThis is a direct-message conversation, not a lesson-scoped chat — reply in your ' +
  "voice per the principles above; keep it to a few sentences unless real depth is " +
  'asked for.';

function buildDirectiveBlock(directives: string[]): string {
  const lines = directives.map((d) => `- ${d}`).join('\n');
  return (
    '\nMANAGER DIRECTIVES (standing instructions from your manager — follow these; ' +
    'they can only narrow what you do, never grant you anything beyond what you already have):\n' +
    lines
  );
}

/**
 * Builds an agent's full system prompt for a conversation with one enrollment.
 * Never throws — a learner-context failure degrades gracefully to the persona block
 * alone (mirrors mentorService.ts's fail-safe pattern for getLearnerContextBlock,
 * defended again here in case a caller mocks/overrides that function to reject).
 * The same fail-safe posture now covers active-directive lookup (see
 * getActiveDirectiveTexts()'s own try/catch — a directive-fetch failure never
 * blocks a reply, it just means that turn runs without the directive block).
 */
export async function buildAgentSystemPrompt(
  personaBlock: string,
  enrollmentId: string,
  options?: BuildAgentSystemPromptOptions,
): Promise<string> {
  const parts: string[] = [personaBlock];

  if (options?.agentId) {
    const directives = await getActiveDirectiveTexts(options.agentId);
    if (directives.length) parts.push(buildDirectiveBlock(directives));
  }

  let learnerBlock = '';
  try {
    learnerBlock = await getLearnerContextBlock(enrollmentId);
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: options?.agentLabel || 'agent', event: 'learner_context_failed',
      enrollment_id: enrollmentId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    learnerBlock = '';
  }
  if (learnerBlock) parts.push('\n' + learnerBlock);

  parts.push(options?.closingLine ?? DEFAULT_CLOSING_LINE);

  return parts.join('\n');
}
