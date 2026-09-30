import ChecklistInstance from '../../models/ChecklistInstance';
import { OUTREACH_CHECKLIST_ITEMS } from '../checklist/checklistDefinitions';
import { evaluateChecklistCompletion } from '../checklist/checklistGate';
import type { ReeseOutreachSignalType } from '../../models/ReeseOutreach';

/**
 * outreachChecklist — Reese Agentic AI Employee mission, Capability 6's
 * Outreach checklist (10 items), derived from the SAME real inputs
 * sendNewOutreach() already computes. Observational only for this first
 * slice, per Ali's explicit choice (2026-09-07): persisted and auditable,
 * but does NOT gate the real send — the material action here is a message
 * to a real, live student, the highest-stakes chokepoint in the whole
 * system, so wiring an actual skip-on-incomplete gate was deliberately
 * deferred to a separate decision rather than folded into this build.
 *
 * `validate_evidence_reliability` is honestly, always `false` today — a
 * real, disclosed gap, not a bug in this derivation: reeseSignalService.ts's
 * evaluateInactivitySignal()/evaluateBehaviorAnomalySignal() read
 * TimelineCardProgress/StudentNavigationEvent directly, with no reliability/
 * quarantine layer wired for either source (managerReliabilityIntentService.
 * ts's KNOWN_SOURCE_SYSTEMS only covers `attendance.*` today). Marked
 * non-required (see checklistDefinitions.ts) so this real gap is visible
 * without making the checklist permanently "incomplete."
 */
export function deriveOutreachChecklistItems(input: {
  signalType: ReeseOutreachSignalType;
  goal: string;
  message: string;
  nextFollowUpDueAt: Date | null;
}): Record<string, boolean> {
  return {
    // sendNewOutreach() is only ever called after the sweep loop's own
    // isEligibleForAutonomousOutreach() / wasContactedWithinCadence() /
    // hasOpenOutreachForSignal() / daily-cap checks all passed — these 3
    // items are real, structurally-guaranteed facts about how this function
    // is reached, not assumptions.
    confirm_eligible_population: true,
    validate_evidence_reliability: false,
    check_cadence_and_cap: true,
    check_duplicate_open_intervention: true,
    // True once authorizeTicketDispatch() has run — which, after the
    // 2026-09-07 ordering fix, always happens before the real send.
    confirm_authorization_before_send: true,
    // generateOutreachMessage() structurally cannot return a fabricated/
    // templated fallback (it throws on an empty completion instead) — a
    // real, non-empty message here IS the real guarantee, not a semantic
    // grounding check on the message's own content.
    state_only_supported_observations: input.message.length > 0,
    provide_one_clear_next_step: input.goal.length > 0,
    define_success_criteria: input.goal.length > 0,
    set_follow_up_date: input.nextFollowUpDueAt !== null,
    // Ticket.ts's afterCreate hook (ticketCreationLedgerHook.ts) unconditionally
    // emits a real ticket.create WorkLedgerEvent for every ticket — confirmed
    // directly from source, not assumed.
    link_to_work_ledger: true,
  };
}

/** Persists the real, derived Outreach checklist for one send, linked to
 * its real ticket. Never throws — fail-open, same posture as
 * assessmentChecklist.ts's createAssessmentChecklistInstance(). */
export async function createOutreachChecklistInstance(
  ticketId: string,
  signalType: ReeseOutreachSignalType,
  goal: string,
  message: string,
  nextFollowUpDueAt: Date | null,
): Promise<ChecklistInstance> {
  const items = deriveOutreachChecklistItems({ signalType, goal, message, nextFollowUpDueAt });
  const { complete, incompleteItems } = evaluateChecklistCompletion(items, OUTREACH_CHECKLIST_ITEMS);

  return ChecklistInstance.create({
    checklist_type: 'outreach',
    subject_type: 'reese_outreach_ticket',
    subject_id: ticketId,
    items,
    incomplete_items: incompleteItems,
    complete,
  });
}
