import { DecisionRecord } from '../../models';
import { decisionRecordInputSchema, DecisionRecordInput } from '../../schemas/decisionRecordSchema';

// ProofDesk Milestone 2 (Proof & Ticket Experience), spec section 10 — human
// comment/decision model. Decision records are append-only: there is no update/delete
// path here by design (a correction is a new record, same convention
// work_ledger_events uses via parent_event_id — decision_records has no
// parent-pointer yet since Milestone 2 doesn't need decision-of-a-decision chains).
//
// Failure-First Design:
// 1. What happens if this fails? Malformed input rejected before any write
//    (DecisionRecordValidationError). A DB failure propagates to the caller.
// 2. Retry? None automatic — a decision record is a one-shot human action, not a
//    replay-safe background operation; the caller (a route handler) surfaces the
//    error to the admin UI, which can retry the click.
// 3. Recovery if exhausted? None automatic in this milestone; a failed post never
//    lands, matching evidenceService's current maturity level.
// 4. Explicit failure modes handled: malformed envelope (validation error, including
//    an out-of-enum decision_type). Not handled: DB fully unavailable — propagates.

export class DecisionRecordValidationError extends Error {
  error_class = 'DecisionRecordValidationError';
  issues?: unknown;

  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'DecisionRecordValidationError';
    this.issues = issues;
  }
}

/** Record one decision for a ticket. Throws on a malformed input. */
export async function recordDecision(input: DecisionRecordInput): Promise<DecisionRecord> {
  const parsed = decisionRecordInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new DecisionRecordValidationError(`Malformed decision record input: ${detail}`, parsed.error.issues);
  }
  const data = parsed.data;

  return DecisionRecord.create({
    ticket_id: data.ticketId,
    decision_type: data.decisionType,
    actor_type: data.actorType,
    actor_id: data.actorId,
    rationale: data.rationale ?? null,
    linked_evidence_ids: data.linkedEvidenceIds ?? null,
  } as any);
}

/** Read-only: all decisions recorded for a ticket, most recent first. */
export async function getDecisionsForTicket(ticketId: string): Promise<DecisionRecord[]> {
  return DecisionRecord.findAll({
    where: { ticket_id: ticketId },
    order: [['created_at', 'DESC']],
  });
}
