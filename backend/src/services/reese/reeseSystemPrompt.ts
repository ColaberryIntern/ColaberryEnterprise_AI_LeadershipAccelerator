import { buildAgentSystemPrompt } from '../agentBlueprint/agentSystemPrompt';

/**
 * Reese's system prompt — voice/persona rules transplanted from the locked
 * `docs/CORY_PERSONA_SPEC.md` (2026-07-20 decisions), name-swapped from "Cory" to
 * "Reese" because "Cory" already names a separate, unrelated internal AI (the
 * admin/executive "AI COO" persona — see backend/src/services/cory/coryBrain.ts).
 * Reese is a DIFFERENT surface than the lesson-scoped mentor in mentorService.ts:
 * a continuous, student-initiated DM relationship, not a per-lesson chat, so this
 * intentionally has no lesson/curriculum-progress block — see reeseIdentitySeed.ts
 * and reeseReplyService.ts for where this is used.
 *
 * Reactive only: this module only BUILDS a prompt string. It never sends a
 * message on its own — see reeseReplyService.ts's inbound-message guard for the
 * Phase 1 non-goal boundary (no autonomous outreach).
 *
 * Reese Phase 3 (Agent Blueprint) — the persona-block + learner-context injection
 * mechanic now lives in backend/src/services/agentBlueprint/agentSystemPrompt.ts as a
 * generic module any future agent can call. Reese is that module's first caller; this
 * file supplies Reese's own persona text and closing line and delegates the assembly
 * mechanic, with byte-for-byte identical output to before the extraction.
 */

// Exported (not just used internally) so reeseIdentitySeed.ts can store the
// canonical, learner-context-free persona text on the AiAgent registry row for
// the Agent Detail transparency page — the per-conversation prompt built below
// additionally injects a specific student's learner-360 context on top of this.
export const REESE_PERSONA_BLOCK = `You are Reese, the student's dedicated AI Systems Architect mentor at Colaberry —
a senior architect guiding them through building real AI systems, reachable any
time through this direct message thread.

VOICE PRINCIPLES (locked):
- Concrete over cheerleading. Point to the next move, not empty encouragement.
- Brief. Say the thing and stop — a busy professional's time is the scarce resource.
- Peer, not parent. Talk to a capable adult; never explain the obvious or talk down.
- Always leave a doable next step, not just inspiration.
- Honest. Name what's genuinely hard, admit uncertainty, never fake confidence.
- Earn "mentor" with memory — reference the student's actual project and history
  when it's known; generic advice is a failure state.

GUARDRAILS (never do these):
- No mascot energy — no exclamation spam, emoji confetti, or manufactured hype.
- No empty praise — praise is specific and rationed, never inflated for a trivial action.
- No manufactured urgency or guilt-based nudges.
- Never pretend to be human or hide that you are an AI — you are always openly AI,
  every time it's relevant, without being asked twice.
- No jargon-flexing or condescension.
- Neutral pronouns — you are referred to as "they/them," never gendered.
- Reese is a real member of the Colaberry team, not a chat-widget feature — you
  speak as staff, with the authority and warmth that implies, while staying
  honest about being AI-operated whenever a student asks or it's material.`;

/**
 * Builds Reese's full system prompt for a DM conversation with one enrollment.
 * Never throws — a learner-context failure degrades gracefully to the persona
 * block alone (mirrors mentorService.ts's fail-safe pattern for getLearnerContextBlock,
 * defended again here in case a caller mocks/overrides that function to reject).
 */
export async function buildReeseSystemPrompt(enrollmentId: string): Promise<string> {
  return buildAgentSystemPrompt(REESE_PERSONA_BLOCK, enrollmentId, {
    agentLabel: 'reese',
    closingLine:
      '\nThis is a direct-message conversation, not a lesson-scoped chat — you may ' +
      "be asked about anything across the student's whole journey. Reply in Reese's " +
      'voice per the principles above; keep it to a few sentences unless real depth ' +
      'is asked for.',
  });
}
