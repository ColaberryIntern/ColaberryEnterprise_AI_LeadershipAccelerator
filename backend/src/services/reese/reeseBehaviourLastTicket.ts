import type { ReeseBehaviourKey } from './reeseBehaviourMetadata';

// Reese Product Phase 1, R9 — Ali, live: "I'd also like to see the last
// time the tool and scheduled work was used/run and the ticket." This is
// the "and the ticket" half: a pure derivation (no I/O of its own) over
// tickets agentDetailService.ts already fetches for capabilities/
// ticket_breakdown, so this adds zero new database queries.
//
// Grounded in the real `type` each behaviour's own service actually
// writes (verified by reading the source, not guessed):
// - reeseTicketLinkService.ts creates `student_support` tickets for
//   reactive replies.
// - reeseAutonomousOutreachService.ts creates `reese_autonomous_outreach`
//   tickets for the sweep; reeseOutreachFollowUpService.ts acts on that
//   SAME ticket's existing `ticket_id` rather than creating its own, so
//   follow-ups honestly share the sweep's last ticket rather than a
//   fabricated separate one.
// - health_assessment, welcome_dms, and presence_heartbeat never create a
//   ticket at all (TOOL_INVENTORY.md) — correctly absent from the map
//   below, never defaulted to another behaviour's ticket.

export interface LastTicketRef {
  id: string;
  ticket_number: number | null;
  title: string;
  at: Date;
}

interface TicketRowForLastTicket {
  id: string;
  ticket_number: number | null;
  title: string;
  type: string;
  status: string;
  updated_at: Date;
}

const TICKET_TYPE_BY_BEHAVIOUR: Partial<Record<ReeseBehaviourKey, string>> = {
  reactive_dm_reply: 'student_support',
  autonomous_outreach_sweep: 'reese_autonomous_outreach',
  outreach_follow_ups: 'reese_autonomous_outreach',
};

// student_support_supersession_resolver closes `student_support` tickets
// (reeseStudentSupportSupersessionResolver.ts), the SAME type
// reactive_dm_reply creates — there is no per-close-actor marker on the
// ticket row itself to distinguish "closed by the resolver" from "closed
// any other way", so this is honestly labeled "last closed" rather than
// claimed as resolver-attributed. See that file's own header comment.
const CLOSED_STATUSES = new Set(['done', 'cancelled']);

function toRef(row: TicketRowForLastTicket): LastTicketRef {
  return { id: row.id, ticket_number: row.ticket_number, title: row.title, at: row.updated_at };
}

function mostRecent(rows: TicketRowForLastTicket[]): TicketRowForLastTicket | null {
  return rows.reduce<TicketRowForLastTicket | null>((best, row) => {
    // Defensive against a row missing updated_at (never true for a real
    // Ticket row — a NOT NULL Sequelize timestamp — but real test fixtures
    // in this codebase build partial ticket objects; skipping rather than
    // throwing keeps this pure function's contract "never crash the whole
    // Agent Detail response over a display field").
    if (!row.updated_at) return best;
    if (!best || row.updated_at.getTime() > best.updated_at.getTime()) return row;
    return best;
  }, null);
}

/**
 * Derives each ticket-bearing behaviour's most recent real ticket from a
 * flat, already-fetched row set (agentDetailService.ts's own
 * `allTicketTypeRows`, extended with the extra columns this needs). Pure —
 * safe to unit test without a database.
 */
export function computeLastTicketPerBehaviour(
  rows: TicketRowForLastTicket[],
): Partial<Record<ReeseBehaviourKey, LastTicketRef>> {
  const result: Partial<Record<ReeseBehaviourKey, LastTicketRef>> = {};

  for (const [behaviour, type] of Object.entries(TICKET_TYPE_BY_BEHAVIOUR) as Array<[ReeseBehaviourKey, string]>) {
    const latest = mostRecent(rows.filter((r) => r.type === type));
    if (latest) result[behaviour] = toRef(latest);
  }

  const latestClosedSupport = mostRecent(rows.filter((r) => r.type === 'student_support' && CLOSED_STATUSES.has(r.status)));
  if (latestClosedSupport) result.student_support_supersession_resolver = toRef(latestClosedSupport);

  return result;
}
