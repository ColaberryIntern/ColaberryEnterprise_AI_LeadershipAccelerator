import { PendingAssignWorkConfirmation } from '../models/AgentManagerConversation';
import { AgentDeactivatedError, AgentNotInHierarchyError, assignTaskToAgent } from './workforce/orgChartTaskAssignmentService';

/**
 * managerAssignWorkIntentService — Reese Agentic AI Employee mission,
 * Capability 8's ASSIGN_WORK slice of the manager-intent classifier. Fourth
 * real intent to ride the generic `pending_intent_confirmation` column,
 * following managerDirectiveIntentService.ts's exact shape (deterministic
 * keyword detection -> confirmation card -> confirmed-reply-gated write).
 *
 * Deliberately keyword-based for the same reason as the other three intent
 * services: a false positive here only ever produces a confirmation CARD,
 * never a write. Same "no fragile extraction" posture as SCHEDULE_ONE_ON_ONE
 * and INSTRUCT — the manager's own message becomes the task title verbatim,
 * never summarized or reworded.
 *
 * Reuses orgChartTaskAssignmentService.assignTaskToAgent() wholesale (Org
 * Chart v3 infrastructure, already real and tested) rather than a second,
 * drifting write path — this is the SAME real task-assignment action the
 * Org Chart page's own "assign a task" button performs, just triggered
 * conversationally. That function enforces its own real authorization
 * boundary (the target agent must genuinely be in the confirming manager's
 * downstream hierarchy, and must be enabled) — this service does not
 * duplicate that check, it surfaces the real outcome honestly either way.
 */

const ASSIGN_WORK_TRIGGER_PHRASES = [
  'new task', 'assign you a task', 'assign this task', 'your task is',
  "here's your task", 'i need you to work on', 'please work on',
  'your assignment is', 'give you a task', 'assign a task to you',
];

export interface DetectedAssignWorkIntent {
  title: string;
}

/** Pure, deterministic. Returns null unless a real task-assignment trigger
 * phrase appears — no guessing at a task when none was really asked for. */
export function detectAssignWorkIntent(messageText: string): DetectedAssignWorkIntent | null {
  const lower = messageText.toLowerCase();
  if (!ASSIGN_WORK_TRIGGER_PHRASES.some((p) => lower.includes(p))) return null;
  return { title: messageText.trim() };
}

/** Restates what was understood, states the real effect (this becomes a
 * real ticket assigned to this agent, not a one-off conversational ask)
 * before anything is written. */
export function buildAssignWorkConfirmationCardText(detected: DetectedAssignWorkIntent): string {
  return (
    `I understood: you want to assign me a task — you said "${detected.title}"\n\n` +
    `Here's what I'd do: create a real ticket for this, assigned to me.\n\n` +
    `Reply "confirm" to assign it, or tell me the right wording and I'll ask again.`
  );
}

/** The idempotency key is minted here, once, at detection time — the same
 * key rides the pending record through to applyConfirmedAssignWork(), so a
 * retried confirmation can never create a duplicate ticket. */
export function toPendingAssignWorkConfirmation(detected: DetectedAssignWorkIntent): PendingAssignWorkConfirmation {
  return {
    intentType: 'ASSIGN_WORK',
    title: detected.title,
    idempotencyKey: crypto.randomUUID(),
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Executes a confirmed pending task assignment for real — the one place
 * this flow actually writes durable state. Reuses
 * orgChartTaskAssignmentService.assignTaskToAgent() wholesale (Org Chart v3
 * infrastructure) rather than a second, drifting write path.
 *
 * assignTaskToAgent() requires a real org_member id (task assignment is
 * hierarchy-based authorization, unlike the other three intents' writes,
 * which all accept a nullable org_member_id) — a platform super_admin with
 * no linked org_member row is told honestly why this can't complete rather
 * than the write being attempted with a fabricated id.
 */
export async function applyConfirmedAssignWork(
  agentId: string,
  pending: PendingAssignWorkConfirmation,
  // Unused: assignTaskToAgent() attributes the ticket to confirmedByOrgMemberId,
  // not an email. Kept in the signature to match every sibling applyConfirmed*()
  // so handlePendingGenericIntentConfirmation can call all four identically.
  _confirmedByEmail: string,
  confirmedByOrgMemberId: string | null,
): Promise<{ summary: string }> {
  if (!confirmedByOrgMemberId) {
    return {
      summary:
        "I can't assign work through this chat — task assignment needs a real employee profile linked to your " +
        'account, and yours doesn\'t have one. Ask an admin to link your org profile, or assign this from the Org Chart page instead.',
    };
  }

  try {
    await assignTaskToAgent({
      orgMemberId: confirmedByOrgMemberId,
      agentId,
      title: pending.title,
      idempotencyKey: pending.idempotencyKey,
    });
  } catch (err) {
    if (err instanceof AgentNotInHierarchyError || err instanceof AgentDeactivatedError) {
      return { summary: `I couldn't assign that: ${err.message}` };
    }
    throw err;
  }

  return { summary: `Done. New task assigned: "${pending.title}". I'll pick it up.` };
}
