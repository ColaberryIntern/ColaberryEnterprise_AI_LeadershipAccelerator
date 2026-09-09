import { PendingOneOnOneConfirmation } from '../models/AgentManagerConversation';
import { createOneOnOne } from './agentOneOnOneService';

/**
 * managerOneOnOneIntentService — Reese Agentic AI Employee mission,
 * Capability 8's SCHEDULE slice of the manager-intent classifier. Second
 * real intent to ride the generic `pending_intent_confirmation` column,
 * following managerGoalIntentService.ts's exact shape (deterministic
 * keyword detection -> confirmation card -> confirmed-reply-gated write).
 *
 * Deliberately keyword-based, not an LLM classifier, for the same reason as
 * the other two intent services: a false positive here only ever produces a
 * confirmation CARD, never a write — a manager who didn't mean it just
 * declines or ignores it.
 *
 * Unlike CHANGE_GOAL, there is no numeric target or metric to parse here —
 * agentOneOnOneService.createOneOnOne() takes only a free-text `agenda`
 * (Checkpoint D's own AgentOneOnOne model has no scheduled-for date/time
 * field at all; `held_at` is set only on completion). So this detector's
 * whole job is recognizing the trigger phrase — the manager's own message
 * becomes the agenda verbatim, never summarized or reworded.
 */

const SCHEDULE_TRIGGER_PHRASES = [
  'schedule a 1:1', 'schedule a one-on-one', 'schedule a one on one', 'schedule a check-in', 'schedule a checkin',
  'set up a 1:1', 'set up a one-on-one', 'set up a check-in',
  "let's do a 1:1", 'book a 1:1', 'book a one-on-one',
];

export interface DetectedOneOnOneIntent {
  agenda: string;
}

/** Pure, deterministic. Returns null unless a real scheduling trigger phrase
 * appears — no guessing at an agenda when none was really asked for. */
export function detectScheduleOneOnOneIntent(messageText: string): DetectedOneOnOneIntent | null {
  const lower = messageText.toLowerCase();
  if (!SCHEDULE_TRIGGER_PHRASES.some((p) => lower.includes(p))) return null;
  return { agenda: messageText.trim() };
}

/** Restates what was understood, states the real effect, before anything is
 * written — same posture as the reliability and goal-change cards. */
export function buildOneOnOneConfirmationCardText(detected: DetectedOneOnOneIntent): string {
  return (
    `I understood: you want to schedule a 1:1 — you said "${detected.agenda}"\n\n` +
    `Here's what I'd do: create a scheduled 1:1 on my profile with that as the agenda, visible to you and anyone ` +
    `else reviewing my activity.\n\n` +
    `Reply "confirm" to schedule it, or tell me the right agenda and I'll ask again.`
  );
}

export function toPendingOneOnOneConfirmation(detected: DetectedOneOnOneIntent): PendingOneOnOneConfirmation {
  return {
    intentType: 'SCHEDULE_ONE_ON_ONE',
    agenda: detected.agenda,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Executes a confirmed pending 1:1 schedule for real — the one place this
 * flow actually writes durable state. Reuses agentOneOnOneService.createOneOnOne()
 * wholesale (Checkpoint D infrastructure) rather than a second, drifting
 * write path.
 */
export async function applyConfirmedOneOnOneSchedule(
  agentId: string,
  pending: PendingOneOnOneConfirmation,
  confirmedByEmail: string,
  confirmedByOrgMemberId: string | null,
): Promise<{ summary: string }> {
  await createOneOnOne(agentId, confirmedByOrgMemberId, confirmedByEmail, pending.agenda);
  return { summary: `Done. 1:1 scheduled — agenda: "${pending.agenda}". I'll track it from here.` };
}
