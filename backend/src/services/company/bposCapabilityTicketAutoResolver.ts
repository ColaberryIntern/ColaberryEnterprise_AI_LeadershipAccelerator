/**
 * bpos_orchestrator Capability Ticket Auto-Resolver — I/O recheck + resolve service
 *
 * See `bposCapabilityTicketResolutionRules.ts` for the full design rationale. This
 * file is the I/O orchestration layer only: fetch every non-terminal `bpos_execution`
 * ticket `bpos_orchestrator` has created, batch-load each referenced capability, and
 * classify + (optionally) write via the pure rules module.
 *
 * Scope: `created_by_id = 'bpos_orchestrator'` AND `type = 'bpos_execution'` AND
 * `entity_type = 'capability'` (matches every real row confirmed live — see this run's
 * execution-contract.md). `bpos_orchestrator`'s OTHER role (the `ticket_creator_identity`
 * row in `agentRegistrySeed.ts` used to resolve a display name) is never touched here.
 *
 * Closes via `company/ticketOrchestrator.ts`'s non-state-machine `updateTicketStatus()`
 * with `actorType:'cory', actorId:'bpos_orchestrator'` — the EXACT actor identity this
 * ticket type's own existing code already uses everywhere (`createBPOSTicket()`,
 * `projectRoutes.ts`'s three `execution-ticket` branches), not a different sibling
 * agent's convention. `in_progress -> done` and `in_progress -> cancelled` are both
 * valid transitions under `ticketService.ts`'s real state machine too (this bypass
 * isn't fighting the FSM here, just matching every other resolver's established
 * choice).
 *
 * Idempotent by construction: the fetch query's own `status NOT IN ('done',
 * 'cancelled')` filter means an already-closed ticket never reappears as a candidate,
 * so re-running produces zero additional writes. Per-ticket try/catch so one bad row
 * never aborts the batch (Failure-First Design: logged with context, not silently
 * swallowed).
 */
import { Op } from 'sequelize';
import {
  classifyBposCapabilityTicket,
  type BposCapabilityTicketOutcome,
} from './bposCapabilityTicketResolutionRules';

/** Safety ceiling only, not a business rule — real backlog today is 11 tickets across
 * 8 distinct capabilities, and no new bpos_execution ticket can be created anymore
 * (the sole frontend caller was deleted 2026-07-18). If ever hit, the remainder is
 * picked up automatically on the next scheduled pass. */
export const MAX_TICKETS_PER_RUN = 2000;

const BPOS_ACTOR_ID = 'bpos_orchestrator';
const BPOS_TICKET_TYPE = 'bpos_execution';

export interface BposCapabilityTicketCandidate {
  ticket_id: string;
  entity_id: string | null;
  capability_name: string | null;
  outcome: BposCapabilityTicketOutcome;
  should_close: boolean;
  close_to_status: 'done' | 'cancelled' | null;
  evidence_note: string;
  write_error?: string;
}

export interface BposCapabilityTicketReport {
  checked: number;
  closed: number;
  breakdown: Record<BposCapabilityTicketOutcome, { checked: number; closed: number }>;
  results: BposCapabilityTicketCandidate[];
  duration_ms: number;
}

function emptyBreakdown(): Record<BposCapabilityTicketOutcome, { checked: number; closed: number }> {
  return {
    capability_verified: { checked: 0, closed: 0 },
    capability_deleted: { checked: 0, closed: 0 },
    no_signal: { checked: 0, closed: 0 },
    already_terminal: { checked: 0, closed: 0 },
  };
}

/**
 * Enriches T001's pure `classification.reason` with the real, live fields the
 * classifier itself never sees (it only receives `userStatus`, not the full
 * `Capability` row) — mirrors `workforceTicketAutoResolver.ts`'s `buildEvidenceComment()`
 * pattern in this same folder: the I/O layer, not the pure classifier, is responsible
 * for citing concrete evidence (capability name, and for `capability_verified`
 * specifically, WHO verified it and WHEN — `user_status_set_by`/`user_status_set_at`,
 * the real human-asserted fields this run's whole justification rests on). Falls back
 * to the classifier's own reason text if `capRow` is unavailable (e.g.
 * `capability_deleted`, where there is no row to cite fields from).
 */
function buildEnrichedEvidenceNote(
  outcome: BposCapabilityTicketOutcome,
  baseReason: string,
  capRow: any | undefined,
): string {
  if (outcome === 'capability_verified' && capRow) {
    const name = capRow.name || '(unnamed capability)';
    const setBy = capRow.user_status_set_by || 'an unknown user';
    const setAtRaw = capRow.user_status_set_at;
    const setAt = setAtRaw ? new Date(setAtRaw).toISOString() : 'an unknown time';
    return (
      `Capability "${name}" (id ${capRow.id}) has user_status:'verified' — set by AdminUser ${setBy} at ${setAt}. ` +
      'This is the real, human-asserted, authoritative signal ("user clicked Mark Verified after Claude Code ' +
      'reported Status: COMPLETE and tests passed", per Capability.ts\'s own documented contract). The build ' +
      'this ticket was tracking a stage of is confirmed complete; only the (now-dead) frontend call that would ' +
      "have told THIS ticket never fired. Closed to 'done' to reflect that already-established fact, never " +
      'because time has elapsed.'
    );
  }
  if (outcome === 'capability_deleted' && capRow === undefined) {
    return baseReason; // no row exists at all — nothing further to cite.
  }
  if (capRow?.name) {
    // no_signal / already_terminal with a known capability name — cite it for context,
    // but keep the classifier's own real reason text (which already states the live
    // user_status value).
    return `Capability "${capRow.name}" (id ${capRow.id}) — ${baseReason}`;
  }
  return baseReason;
}

/**
 * Read-only. Fetches every live non-terminal `bpos_execution` ticket
 * `bpos_orchestrator` has created, batch-loads every distinct referenced capability in
 * ONE query, and classifies every ticket via `classifyBposCapabilityTicket()`. Zero
 * writes.
 */
export async function fetchLiveResolvableBposCapabilityTickets(): Promise<BposCapabilityTicketCandidate[]> {
  const { Ticket, Capability } = await import('../../models');

  const openTickets = await (Ticket as any).findAll({
    where: {
      created_by_id: BPOS_ACTOR_ID,
      type: BPOS_TICKET_TYPE,
      entity_type: 'capability',
      status: { [Op.notIn]: ['done', 'cancelled'] },
    },
    limit: MAX_TICKETS_PER_RUN,
  });

  if (openTickets.length === MAX_TICKETS_PER_RUN) {
    console.warn(
      `[BposCapabilityTicketAutoResolver] Hit the ${MAX_TICKETS_PER_RUN}-ticket safety ceiling; remainder will be picked up on the next scheduled pass.`,
    );
  }

  const entityIds = Array.from(
    new Set(openTickets.map((t: any) => t.entity_id).filter((id: any): id is string => !!id)),
  );

  const capRows = entityIds.length
    ? await (Capability as any).findAll({ where: { id: { [Op.in]: entityIds } } })
    : [];
  const capById = new Map<string, any>(capRows.map((c: any) => [c.id, c]));

  const results: BposCapabilityTicketCandidate[] = [];
  for (const ticket of openTickets) {
    const entityId: string | null = ticket.entity_id ?? null;
    const capRow = entityId ? capById.get(entityId) : undefined;
    // capRow === undefined means: entityId was set, but no capabilities row matched —
    // a real, confirmed deletion. capRow present means the row exists; its
    // user_status is the live signal.
    const capabilityInfo = entityId ? (capRow ? { userStatus: capRow.user_status ?? null } : null) : null;

    const classification = classifyBposCapabilityTicket({
      ticketId: ticket.id,
      ticketStatus: ticket.status,
      entityId,
      capability: capabilityInfo,
    });

    results.push({
      ticket_id: ticket.id,
      entity_id: entityId,
      capability_name: capRow?.name ?? null,
      outcome: classification.outcome,
      should_close: classification.shouldClose,
      close_to_status: classification.closeToStatus,
      evidence_note: buildEnrichedEvidenceNote(classification.outcome, classification.reason, capRow),
    });
  }

  return results;
}

/**
 * Re-checks every open `bpos_execution` ticket for a real, structural completion
 * signal (capability verified, or capability deleted) and closes the ones that have
 * one — with a real evidence comment. Idempotent: an already-done/cancelled ticket
 * never appears in the query (safe no-op on re-run); a still-in_progress capability
 * produces zero writes; one bad ticket never aborts the batch.
 */
export async function resolveBposCapabilityTickets(): Promise<BposCapabilityTicketReport> {
  const start = Date.now();
  const { updateTicketStatus } = await import('./ticketOrchestrator');

  const candidates = await fetchLiveResolvableBposCapabilityTickets();
  const breakdown = emptyBreakdown();
  let closed = 0;

  for (const candidate of candidates) {
    breakdown[candidate.outcome].checked++;

    if (!candidate.should_close || !candidate.close_to_status) continue;

    try {
      await updateTicketStatus(candidate.ticket_id, candidate.close_to_status, 'cory', BPOS_ACTOR_ID, candidate.evidence_note);
      closed++;
      breakdown[candidate.outcome].closed++;
    } catch (err: any) {
      // One bad ticket must never abort the batch (Failure-First Design: no silent
      // swallow — logged with context, batch continues).
      console.error(
        `[BposCapabilityTicketAutoResolver] Failed to close ticket ${candidate.ticket_id} (${candidate.outcome}): ${err?.message || err}`,
      );
      candidate.write_error = err?.message || String(err);
    }
  }

  return { checked: candidates.length, closed, breakdown, results: candidates, duration_ms: Date.now() - start };
}
