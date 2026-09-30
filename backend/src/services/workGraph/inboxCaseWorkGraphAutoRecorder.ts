import type { CaseState } from '../../types/inboxCase';
import { getEvidenceExpectations } from '../workLedger/evidenceExpectationService';
import { listWorkUnitsForTicket, createWorkUnit, addWorkUnitDependency } from './workGraphService';

// ProofDesk Work Graph auto-recorder for Inbox Cases (2026-08-23) — Ali, live, on
// the SAME real ticket the Decisions-tab gap fix (ticketDecisionAutoRecorder.ts,
// this same session) closed: "I don't see any visual proofs or work graphs in
// your examples." That fix corrected the LABEL (not_applicable -> expected) for
// inbox_case tickets; nothing in this repo had ever actually WRITTEN a work
// unit automatically — createWorkUnit()'s only caller was the manual admin
// route. This module is the first real automated writer for Work Graph:
//
// One TicketWorkUnit per REAL CaseState an inbox case actually enters
// (types/inboxCase.ts's 11-state CASE_STATES/CASE_STATE_TRANSITIONS — the real
// state machine, not the ticket description's 7-word narrative paraphrase),
// each chained by a real dependency edge to the unit it superseded — a genuine,
// honest timeline of what happened. Deliberately NOT a fabricated straight-line
// story: the real state machine can loop (e.g. ASSESSING <-> NEEDS_ALI), and
// this records every real entry into a state, even a revisit, rather than
// pretending the case moved through 7 stages in a tidy line.
//
// Failure-First Design: called from caseTicketService.ts's syncTicketForCase(),
// which must never let a work-graph write break the real case workflow — every
// failure here is caught and logged, never rethrown.

const CASE_STATE_LABELS: Record<CaseState, string> = {
  DISCOVERING: 'Discovering the case',
  ASSESSING: 'Assessing the case',
  NEEDS_ALI: "Needs Ali's input",
  READY_TO_PLAN: 'Ready to plan next actions',
  AWAITING_APPROVAL: 'Awaiting approval',
  EXECUTING: 'Executing approved actions',
  WAITING: 'Waiting on an external response',
  DELEGATED: 'Delegated to someone else',
  RESOLVED: 'Resolved',
  FAILED: 'Failed',
  REOPENED: 'Reopened',
};

const ACTOR_ID = 'InboxCaseEngine';

/**
 * Records this case's real current state as one work unit, chained to
 * whatever unit came before it. Idempotent: a re-write of the SAME state as
 * the ticket's most recently recorded unit is a no-op (InboxCase.state
 * writes aren't guaranteed to always represent a genuine value change).
 * Honesty-gated on the real classifier, not hardcoded to 'inbox_case', so
 * this only ever writes for a ticket type evidenceExpectationService.ts
 * actually marks workGraph:'expected'.
 */
export async function recordWorkUnitForCaseState(
  ticketId: string,
  ticketType: string,
  state: CaseState,
): Promise<void> {
  const expectations = getEvidenceExpectations({ type: ticketType, created_by_type: 'agent' });
  if (expectations.workGraph !== 'expected') return;

  try {
    const existing = await listWorkUnitsForTicket(ticketId);
    const latest = existing[existing.length - 1] as any;
    const label = CASE_STATE_LABELS[state];
    if (latest && latest.title === label) return; // same state re-written — no duplicate unit

    if (latest && latest.status !== 'done' && latest.status !== 'failed' && latest.status !== 'cancelled') {
      await latest.update({ status: 'done', updated_at: new Date() });
    }

    const created = await createWorkUnit(ticketId, {
      title: label,
      requiredCapability: 'inbox_case_triage',
      status: state === 'RESOLVED' ? 'done' : state === 'FAILED' ? 'failed' : 'in_progress',
    });
    await (created as any).update({ assigned_agent_name: ACTOR_ID });

    if (latest) {
      await addWorkUnitDependency(created.id, { dependsOnWorkUnitId: latest.id });
    }
  } catch (err: any) {
    console.warn(`[inboxCaseWorkGraphAutoRecorder] Failed to record work unit for ticket ${ticketId} state ${state}:`, err.message);
  }
}
