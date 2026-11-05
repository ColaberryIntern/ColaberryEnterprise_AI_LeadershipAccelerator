import { buildAgentSystemPrompt } from '../agentBlueprint/agentSystemPrompt';
import { getDaraAgentId } from './daraIdentitySeed';
import { DARA_STUDENT_PERSONA_BLOCK, DARA_STAFF_PERSONA_BLOCK } from './daraPersona';

/**
 * Dara v2 Phase 3 — builds Dara's full system prompt for a student-initiated
 * curriculum-support DM. Mirrors `reeseSystemPrompt.ts`'s
 * `buildReeseSystemPrompt()` exactly in shape (delegates the persona +
 * learner-context + directive/memory assembly mechanic to the generic
 * `agentSystemPrompt.ts` module), with no Reese-specific highlight blocks —
 * Dara's student surface answers curriculum questions, not student-health
 * mentoring, so it has no equivalent of Reese's Student Success 360 /
 * health-assessment injections.
 *
 * Never throws — a learner-context lookup failure degrades gracefully to the
 * persona block alone (buildAgentSystemPrompt()'s own contract).
 */
export async function buildDaraSystemPrompt(enrollmentId: string): Promise<string> {
  let agentId: string | undefined;
  try {
    agentId = (await getDaraAgentId()) ?? undefined;
  } catch {
    agentId = undefined;
  }

  return buildAgentSystemPrompt(DARA_STUDENT_PERSONA_BLOCK, enrollmentId, {
    agentLabel: 'dara',
    agentId,
    closingLine:
      '\nThis is a direct-message conversation with a student about curriculum or ' +
      "certification. Answer in Dara's voice per the principles above; when the " +
      'question is out of scope, call escalate_to_human and say so plainly in the ' +
      'same reply — never guess at an answer outside your real scope. If the tool ' +
      'result comes back with escalated:false, do NOT tell the student you flagged ' +
      'or escalated anything — say honestly that you could not record it and to try ' +
      'again shortly. Never claim an escalation that did not really happen.',
  });
}

/**
 * C88 — Dara's system prompt when the sender is STAFF (a badge that opens the Program floor; daraReplyService decides with
 * canReachAgent, the same predicate as the C87 gate). No learner-context block: the staff member's own learner profile is
 * not the subject. Never throws (same contract as above).
 */
export async function buildDaraStaffSystemPrompt(enrollmentId: string): Promise<string> {
  let agentId: string | undefined;
  try {
    agentId = (await getDaraAgentId()) ?? undefined;
  } catch {
    agentId = undefined;
  }

  return buildAgentSystemPrompt(DARA_STAFF_PERSONA_BLOCK, enrollmentId, {
    agentLabel: 'dara',
    agentId,
    skipLearnerContext: true,
    closingLine:
      '\nThis is a direct-message conversation with a Colaberry staff member about how the curriculum is landing and ' +
      'how students are keeping up. Use your tools for any figure; if a tool returns no data or an error, say so ' +
      'plainly. Keep it to a few sentences unless the staff member asks for the detail.',
  });
}
