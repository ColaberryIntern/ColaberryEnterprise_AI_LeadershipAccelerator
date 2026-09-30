import type { TicketActorType, TicketStatus } from '../../models/Ticket';
import { recordDecision } from './decisionRecordService';
import { getEvidenceExpectations } from '../workLedger/evidenceExpectationService';

// ProofDesk Decisions-tab gap fix (2026-08-23) — Ali, live, on a real ticket
// screenshot: "there have been tickets opened and closed over the last few
// days, but I still don't see any ... nothing in the decisions tab." Audit
// confirmed recordDecision() had ZERO automated callers anywhere in this
// repo — the only writer was the admin UI's manual "Record" button — so the
// Decisions tab was permanently empty for every ticket type
// evidenceExpectationService.ts marks decisions:'expected' (strategic,
// strategic_initiative, ai_optimization, agent_restructure, agent_creation,
// workflow_redesign, system_automation, company_directive,
// workforce_decision, and any human-filed ticket), no matter how much real
// activity that ticket had.
//
// Extracted out of ticketService.ts's updateTicketStatus() (already over
// CLAUDE.md's 500-line hard ceiling before this change — see that file's own
// header comment logging the pre-existing overage) rather than added inline,
// mirroring getTicketStats()'s own past extraction into ticketStatsService.ts.
//
// Every in_review/done transition on one of those ticket types gets an
// honest, minimal 'note' decision record — a plain factual restatement of
// the transition, never a fabricated 'approve'/'reject' judgment call this
// generic hook has no standing to make on the actor's behalf (a REAL human
// approve/reject via the email-reply flow, ticketReplyService.ts, still
// produces its own record through this same hook, since it calls
// updateTicketStatus() too — no separate wiring needed).
export async function recordAutoDecisionOnStatusChange(
  ticket: { type?: string | null; source?: string | null; created_by_type?: string | null },
  ticketId: string,
  fromStatus: TicketStatus,
  newStatus: TicketStatus,
  actorType: TicketActorType,
  actorId: string,
): Promise<void> {
  if (newStatus !== 'in_review' && newStatus !== 'done') return;

  const expectations = getEvidenceExpectations({
    type: ticket.type as any,
    source: ticket.source,
    created_by_type: ticket.created_by_type as any,
  });
  if (expectations.decisions !== 'expected') return;

  // Failure-isolated: a decision-record failure must never break the status
  // transition itself (see updateTicketStatus()'s own failure-isolation
  // contract for emitLedgerEventSafe/outcome-measurement).
  try {
    await recordDecision({
      ticketId,
      decisionType: 'note',
      actorType,
      actorId,
      rationale: `Ticket transitioned from ${fromStatus} to ${newStatus}.`,
    });
  } catch (err: any) {
    console.warn(`[ticketDecisionAutoRecorder] Auto-decision-record failed for ticket ${ticketId}:`, err.message);
  }
}
