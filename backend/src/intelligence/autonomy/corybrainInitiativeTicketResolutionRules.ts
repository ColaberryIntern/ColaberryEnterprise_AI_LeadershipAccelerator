/**
 * CoryBrain Initiative-Ticket Reconciliation — pure classification rules
 *
 * `coryEvolution.ts`'s `runEvolutionCycle()` calls `coryInitiatives.ts`'s
 * `createStrategicInitiative()` for every high/critical finding, which creates ONE
 * parent ticket (type `ai_optimization`/`workflow_redesign`/etc, `created_by_id:
 * 'CoryBrain'`) plus 3-5 subtask tickets (type `task`, `parent_ticket_id: <parent
 * ticket id>`, `metadata.initiative_id: <initiative id>`, also `created_by_id:
 * 'CoryBrain'`). PR #1491 gave the PARENT ticket a real terminal-state path — it now
 * starts at `in_review` with `entity_type: 'strategic_initiative'`, so a human
 * replying to the approval email flips it to done/cancelled via
 * `ticketReplyService.ts`'s `syncInitiative()`. That mechanism is verified working and
 * explicitly out of scope for this fix.
 *
 * What nothing in the codebase ever does: reconcile a ticket's status with its linked
 * `strategic_initiatives` row when that row reaches a terminal state through any OTHER
 * path — `completeInitiative()`/`rejectInitiative()`/`syncInitiative()` only ever touch
 * the ONE ticket named by `initiative.ticket_id` (never the initiative's subtasks), and
 * the historical `consolidateDuplicateStrategicInitiatives.ts`/
 * `resolveStaleStrategicInitiatives.ts` scripts flip `strategic_initiatives.status` by
 * direct `.update()` (the latter also fixes its OWN candidate ticket, but neither ever
 * touches a subtask). Confirmed live in production (2026-08-16, see this run's
 * execution-contract.md for the full DISCOVER trail): of 1,348 CoryBrain tickets stuck
 * in `backlog`, 1,149 have a linked initiative already `cancelled`, 174 have a linked
 * initiative already `completed`, 24 have a linked initiative still legitimately
 * active, and 1 has no matching initiative row at all — and this is an ONGOING gap, not
 * just historical debt (12 subtask tickets went stale again on 2026-08-16 alone, well
 * after PR #1491 deployed).
 *
 * This module is the pure decision logic (no I/O, no DB) for that reconciliation: given
 * a ticket's shape and the CURRENT live status of the `strategic_initiatives` row it is
 * linked to (the caller already resolved that link and re-queried the row fresh), decide
 * whether the ticket should be closed to match. This is a SYNC fix, not a new decision
 * engine — it never re-derives whether an initiative itself should be
 * approved/rejected/completed (that authority stays entirely with the already-fixed
 * mechanism); it only propagates a fact that mechanism has already established.
 *
 * No time-based fallback of any kind lives in this file: no wall-clock-vs-stored-
 * timestamp delta, no ticket-age comparison, no "close after N days untouched"
 * heuristic anywhere. A dedicated test in this file's `__tests__` greps this file's own
 * source for the tokens such a gate would require and asserts zero matches.
 */

export type CoryBrainInitiativeStatus = 'proposed' | 'approved' | 'in_progress' | 'completed' | 'cancelled';

export type CoryBrainTicketResolutionOutcome =
  | 'initiative_cancelled'
  | 'initiative_completed'
  | 'initiative_still_active'
  | 'initiative_not_found';

export interface CoryBrainTicketClassificationInput {
  ticketId: string;
  /** true for a subtask ticket (parent_ticket_id set), false for the initiative's own
   * parent ticket (parent_ticket_id null). Evidence-note wording only — the decision
   * logic itself is identical for both shapes. */
  isSubtask: boolean;
  /** The strategic_initiatives.id this ticket resolves to (via `ticket_id` reverse
   * lookup for a parent ticket, or `metadata.initiative_id` for a subtask), or null if
   * the caller found no matching row. */
  linkedInitiativeId: string | null;
  /** The CURRENT, freshly-queried strategic_initiatives.status for linkedInitiativeId,
   * or null when linkedInitiativeId itself is null. */
  linkedInitiativeStatus: CoryBrainInitiativeStatus | null;
  linkedInitiativeTitle: string | null;
}

export interface CoryBrainTicketClassification {
  outcome: CoryBrainTicketResolutionOutcome;
  shouldClose: boolean;
  targetStatus: 'done' | 'cancelled' | null;
  evidenceNote: string;
}

const ACTIVE_INITIATIVE_STATUSES: ReadonlySet<CoryBrainInitiativeStatus> = new Set(['proposed', 'approved', 'in_progress']);

/**
 * Classifies one CoryBrain ticket given the live-resolved initiative link the caller
 * already fetched (a fresh `strategic_initiatives` read, not a cached/stale value).
 * Pure, total, never throws.
 */
export function classifyCoryBrainInitiativeTicket(
  input: CoryBrainTicketClassificationInput,
): CoryBrainTicketClassification {
  const role = input.isSubtask ? 'a subtask of' : 'the parent ticket for';

  if (input.linkedInitiativeId === null || input.linkedInitiativeStatus === null) {
    return {
      outcome: 'initiative_not_found',
      shouldClose: false,
      targetStatus: null,
      evidenceNote:
        'No matching strategic_initiatives row was found for this ticket — left untouched, unclassifiable. ' +
        'This is not force-closed under any heuristic; a reliable re-check requires a real linked initiative row.',
    };
  }

  const title = input.linkedInitiativeTitle ? `"${input.linkedInitiativeTitle}"` : '(title unavailable)';

  if (input.linkedInitiativeStatus === 'cancelled') {
    return {
      outcome: 'initiative_cancelled',
      shouldClose: true,
      targetStatus: 'cancelled',
      evidenceNote:
        `This ticket is ${role} strategic initiative ${title} (${input.linkedInitiativeId}), ` +
        `whose CURRENT live status is 'cancelled'. Closing this ticket to match reflects an ` +
        `already-established fact from the initiative's own resolution mechanism (human ` +
        `approval-email reply, or the historical dedup/stale-initiative cleanup) — this sync ` +
        `does not itself decide whether the initiative should be cancelled.`,
    };
  }

  if (input.linkedInitiativeStatus === 'completed') {
    return {
      outcome: 'initiative_completed',
      shouldClose: true,
      targetStatus: 'done',
      evidenceNote:
        `This ticket is ${role} strategic initiative ${title} (${input.linkedInitiativeId}), ` +
        `whose CURRENT live status is 'completed'. Closing this ticket to match reflects an ` +
        `already-established fact from the initiative's own resolution mechanism — this sync ` +
        `does not itself decide whether the initiative should be completed.`,
    };
  }

  if (ACTIVE_INITIATIVE_STATUSES.has(input.linkedInitiativeStatus)) {
    return {
      outcome: 'initiative_still_active',
      shouldClose: false,
      targetStatus: null,
      evidenceNote:
        `This ticket is ${role} strategic initiative ${title} (${input.linkedInitiativeId}), ` +
        `whose CURRENT live status is '${input.linkedInitiativeStatus}' — still active. Left open; ` +
        `this reflects real, legitimately unstarted or in-progress work, not a defect.`,
    };
  }

  // Total function safety net: an initiative status outside the known enum (should be
  // unreachable given the model's real values, but never throw on unexpected data).
  return {
    outcome: 'initiative_not_found',
    shouldClose: false,
    targetStatus: null,
    evidenceNote: `Linked initiative ${input.linkedInitiativeId} has an unrecognized status '${input.linkedInitiativeStatus}' — left untouched.`,
  };
}
