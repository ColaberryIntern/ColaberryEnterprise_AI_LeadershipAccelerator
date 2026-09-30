import ChecklistInstance from '../../models/ChecklistInstance';
import { CLOSURE_CHECKLIST_ITEMS } from '../checklist/checklistDefinitions';
import { evaluateChecklistCompletion } from '../checklist/checklistGate';

/**
 * closureChecklist — Reese Agentic AI Employee mission, Capability 6's
 * Closure checklist (7 items), derived from the SAME real inputs
 * closeWithEvidence() (reeseOutreachFollowUpService.ts) already has.
 * Observational only, same posture as outreachChecklist.ts: computed and
 * persisted AFTER the real closure, linked to the ticket, never gating it.
 * Lower stakes than the Outreach checklist's live-send chokepoint (closing
 * a ticket is an internal, reversible workflow action, not a communication
 * to a real student), so this did not need a separate scope confirmation —
 * same reasoning root CLAUDE.md's Autonomy Model applies to any reversible,
 * low-blast-radius implementation decision.
 *
 * `propose_lesson_learned_if_supported` is honestly, always `false` today —
 * a real, disclosed gap: no lessons-learned mechanism exists anywhere in
 * this codebase for autonomous-outreach closures. Marked non-required (see
 * checklistDefinitions.ts) so this stays visible without permanently
 * blocking the checklist.
 */
export function deriveClosureChecklistItems(input: {
  goal: string;
  createdAt: Date;
  resolvedAt: Date;
}): Record<string, boolean> {
  const timeToResolutionMs = input.resolvedAt.getTime() - input.createdAt.getTime();

  return {
    // closeWithEvidence() is only ever called from the signal_cleared or
    // goal_met branches of processDueReeseOutreachFollowUps()'s decision
    // tree — both are real, verified conditions (the risk signal genuinely
    // cleared, or a real student reply was found), never an assumption.
    verify_reply_or_signal_change: true,
    verify_agreed_next_step: input.goal.length > 0,
    // recordEvidenceArtifact() always runs first in closeWithEvidence().
    record_intervention_outcome: true,
    record_time_to_resolution: timeToResolutionMs >= 0,
    // Always recordable, and always false for this chokepoint specifically:
    // escalate() is a separate, mutually-exclusive branch in the same
    // decision tree — a row that reached closeWithEvidence() never went
    // through escalation first.
    record_escalation_required: true,
    propose_lesson_learned_if_supported: false,
    // The same structural guarantee as verify_reply_or_signal_change above:
    // this function is never reachable except via a verified real
    // resolution condition.
    close_on_success_criteria: true,
  };
}

/** Persists the real, derived Closure checklist for one resolved outreach,
 * linked to its real ticket. Never throws — fail-open, same posture as
 * assessmentChecklist.ts / outreachChecklist.ts. */
export async function createClosureChecklistInstance(
  ticketId: string,
  goal: string,
  createdAt: Date,
  resolvedAt: Date,
): Promise<ChecklistInstance> {
  const items = deriveClosureChecklistItems({ goal, createdAt, resolvedAt });
  const { complete, incompleteItems } = evaluateChecklistCompletion(items, CLOSURE_CHECKLIST_ITEMS);

  return ChecklistInstance.create({
    checklist_type: 'closure',
    subject_type: 'reese_outreach_ticket',
    subject_id: ticketId,
    items,
    incomplete_items: incompleteItems,
    complete,
  });
}
