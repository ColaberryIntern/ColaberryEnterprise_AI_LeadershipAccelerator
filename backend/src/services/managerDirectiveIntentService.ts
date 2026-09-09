import { PendingDirectiveConfirmation } from '../models/AgentManagerConversation';
import { createDirective } from './managerDirectiveService';

/**
 * managerDirectiveIntentService — Reese Agentic AI Employee mission,
 * Capability 8's INSTRUCT slice of the manager-intent classifier. Third
 * real intent to ride the generic `pending_intent_confirmation` column,
 * following managerGoalIntentService.ts/managerOneOnOneIntentService.ts's
 * exact shape (deterministic keyword detection -> confirmation card ->
 * confirmed-reply-gated write).
 *
 * Deliberately keyword-based for the same reason as the other two intent
 * services: a false positive here only ever produces a confirmation CARD,
 * never a write.
 *
 * Like SCHEDULE_ONE_ON_ONE, there is no field to parse beyond the trigger
 * phrase itself — managerDirectiveService.createDirective() takes only a
 * free-text directive, so the manager's own message becomes the directive
 * text verbatim, never summarized or reworded. Deliberately conservative
 * trigger phrases: a standing instruction is a real governance action (it
 * gets injected into every future prompt this agent sees — see
 * agentSystemPrompt.ts's MANAGER DIRECTIVES block), so this requires an
 * explicit "this is a standing rule" phrase rather than firing on any
 * imperative sentence a manager might type in normal conversation.
 */

const DIRECTIVE_TRIGGER_PHRASES = [
  'new directive', 'standing directive', 'standing instruction', 'standing rule',
  'from now on', 'going forward', 'make it a rule that', "here's your instruction",
  'your new instruction is', 'always remember to', 'always make sure to',
];

export interface DetectedDirectiveIntent {
  directiveText: string;
}

/** Pure, deterministic. Returns null unless a real standing-directive
 * trigger phrase appears — no guessing at a directive when none was really
 * asked for. */
export function detectInstructIntent(messageText: string): DetectedDirectiveIntent | null {
  const lower = messageText.toLowerCase();
  if (!DIRECTIVE_TRIGGER_PHRASES.some((p) => lower.includes(p))) return null;
  return { directiveText: messageText.trim() };
}

/** Restates what was understood, states the real effect (this becomes a
 * real, standing instruction injected into every future conversation, not
 * a one-off acknowledgement) before anything is written. */
export function buildDirectiveConfirmationCardText(detected: DetectedDirectiveIntent): string {
  return (
    `I understood: you want to give me a standing directive — you said "${detected.directiveText}"\n\n` +
    `Here's what I'd do: save that as an active directive on my profile. I'll follow it in every conversation ` +
    `from now on, until you revoke it.\n\n` +
    `Reply "confirm" to save it, or tell me the right wording and I'll ask again.`
  );
}

export function toPendingDirectiveConfirmation(detected: DetectedDirectiveIntent): PendingDirectiveConfirmation {
  return {
    intentType: 'INSTRUCT',
    directiveText: detected.directiveText,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Executes a confirmed pending directive for real — the one place this flow
 * actually writes durable state. Reuses managerDirectiveService.createDirective()
 * wholesale (Checkpoint C infrastructure) rather than a second, drifting
 * write path.
 */
export async function applyConfirmedDirective(
  agentId: string,
  pending: PendingDirectiveConfirmation,
  confirmedByEmail: string,
  confirmedByOrgMemberId: string | null,
): Promise<{ summary: string }> {
  await createDirective(agentId, confirmedByOrgMemberId, confirmedByEmail, pending.directiveText);
  return { summary: `Done. New standing directive saved: "${pending.directiveText}". I'll follow it from here.` };
}
