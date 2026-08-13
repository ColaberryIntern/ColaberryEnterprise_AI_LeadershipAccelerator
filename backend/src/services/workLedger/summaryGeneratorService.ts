import { Op } from 'sequelize';
import { Ticket, TicketActionLink, WorkLedgerEvent } from '../../models';
import { getEvidenceForTicket } from '../evidence/evidenceService';

// ProofDesk Milestone 2 (Proof & Ticket Experience), spec section 10.2/10.3. Generates
// the ticket detail Story tab's 3-line summary: Outcome / Proof / Human action.
//
// HARD RULE (spec 10.3, non-negotiable): this function may only assert a claim like
// "verified" / "deployed" / "sent" / "fixed" when a matching typed evidence or ledger
// event record actually backs it. With zero linked evidence it must emit an honest,
// neutral line for every one of the 3 output fields — never invent progress that isn't
// recorded. Every test in summaryGeneratorService.test.ts that exercises a
// hasEvidence:false branch asserts outcome/proof/humanAction ALL fail to match
// /verified|deployed|sent|fixed/i — not just the field the branch happens to be
// "about" — because a claim word leaking into any one of the 3 lines is the failure
// mode this rule exists to prevent (a real regression caught in review: the
// "success reported, no evidence" branch's humanAction used to contain the literal
// word "verified" and the test only checked outcome, not humanAction — fixed by
// rewording the string and asserting all 3 fields in that test).

export interface TicketSummary {
  outcome: string;
  proof: string;
  humanAction: string;
  hasEvidence: boolean;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return 'an unknown time';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return 'an unknown time';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function describeIntent(intent: string): string {
  // work_ledger_events.intent values are dotted machine strings (e.g.
  // 'ticket.dispatch', 'ticket.status_change') — render them readably without
  // inventing detail the event doesn't carry.
  return intent.replace(/^ticket\./, '').replace(/_/g, ' ');
}

function summarizeArtifactTypes(evidence: Array<{ artifact_type: string }>): string {
  const counts = new Map<string, number>();
  for (const e of evidence) counts.set(e.artifact_type, (counts.get(e.artifact_type) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([type, n]) => `${n} ${type}${n === 1 ? '' : 's'}`)
    .join(', ');
}

/**
 * Generate the Outcome/Proof/Human-action summary for a ticket from its linked
 * work_ledger_events (via ticket_action_links, both primary and related roles) and
 * evidence_artifacts (via evidence_links). Throws if the ticket does not exist.
 */
export async function generateTicketSummary(ticketId: string): Promise<TicketSummary> {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const links = await TicketActionLink.findAll({ where: { ticket_id: ticketId } });
  const eventIds = links.map((l) => l.event_id);
  const events =
    eventIds.length > 0
      ? await WorkLedgerEvent.findAll({
          where: { event_id: { [Op.in]: eventIds } },
          order: [['occurred_at', 'DESC']],
        })
      : [];

  const evidence = await getEvidenceForTicket(ticketId);
  const hasEvidence = evidence.length > 0;

  const successEvents = events.filter((e) => e.result === 'success');
  const failureEvents = events.filter((e) => e.result === 'failure');

  const proofLine = hasEvidence
    ? `Proof: ${evidence.length} evidence item${evidence.length === 1 ? '' : 's'} recorded (${summarizeArtifactTypes(evidence)}).`
    : 'Proof: No proof recorded yet for this ticket.';

  if (successEvents.length > 0 && hasEvidence) {
    const latest = successEvents[0];
    return {
      outcome: `Outcome: ${describeIntent(latest.intent)} completed successfully by ${latest.actor_id} at ${formatDate(latest.occurred_at)}.`,
      proof: proofLine,
      humanAction: 'Human action: review the linked evidence in the Visual Proof tab; no action required unless a discrepancy is found.',
      hasEvidence,
    };
  }

  if (successEvents.length > 0 && !hasEvidence) {
    const latest = successEvents[0];
    return {
      outcome: `Outcome: ${describeIntent(latest.intent)} was reported successful by ${latest.actor_id} at ${formatDate(latest.occurred_at)}, but no evidence has been recorded to confirm it.`,
      proof: proofLine,
      humanAction: 'Human action: attach evidence (screenshot, log, or diff) to confirm this outcome.',
      hasEvidence,
    };
  }

  if (failureEvents.length > 0) {
    const latest = failureEvents[0];
    return {
      outcome: `Outcome: ${describeIntent(latest.intent)} failed at ${formatDate(latest.occurred_at)} (${latest.reason_code || 'no reason code recorded'}).`,
      proof: proofLine,
      humanAction: 'Human action: investigate the failure and re-dispatch or resolve manually.',
      hasEvidence,
    };
  }

  return {
    outcome: 'Outcome: No ledger activity recorded yet for this ticket.',
    proof: proofLine,
    humanAction: 'Human action: no automated activity yet — assign or dispatch this ticket to begin work.',
    hasEvidence,
  };
}
