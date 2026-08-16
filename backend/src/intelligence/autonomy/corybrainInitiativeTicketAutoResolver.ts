/**
 * CoryBrain Initiative-Ticket Reconciliation — I/O recheck + resolve service
 *
 * See `corybrainInitiativeTicketResolutionRules.ts` for the full design rationale.
 * This file is the I/O orchestration layer only: fetch every open CoryBrain ticket,
 * resolve each one to the `strategic_initiatives` row it belongs to (a parent ticket
 * resolves via the initiative's own `ticket_id`; a subtask ticket resolves via
 * `metadata.initiative_id`, the field `coryInitiatives.ts`'s `createStrategicInitiative
 * ()` already stamps on every subtask it creates), classify via the pure rules module,
 * and write.
 *
 * This is a reconciliation/SYNC fix, not a new decision-making engine: it never
 * decides whether an initiative itself should be approved, rejected, or completed —
 * that authority stays entirely with `coryInitiatives.ts`/`ticketReplyService.ts`'s
 * already-fixed, already-deployed mechanism (PRs #1491/#1495/#1499/#1502/#1513), which
 * this file never imports or modifies. It only reads the CURRENT, live
 * `strategic_initiatives.status` for a ticket's linked row and writes the DEPENDENT
 * `tickets.status` to match, closing the gap that neither `completeInitiative()`/
 * `rejectInitiative()`/`syncInitiative()` (which only ever touch the ONE ticket named
 * by `initiative.ticket_id`, never that initiative's subtasks) nor the historical
 * `consolidateDuplicateStrategicInitiatives.ts`/`resolveStaleStrategicInitiatives.ts`
 * scripts (which flip `strategic_initiatives.status` directly and — in the former
 * case — never touch any ticket at all) ever close.
 *
 * Scope is `created_by_id: 'CoryBrain'` only, with NO `type`/`source` narrowing —
 * confirmed exhaustive against production (see this run's execution-contract.md): every
 * open CoryBrain ticket today is either the parent of a strategic-initiative finding or
 * one of its subtasks, but this resolver deliberately stays open to picking up any
 * FUTURE CoryBrain ticket type that links to an initiative the same way, rather than
 * hard-coding today's 3 observed `type` values.
 *
 * Mirrors `coryEngineTicketAutoResolver.ts` (PR #1531)'s proven shape for this same
 * class of problem: deterministic (no LLM), no human-approval step (propagating an
 * already-established fact is a mechanical sync, not a judgment call), a
 * `MAX_TICKETS_PER_RUN` safety ceiling, per-ticket try/catch so one bad row never
 * aborts the batch, and idempotent by construction (the query's own
 * `status NOT IN (done, cancelled)` filter means an already-closed ticket never
 * reappears as a candidate).
 *
 * Uses `services/company/ticketOrchestrator.ts`'s non-state-machine `updateTicketStatus
 * ()` rather than `ticketService.ts`'s FSM-gated one — same choice
 * `coryEngineTicketAutoResolver.ts` made and for the identical reason:
 * `ticketService.ts`'s `VALID_TRANSITIONS.backlog` only allows `['todo','cancelled']`,
 * so `backlog -> done` (needed for the 174 initiative-completed tickets) would throw.
 */
import { Op } from 'sequelize';
import {
  classifyCoryBrainInitiativeTicket,
  type CoryBrainInitiativeStatus,
  type CoryBrainTicketResolutionOutcome,
} from './corybrainInitiativeTicketResolutionRules';

/** Safety ceiling only, not a business rule — real backlog today is 1,348. If ever hit,
 * the remainder is picked up automatically on the next scheduled pass (every 6h). */
export const MAX_TICKETS_PER_RUN = 2000;

/** The real, confirmed-exhaustive production scope for this resolver (see file header
 * for why no type/source narrowing is added). */
const CORY_BRAIN_TICKET_SCOPE = {
  created_by_id: 'CoryBrain',
} as const;

export interface CoryBrainInitiativeTicketRecheckResult {
  ticket_id: string;
  ticket_number: number | null;
  is_subtask: boolean;
  linked_initiative_id: string | null;
  linked_initiative_status: CoryBrainInitiativeStatus | null;
  outcome: CoryBrainTicketResolutionOutcome;
  should_close: boolean;
  target_status: 'done' | 'cancelled' | null;
  evidence_note: string;
  write_error?: string;
}

export interface CoryBrainInitiativeAutoResolveReport {
  checked: number;
  closed: number;
  /** Per-outcome counts, for the dry-run report and production observability. */
  breakdown: Record<CoryBrainTicketResolutionOutcome, { checked: number; closed: number }>;
  results: CoryBrainInitiativeTicketRecheckResult[];
  duration_ms: number;
}

function emptyBreakdown(): Record<CoryBrainTicketResolutionOutcome, { checked: number; closed: number }> {
  return {
    initiative_cancelled: { checked: 0, closed: 0 },
    initiative_completed: { checked: 0, closed: 0 },
    initiative_still_active: { checked: 0, closed: 0 },
    initiative_not_found: { checked: 0, closed: 0 },
  };
}

/**
 * Read-only. Fetches every live open CoryBrain ticket, resolves each to its linked
 * `strategic_initiatives` row (batched — one query for all parent-ticket lookups, one
 * for all subtask lookups, never one query per ticket), and classifies every ticket.
 * Zero writes.
 */
export async function fetchLiveResolvableCoryBrainInitiativeTickets(): Promise<CoryBrainInitiativeTicketRecheckResult[]> {
  const { Ticket, StrategicInitiative } = await import('../../models');

  const openTickets = await (Ticket as any).findAll({
    where: {
      ...CORY_BRAIN_TICKET_SCOPE,
      status: { [Op.notIn]: ['done', 'cancelled'] },
    },
    limit: MAX_TICKETS_PER_RUN,
  });

  if (openTickets.length === MAX_TICKETS_PER_RUN) {
    console.warn(
      `[CoryBrain InitiativeTicketSync] Hit the ${MAX_TICKETS_PER_RUN}-ticket safety ceiling; remainder will be picked up on the next scheduled pass.`,
    );
  }

  const parentTickets = openTickets.filter((t: any) => !t.parent_ticket_id);
  const subtaskTickets = openTickets.filter((t: any) => !!t.parent_ticket_id);

  // Parent tickets resolve their initiative via the REVERSE link
  // (strategic_initiatives.ticket_id = this ticket's own id) — one batch query.
  const parentTicketIds = parentTickets.map((t: any) => t.id);
  const initiativesByTicketId = new Map<string, any>();
  if (parentTicketIds.length > 0) {
    const rows = await (StrategicInitiative as any).findAll({
      where: { ticket_id: { [Op.in]: parentTicketIds } },
    });
    for (const row of rows) initiativesByTicketId.set(row.ticket_id, row);
  }

  // Subtask tickets resolve their initiative via metadata.initiative_id (stamped by
  // coryInitiatives.ts's createStrategicInitiative() on every subtask it creates) —
  // one batch query for every distinct id referenced across all subtasks.
  const subtaskInitiativeIds = Array.from(
    new Set(
      subtaskTickets
        .map((t: any) => t.metadata?.initiative_id)
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0),
    ),
  );
  const initiativesById = new Map<string, any>();
  if (subtaskInitiativeIds.length > 0) {
    const rows = await (StrategicInitiative as any).findAll({
      where: { id: { [Op.in]: subtaskInitiativeIds } },
    });
    for (const row of rows) initiativesById.set(row.id, row);
  }

  const results: CoryBrainInitiativeTicketRecheckResult[] = [];

  for (const ticket of parentTickets) {
    const initiative = initiativesByTicketId.get(ticket.id) || null;
    results.push(classifyTicket(ticket, false, initiative));
  }
  for (const ticket of subtaskTickets) {
    const initiativeId = ticket.metadata?.initiative_id;
    const initiative = typeof initiativeId === 'string' ? initiativesById.get(initiativeId) || null : null;
    results.push(classifyTicket(ticket, true, initiative));
  }

  return results;
}

function classifyTicket(ticket: any, isSubtask: boolean, initiative: any | null): CoryBrainInitiativeTicketRecheckResult {
  const classification = classifyCoryBrainInitiativeTicket({
    ticketId: ticket.id,
    isSubtask,
    linkedInitiativeId: initiative?.id ?? null,
    linkedInitiativeStatus: initiative?.status ?? null,
    linkedInitiativeTitle: initiative?.title ?? null,
  });

  return {
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number ?? null,
    is_subtask: isSubtask,
    linked_initiative_id: initiative?.id ?? null,
    linked_initiative_status: initiative?.status ?? null,
    outcome: classification.outcome,
    should_close: classification.shouldClose,
    target_status: classification.targetStatus,
    evidence_note: classification.evidenceNote,
  };
}

/**
 * Re-checks every open CoryBrain ticket's linked initiative status and closes the
 * ticket (to 'done' or 'cancelled', matching the initiative) with a real evidence
 * comment when that initiative has genuinely reached a terminal state. Idempotent: an
 * already-done/cancelled ticket never appears in the query (safe no-op); a still-active
 * or unmatched linkage produces zero writes (safe to run any number of times); one bad
 * ticket never aborts the batch.
 */
export async function reCheckAndAutoResolveCoryBrainInitiativeTickets(): Promise<CoryBrainInitiativeAutoResolveReport> {
  const start = Date.now();
  const { updateTicketStatus } = await import('../../services/company/ticketOrchestrator');

  const candidates = await fetchLiveResolvableCoryBrainInitiativeTickets();
  const breakdown = emptyBreakdown();
  let closed = 0;

  for (const candidate of candidates) {
    breakdown[candidate.outcome].checked++;

    if (!candidate.should_close || !candidate.target_status) continue;

    try {
      await updateTicketStatus(candidate.ticket_id, candidate.target_status, 'agent', 'CoryBrain', candidate.evidence_note);
      closed++;
      breakdown[candidate.outcome].closed++;
    } catch (err: any) {
      // One bad ticket must never abort the batch (Failure-First Design: no silent
      // swallow — logged with context, batch continues).
      console.error(
        `[CoryBrain InitiativeTicketSync] Failed to close ticket ${candidate.ticket_id} (${candidate.outcome}): ${err?.message || err}`,
      );
      candidate.write_error = err?.message || String(err);
    }
  }

  return { checked: candidates.length, closed, breakdown, results: candidates, duration_ms: Date.now() - start };
}
