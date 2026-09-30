import type { TicketStatus } from '../../models/Ticket';

// Dashboard redesign, Slice 2a (2026-09-19) — the Work tab's honest status
// filter. Ali confirmed status filters must be DERIVED from existing fields,
// no new column (see execution-contract.md's "Slice 2a scope" section).
// The mockup's own 3-way "Waiting on Ali/staff/student" split has no real
// backing field anywhere in this codebase (checked: `Ticket.ts`,
// `ticketService.ts`, `TicketActivity.ts`, `ticketOrchestrator.ts` — none
// has a "waiting_on"/"blocked_on" concept) and is deliberately NOT
// reconstructed here. This is a narrower, honest alternative.
//
// Not Reese-specific despite living in `services/reese/` — this derivation
// backs `agentDetailService.ts`'s generic `getAgentDetail()`, used for every
// agent's page, not just Reese's. Kept alongside the file that calls it
// rather than moved to a new top-level folder for one function.

// The only 2 of `Ticket.ts`'s 6 real TicketStatus values with no further
// transition (`Ticket.ts:5`) — confirmed by reading the type directly, not
// assumed from a naming convention.
const TERMINAL_STATUSES = new Set<TicketStatus>(['done', 'cancelled']);

export type TicketStatusBucket = 'overdue' | 'ready_to_verify' | 'needs_reply' | 'open';

/**
 * `true` only when someone other than this agent acted last on the ticket.
 * A ticket with no activity rows yet (`latestActivityActorId === null`) is
 * honestly `false` — nothing to reply to, not a fabricated "needs reply".
 */
export function computeNeedsReply(
  latestActivityActorId: string | null,
  ownIdentityIds: string[],
): boolean {
  if (latestActivityActorId === null) return false;
  return !ownIdentityIds.includes(latestActivityActorId);
}

interface StatusBucketParams {
  status: TicketStatus;
  dueDate: Date | null;
  needsReply: boolean;
  now?: Date;
}

/**
 * One status pill per ticket, first match wins — a ticket can only ever
 * show one bucket, never double-labeled. Pure, safe to unit test without a
 * database.
 *
 * `null` for a terminal ticket (done/cancelled) — none of the 4 real
 * buckets honestly fits a closed ticket (not overdue, nothing to verify,
 * nothing to reply to, and "open" would be a lie). Callers filter these
 * out of the Work tab's action-focused view rather than mislabeling them.
 */
export function computeStatusBucket(params: StatusBucketParams): TicketStatusBucket | null {
  const { status, dueDate, needsReply, now = new Date() } = params;
  if (TERMINAL_STATUSES.has(status)) return null;

  if (dueDate !== null && dueDate.getTime() < now.getTime()) {
    return 'overdue';
  }
  if (status === 'in_review') {
    return 'ready_to_verify';
  }
  if (needsReply) {
    return 'needs_reply';
  }
  return 'open';
}
