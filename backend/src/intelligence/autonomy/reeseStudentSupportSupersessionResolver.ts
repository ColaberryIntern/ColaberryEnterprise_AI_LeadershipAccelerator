/**
 * Reese student_support Ticket Supersession — I/O recheck + resolve service
 *
 * See `reeseStudentSupportSupersessionRules.ts` for the full design rationale. This
 * file is the I/O orchestration layer only: fetch every non-terminal `student_support`
 * ticket Reese has created, group by room (`entity_id`), classify via the pure rules
 * module, and write.
 *
 * Scope: `created_by_id` = Reese's real AdminUser id (via `getReeseAdminUserId()`,
 * never re-derived or hardcoded) AND `type = 'student_support'`. Reese's OTHER ticket
 * type (`reese_autonomous_outreach`) already has a complete, correctly-wired closure
 * mechanism (`reeseOutreachFollowUpService.ts` + the `ReeseOutreachFollowUps` cron —
 * see this run's execution-contract.md) and is never touched by this module.
 *
 * Closes to `status: 'done'` via `company/ticketOrchestrator.ts`'s non-state-machine
 * `updateTicketStatus()` — same choice `coryEngineTicketAutoResolver.ts` /
 * `corybrainInitiativeTicketAutoResolver.ts` / `inboxCaseSourceCompletionResolver.ts`
 * made today for the identical structural reason: `ticketService.ts`'s
 * `VALID_TRANSITIONS.backlog` only allows `['todo','cancelled']`, so `backlog -> done`
 * (needed here, since every `student_support` ticket sits in `backlog`) would throw
 * under the FSM-gated version. `actorId` is null-guarded exactly the way every other
 * real caller of `getReeseAdminUserId()` in this codebase already guards it
 * (`reeseOutreachFollowUpService.ts`: `actorId = reeseAdminUserId || 'Reese'`) — never
 * a possibly-null value passed into a non-nullable parameter.
 *
 * Idempotent by construction: the initial query's own `status NOT IN ('done',
 * 'cancelled')` filter means an already-closed ticket never reappears as a candidate,
 * so re-running produces zero additional writes. Per-ticket try/catch so one bad row
 * never aborts the batch (Failure-First Design: logged with context, not silently
 * swallowed).
 */
import { Op } from 'sequelize';
import {
  classifyStudentSupportSupersession,
  type StudentSupportSupersessionOutcome,
  type SiblingStudentSupportTicket,
} from './reeseStudentSupportSupersessionRules';

/** Safety ceiling only, not a business rule — real backlog today is 15 open tickets
 * across 14 distinct rooms. If ever hit, the remainder is picked up automatically on
 * the next scheduled pass. */
export const MAX_TICKETS_PER_RUN = 2000;

const STUDENT_SUPPORT_TYPE = 'student_support';

export interface StudentSupportSupersessionCandidate {
  ticket_id: string;
  entity_id: string | null;
  outcome: StudentSupportSupersessionOutcome;
  should_close: boolean;
  superseded_by_ticket_id: string | null;
  evidence_note: string;
  write_error?: string;
}

export interface StudentSupportSupersessionReport {
  checked: number;
  closed: number;
  breakdown: Record<StudentSupportSupersessionOutcome, { checked: number; closed: number }>;
  results: StudentSupportSupersessionCandidate[];
  duration_ms: number;
}

function emptyBreakdown(): Record<StudentSupportSupersessionOutcome, { checked: number; closed: number }> {
  return {
    superseded: { checked: 0, closed: 0 },
    current: { checked: 0, closed: 0 },
    sole_ticket: { checked: 0, closed: 0 },
    already_terminal: { checked: 0, closed: 0 },
  };
}

/**
 * Read-only. Fetches every live non-terminal `student_support` ticket Reese has
 * created, groups by room (`entity_id`), and classifies every ticket via
 * `classifyStudentSupportSupersession()`. Zero writes. A ticket with a null/missing
 * `entity_id` (should not occur — `ensureAgentTicketForRoom()` always sets it — but
 * defended against rather than assumed) is treated as its own sole room: it can never
 * be superseded and is never grouped with any other ticket.
 */
export async function fetchLiveResolvableStudentSupportTickets(): Promise<StudentSupportSupersessionCandidate[]> {
  const { Ticket } = await import('../../models');
  const { getReeseAdminUserId } = await import('../../services/reese/reeseIdentitySeed');

  const reeseAdminUserId = await getReeseAdminUserId();
  if (!reeseAdminUserId) {
    // Reese's identity isn't seeded yet — nothing to scope the query to. Real,
    // legitimate empty result (matches sendNewOutreach()'s identical guard), not an
    // error.
    return [];
  }

  const openTickets = await (Ticket as any).findAll({
    where: {
      created_by_id: reeseAdminUserId,
      type: STUDENT_SUPPORT_TYPE,
      status: { [Op.notIn]: ['done', 'cancelled'] },
    },
    limit: MAX_TICKETS_PER_RUN,
  });

  if (openTickets.length === MAX_TICKETS_PER_RUN) {
    console.warn(
      `[Reese StudentSupportSupersession] Hit the ${MAX_TICKETS_PER_RUN}-ticket safety ceiling; remainder will be picked up on the next scheduled pass.`,
    );
  }

  // Group by room. A ticket missing entity_id is its own singleton group (never
  // superseded, never supersedes anything) — real defense-in-depth, not expected
  // against production data.
  const byRoom = new Map<string, any[]>();
  for (const ticket of openTickets) {
    const key: string = ticket.entity_id ?? `__no-room__:${ticket.id}`;
    if (!byRoom.has(key)) byRoom.set(key, []);
    byRoom.get(key)!.push(ticket);
  }

  const results: StudentSupportSupersessionCandidate[] = [];
  for (const roomTickets of byRoom.values()) {
    for (const ticket of roomTickets) {
      const siblings: SiblingStudentSupportTicket[] = roomTickets
        .filter((t: any) => t.id !== ticket.id)
        .map((t: any) => ({ id: t.id, createdAt: t.created_at }));

      const classification = classifyStudentSupportSupersession({
        ticketId: ticket.id,
        ticketStatus: ticket.status,
        createdAt: ticket.created_at,
        siblings,
      });

      results.push({
        ticket_id: ticket.id,
        entity_id: ticket.entity_id ?? null,
        outcome: classification.outcome,
        should_close: classification.shouldClose,
        superseded_by_ticket_id: classification.supersededByTicketId,
        evidence_note: classification.reason,
      });
    }
  }

  return results;
}

/**
 * Re-checks every open `student_support` ticket for a real, structural supersession
 * signal and closes the ones that have one (to `done`, with a real evidence comment
 * naming the superseding ticket). Idempotent: an already-done/cancelled ticket never
 * appears in the query (safe no-op on re-run); a sole/current ticket produces zero
 * writes; one bad ticket never aborts the batch.
 */
export async function resolveReeseStudentSupportSupersession(): Promise<StudentSupportSupersessionReport> {
  const start = Date.now();
  const { updateTicketStatus } = await import('../../services/company/ticketOrchestrator');
  const { getReeseAdminUserId } = await import('../../services/reese/reeseIdentitySeed');

  const reeseAdminUserId = await getReeseAdminUserId();
  const actorId = reeseAdminUserId || 'Reese';

  const candidates = await fetchLiveResolvableStudentSupportTickets();
  const breakdown = emptyBreakdown();
  let closed = 0;

  for (const candidate of candidates) {
    breakdown[candidate.outcome].checked++;

    if (!candidate.should_close) continue;

    try {
      await updateTicketStatus(candidate.ticket_id, 'done', 'ai_staff', actorId, candidate.evidence_note);
      closed++;
      breakdown[candidate.outcome].closed++;
    } catch (err: any) {
      // One bad ticket must never abort the batch (Failure-First Design: no silent
      // swallow — logged with context, batch continues).
      console.error(
        `[Reese StudentSupportSupersession] Failed to close ticket ${candidate.ticket_id} (${candidate.outcome}): ${err?.message || err}`,
      );
      candidate.write_error = err?.message || String(err);
    }
  }

  return { checked: candidates.length, closed, breakdown, results: candidates, duration_ms: Date.now() - start };
}
