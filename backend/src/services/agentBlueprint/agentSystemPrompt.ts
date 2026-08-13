import { getLearnerContextBlock } from '../learnerContextService';

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
 */
export interface BuildAgentSystemPromptOptions {
  /** Lowercased, used only in the learner-context-failure log line's `service` field. */
  agentLabel?: string;
  /** Appended after the (optional) learner-context block. Defaults to Reese's own DM framing line. */
  closingLine?: string;
}

const DEFAULT_CLOSING_LINE =
  '\nThis is a direct-message conversation, not a lesson-scoped chat — reply in your ' +
  "voice per the principles above; keep it to a few sentences unless real depth is " +
  'asked for.';

/**
 * Builds an agent's full system prompt for a conversation with one enrollment.
 * Never throws — a learner-context failure degrades gracefully to the persona block
 * alone (mirrors mentorService.ts's fail-safe pattern for getLearnerContextBlock,
 * defended again here in case a caller mocks/overrides that function to reject).
 */
export async function buildAgentSystemPrompt(
  personaBlock: string,
  enrollmentId: string,
  options?: BuildAgentSystemPromptOptions,
): Promise<string> {
  const parts: string[] = [personaBlock];

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
