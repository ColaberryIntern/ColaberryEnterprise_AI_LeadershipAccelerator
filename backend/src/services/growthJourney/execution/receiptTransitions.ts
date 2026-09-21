import type { GrowthJourneyExecutionMode, GrowthJourneyExecutionStatus } from '../../../models/GrowthJourneyExecution';
import { recordJourneyEvent, type JourneyLedgerResult } from '../ledger';

/**
 * The receipt's state machine (Phase 5 T508), and the one ledger row every
 * transition writes.
 *
 * A receipt is born `pending_review` (REVIEW) or `approved` (LIMITED) - the two
 * edges from nothing - and moves only along the edges below. Every writer that
 * moves a receipt (the approval branch, the adapter's claim, the reconciler,
 * the rollback) asks this table first and records the move here, so the ledger
 * can replay a receipt's life from ids and reasons alone: no address, no
 * subject line, no body ever rides on one of these rows.
 *
 *   (none)          -> pending_review | approved
 *   pending_review  -> approved | rejected | expired | cancelled
 *   approved        -> enrolling | expired | cancelled
 *   enrolling       -> enrolled | approved (returned by the reconciler) | failed
 *   enrolled        -> in_progress | completed | blocked | failed | cancelled
 *   in_progress     -> completed | blocked | failed | cancelled
 *   completed, blocked, failed, cancelled, expired, rejected: terminal
 */

export type ReceiptFrom = GrowthJourneyExecutionStatus | null;

export const RECEIPT_TRANSITIONS: Readonly<Record<string, readonly GrowthJourneyExecutionStatus[]>> = Object.freeze({
  none: ['pending_review', 'approved'],
  pending_review: ['approved', 'rejected', 'expired', 'cancelled'],
  approved: ['enrolling', 'expired', 'cancelled'],
  enrolling: ['enrolled', 'approved', 'failed'],
  enrolled: ['in_progress', 'completed', 'blocked', 'failed', 'cancelled'],
  in_progress: ['completed', 'blocked', 'failed', 'cancelled'],
  completed: [],
  blocked: [],
  failed: [],
  cancelled: [],
  expired: [],
  rejected: [],
});

export const TERMINAL_STATUSES: readonly GrowthJourneyExecutionStatus[] = ['completed', 'blocked', 'failed', 'cancelled', 'expired', 'rejected'];

/** The status a receipt is born with, by the mode the ladder resolved. */
export const INITIAL_STATUS_BY_MODE: Readonly<Record<GrowthJourneyExecutionMode, GrowthJourneyExecutionStatus>> = Object.freeze({
  review: 'pending_review',
  limited: 'approved',
});

export function canTransition(from: ReceiptFrom, to: GrowthJourneyExecutionStatus): boolean {
  return (RECEIPT_TRANSITIONS[from ?? 'none'] ?? []).includes(to);
}

export class ReceiptTransitionError extends Error {
  constructor(readonly from: ReceiptFrom, readonly to: GrowthJourneyExecutionStatus) {
    super(`receipt cannot move ${from ?? '(none)'} -> ${to}`);
    this.name = 'ReceiptTransitionError';
  }
}

export function assertTransition(from: ReceiptFrom, to: GrowthJourneyExecutionStatus): void {
  if (!canTransition(from, to)) throw new ReceiptTransitionError(from, to);
}

export interface ReceiptEventScope {
  tenant_id: string;
  brand_id: string;
}

/**
 * One ledger row per transition: `growth_journey.execution.<to>`, on the
 * receipt, carrying ids and reasons only. `extra` is for MORE ids (a proposal,
 * a control row, a scheduled email) - never a person's data.
 */
export async function recordReceiptTransition(
  receiptId: string,
  scope: ReceiptEventScope,
  from: ReceiptFrom,
  to: GrowthJourneyExecutionStatus,
  reason: string,
  extra: Record<string, string | number | boolean | null | string[]> = {},
  actor?: string,
): Promise<JourneyLedgerResult> {
  return recordJourneyEvent(`growth_journey.execution.${to}`, 'growth_journey_execution', receiptId, scope, { from, to, reason, ...extra }, actor);
}
