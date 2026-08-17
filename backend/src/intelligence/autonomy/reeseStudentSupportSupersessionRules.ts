/**
 * Reese student_support Ticket Supersession — pure classification rules
 *
 * `reeseTicketLinkService.ts`'s `ensureReeseTicketForRoom()` (delegating to the
 * generic `agentBlueprint/agentTicketLinkService.ts`) creates ONE `student_support`
 * ticket per Reese DM room, called on every inbound student message via
 * `reeseReplyService.ts`'s `maybeTriggerReeseReply()`. `ticketStudentSupportReuse.ts`'s
 * `tryReuseStudentSupportTicket()` implements "one ticket per person per hour" (Ali's
 * own prior live feedback): the SAME ticket is reused only if the room's most-recent
 * `student_support` ticket was touched within the last hour. Once more than an hour
 * passes, the next student message creates a BRAND-NEW ticket for the same room —
 * regardless of whether the old ticket is still open. The old ticket is then silently
 * abandoned: nothing in `reeseReplyService.ts`/`reeseTicketLinkService.ts` ever calls
 * `updateTicketStatus` on it (only `addTicketComment` and a ledger event), and it was
 * created at `status:'backlog'` with no goal/signal-type field to re-check later.
 *
 * Confirmed live in production (2026-08-16, see this run's execution-contract.md for
 * the full DISCOVER trail): 15 of Reese's 16 `student_support` tickets sit in
 * `backlog` forever; 2 of those 15 already have a strictly-newer sibling ticket open
 * for the exact same room right now (Marcus Zeno, Ali Muwwakkil), each the OLDER
 * ticket having been silently abandoned when the newer one was created. This is a
 * live, ONGOING defect (not just historical debt) — it recurs every time ANY student
 * returns to DM Reese more than an hour after their last exchange.
 *
 * A real signal search (per this run's explicit "no invented heuristic" instruction)
 * found exactly ONE structural, non-time-elapsed fact available: whether a STRICTLY
 * NEWER `student_support` ticket exists for the same room. This is existence/ordering
 * based — it compares two persisted `created_at` values to establish which ticket is
 * CURRENT for a room (the platform's own dedup/reuse design already treats "a newer
 * ticket for this room exists" as proof the old one's tracked session ended) — it is
 * NOT a "close after N hours/days with no reply" fallback: a room with only one
 * ticket, however old, is never touched by this rule, and a ticket is never closed
 * because time passed, only because a real, newer, concrete sibling ticket exists.
 * `CommunityRoom.status` (`'active'|'archived'|'locked'|'removed'`) was also checked
 * as a candidate real signal — all 16 rooms behind these tickets are `'active'` in
 * production, so it adds nothing today, and is not used here.
 *
 * This module is the pure decision logic (no I/O, no DB) for that one classification:
 * given a ticket and the full list of its room's OTHER `student_support` tickets
 * (id + created_at only — the caller already scoped/fetched them), decide whether
 * this ticket has been superseded. It does not decide anything about the superseding
 * ticket itself, and it never touches the 13 open tickets (and any future
 * non-superseded stale ticket) that have no newer sibling — those are genuinely
 * left open, with the gap disclosed in execution-contract.md, not force-resolved.
 *
 * No time-based fallback of any kind lives in this file: no wall-clock-vs-stored-
 * timestamp delta, no ticket-age comparison, no "close after N hours/days untouched"
 * heuristic anywhere. Comparing two siblings' `created_at` values to each other to
 * determine ORDER is allowed and used (a structural fact about which ticket is
 * current); comparing either to `Date.now()`/the current wall clock to decide
 * closure is exactly the forbidden pattern and does not appear anywhere below. A
 * dedicated test in this file's `__tests__` greps this file's own source for the
 * tokens such a gate would require and asserts zero matches, mirroring this
 * session's earlier `cory-engine`/`CoryBrain`/`InboxCaseEngine` fixes.
 */

export type StudentSupportSupersessionOutcome = 'superseded' | 'current' | 'sole_ticket' | 'already_terminal';

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['done', 'cancelled']);

export interface SiblingStudentSupportTicket {
  id: string;
  createdAt: Date;
}

export interface StudentSupportSupersessionInput {
  ticketId: string;
  /** The ticket's real current status. Defense in depth: the resolver is expected to
   * pre-filter to non-terminal tickets before calling this, but the classifier must
   * behave safely (never close, never throw) if handed a terminal one directly. */
  ticketStatus: string;
  createdAt: Date;
  /** Every OTHER `student_support` ticket for the SAME room (`entity_id`) — never
   * includes the ticket being classified itself. */
  siblings: SiblingStudentSupportTicket[];
}

export interface StudentSupportSupersessionClassification {
  outcome: StudentSupportSupersessionOutcome;
  shouldClose: boolean;
  /** The id of the CURRENT (newest) ticket for this room when `shouldClose` is true;
   * null otherwise. */
  supersededByTicketId: string | null;
  reason: string;
}

/**
 * Deterministic "is `a` newer than `b`" ordering: real `created_at` values carry
 * Postgres microsecond precision, so an exact tie is not expected against production
 * data, but this function must still be total. Ties break on `id` string comparison
 * (arbitrary but stable — the same two ids always resolve the same way, so repeated
 * calls with the same input never flap between answers).
 */
function isNewer(a: SiblingStudentSupportTicket, b: SiblingStudentSupportTicket): boolean {
  const aTime = a.createdAt.getTime();
  const bTime = b.createdAt.getTime();
  if (aTime !== bTime) return aTime > bTime;
  return a.id > b.id;
}

function pickNewest(tickets: SiblingStudentSupportTicket[]): SiblingStudentSupportTicket {
  let newest = tickets[0];
  for (const t of tickets.slice(1)) {
    if (isNewer(t, newest)) newest = t;
  }
  return newest;
}

/**
 * Classifies one `student_support` ticket given its room's other sibling tickets
 * (the caller already scoped the query to the same `entity_id`). Pure, total, never
 * throws.
 */
export function classifyStudentSupportSupersession(
  input: StudentSupportSupersessionInput,
): StudentSupportSupersessionClassification {
  if (TERMINAL_STATUSES.has(input.ticketStatus)) {
    return {
      outcome: 'already_terminal',
      shouldClose: false,
      supersededByTicketId: null,
      reason: `Ticket is already '${input.ticketStatus}' — nothing to do. The resolver is expected to have ` +
        'already filtered this out; this is a defense-in-depth safety net, not the normal path.',
    };
  }

  if (input.siblings.length === 0) {
    return {
      outcome: 'sole_ticket',
      shouldClose: false,
      supersededByTicketId: null,
      reason: 'No other student_support ticket exists for this room. This is the only tracking object for the ' +
        'conversation — left open; there is no real signal today for whether the underlying issue was resolved.',
    };
  }

  const self: SiblingStudentSupportTicket = { id: input.ticketId, createdAt: input.createdAt };
  const newerSiblings = input.siblings.filter((s) => isNewer(s, self));

  if (newerSiblings.length === 0) {
    return {
      outcome: 'current',
      shouldClose: false,
      supersededByTicketId: null,
      reason: 'This is the newest student_support ticket for this room — it is the CURRENT tracking object for ' +
        'the conversation, not a stale duplicate. Left open.',
    };
  }

  const current = pickNewest(newerSiblings);
  return {
    outcome: 'superseded',
    shouldClose: true,
    supersededByTicketId: current.id,
    reason: `A strictly newer student_support ticket (${current.id}) now exists for this same room, created ` +
      `after this one (${input.ticketId}). ticketStudentSupportReuse.ts's own 1-hour reuse-window design means ` +
      'the newer ticket is the CURRENT tracking object for this conversation — this ticket has been superseded, ' +
      'not resolved, and closes to reflect that structural fact, never because time has elapsed.',
  };
}
