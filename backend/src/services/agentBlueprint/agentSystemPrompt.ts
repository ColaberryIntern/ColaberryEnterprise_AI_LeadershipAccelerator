import { getLearnerContextBlock } from '../learnerContextService';
import { getActiveDirectiveTexts } from '../managerDirectiveService';
import { getApprovedMemoryTexts } from '../agentMemoryProposalService';
import { PLATFORM_SAFETY_RULES_BLOCK } from './platformSafetyRules';
import { buildRoleCharterBlock, buildReliabilityStateBlock } from './agentContextLayers';

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
 *
 * AI Workforce Management, Checkpoint E (2026-08-31) — approved
 * AgentMemoryProposal rows are injected here too, on the same `agentId`
 * trigger, via getApprovedMemoryTexts(). This is the actual proof that
 * memory-approval state is read by the runtime, not a dead flag like
 * OpenclawLearning.applied: a proposal reaches this prompt if and only if
 * its status is 'approved', queried fresh on every call.
 *
 * Reese Agentic AI Employee mission, Capability 8 (2026-09-08) — the
 * "byte-for-byte identical" claim above no longer holds: every call now
 * unconditionally gets 2 new layers ahead of the persona block (platform
 * safety rules, then a role charter when the caller passes `agentId` and
 * one is set) and a reliability-state layer before the learner-context
 * block — reordering both this and agentManagerConversationPrompt.ts
 * toward the mission's mandated 10-layer runtime-context sequence. See
 * agentContextLayers.ts and platformSafetyRules.ts for the 2 new shared
 * layer builders (one real implementation, used by both prompt paths).
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
  /** Reese Agentic AI Employee mission, Capability 8 — caller-supplied
   * blocks (e.g. Student Success 360 evidence) inserted BEFORE the closing
   * line, in the mandated runtime-context order's layer-6 position, rather
   * than appended after the whole prompt by the caller. */
  extraBlocksBeforeClosing?: string[];
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

function buildMemoryBlock(memories: string[]): string {
  const lines = memories.map((m) => `- ${m}`).join('\n');
  return '\nAPPROVED MEMORY (facts a manager has reviewed and approved about this context):\n' + lines;
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
  // Reese Agentic AI Employee mission, Capability 8 — runtime context layers
  // 1-2 (immutable platform safety rules, then role charter and authority)
  // now precede the persona block itself, per the mission's mandated order.
  // Layer 1 is universal and static; layer 2 needs a real agentId, same gate
  // as directives/memory below.
  const parts: string[] = ['\n' + PLATFORM_SAFETY_RULES_BLOCK];

  if (options?.agentId) {
    const roleCharterBlock = await buildRoleCharterBlock(options.agentId);
    if (roleCharterBlock) parts.push('\n' + roleCharterBlock);
  }

  parts.push(personaBlock);

  if (options?.agentId) {
    const directives = await getActiveDirectiveTexts(options.agentId);
    if (directives.length) parts.push(buildDirectiveBlock(directives));

    const memories = await getApprovedMemoryTexts(options.agentId);
    if (memories.length) parts.push(buildMemoryBlock(memories));
  }

  // Layer 5 — current metric reliability/quarantine state. Always present
  // (see agentContextLayers.ts's own header for why this one doesn't stay
  // silent when healthy).
  parts.push('\n' + (await buildReliabilityStateBlock()));

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

  for (const block of options?.extraBlocksBeforeClosing ?? []) {
    if (block) parts.push('\n' + block);
  }

  parts.push(options?.closingLine ?? DEFAULT_CLOSING_LINE);

  return parts.join('\n');
}
