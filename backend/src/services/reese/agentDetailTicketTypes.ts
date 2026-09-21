import type { TicketStatusBucket } from './ticketStatusBucket';

// Extracted from agentDetailEmployeeFacts.ts (Dashboard redesign, Slice 2a,
// 2026-09-19) — that file hit this repo's 500-line hard ceiling; this is a
// pure type split, zero behaviour change. Kept here rather than inlined so
// agentDetailService.ts and any future consumer can reference the same
// shape without re-deriving it.

export interface AgentDetailTicket {
  id: string;
  ticket_number: number | null;
  title: string;
  /** Task visibility (2026-08-26) — Ali, live, looking at Reese's real page:
   * "what triggers them, what they are looking for, why they triggered."
   * The real narrative already exists at ticket-creation time (e.g. "Signal:
   * inactivity. Goal: confirm the student is unblocked...") but was never
   * returned by this endpoint. Never fabricated — whatever the creating code
   * actually wrote, verbatim. */
  description: string | null;
  status: string;
  priority: string;
  type: string;
  created_at: Date | null;
  updated_at: Date | null;
  /** Dashboard redesign, Slice 2a (2026-09-19) — real column, previously
   * fetched but never surfaced in this response (see models/Ticket.ts). */
  due_date: Date | null;
  /** Dashboard redesign, Slice 2a — the Work tab's honest status filter,
   * derived from real fields (status/due_date/latest-activity-actor), no
   * schema change. `null` for a terminal ticket (done/cancelled) — none of
   * the 4 real buckets honestly fits a closed ticket. See
   * ticketStatusBucket.ts for the exact derivation and precedence order. */
  status_bucket: TicketStatusBucket | null;
}

/** Task visibility (2026-08-26) — real tickets grouped by `type`, the one
 * field every ticket-creating call site already sets meaningfully (see
 * `ticketService.ts`'s real `source`/`type` conventions). Sub-grouped by
 * `metadata.signal_type` ONLY when tickets of that type actually carry it
 * (Reese's autonomous-outreach tickets do; most other types don't) — never
 * a fabricated sub-group. Answers "which task is creating the most
 * tickets" without inventing a new task_id column: grounded entirely in
 * the same unlimited, MAX_TICKETS-independent query capabilities.produced_
 * ticket_types already runs. */
export interface AgentDetailTicketBreakdown {
  type: string;
  count: number;
  by_signal: Array<{ signal_type: string; count: number }>;
}
