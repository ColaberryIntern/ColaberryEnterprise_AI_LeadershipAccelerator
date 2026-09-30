/**
 * bpos_orchestrator Capability Ticket Resolution — pure classification rules
 *
 * `bpos_orchestrator` is a `ticket_creator_identity`, not a decision engine
 * (`agentRegistrySeed.ts`'s `bpos_orchestrator` row, `trigger_type:'on_demand'`).
 * Every `bpos_execution` ticket is created/transitioned by
 * `ticketOrchestrator.ts`'s `createBPOSTicket()`/`updateTicketStatus()`, called from
 * `routes/projectRoutes.ts`'s `POST /api/portal/project/execution-ticket` route
 * (`action:'create'|'complete'|'fail'`). That route already HAD a real closure
 * mechanism (`complete` -> `done`, `fail` -> `cancelled`) — it was client-driven, by
 * design. The sole frontend caller (the AI Project Builder) was deliberately deleted
 * 2026-07-18, commit `13f8f0e5` ("Frontend only — backend untouched, per Ali"). A
 * repo-wide grep for `execution-ticket` today finds zero frontend callers anywhere —
 * no new `bpos_execution` ticket, and no completion/failure call for an existing one,
 * can ever be created again through that route. This module is the missing re-check
 * for the tickets that were already `in_progress` when that happened.
 *
 * Confirmed live in production (2026-08-16): 11 `bpos_execution` tickets stuck
 * `in_progress` since 2026-04-24..2026-04-30. Each carries `entity_type:'capability'`,
 * `entity_id` = a real `capabilities.id`. Two real, checkable, non-time-based signals
 * exist about that referenced capability, independent of the dead route:
 *
 *   1. `Capability.user_status` (`backend/src/models/Capability.ts:48-57`) —
 *      documented as "Authoritative. 'verified' — user clicked Mark Verified after
 *      Claude Code reported Status: COMPLETE and tests passed. All recommendation
 *      surfaces treat this BP as done." A capability that reached `verified` after the
 *      ticket was opened is a genuine SYNC GAP: the work IS done, only the (now-dead)
 *      completion call was never made. Confirmed live for 5 of the 11 tickets, each
 *      with a real `user_status_set_by` (an AdminUser id) and `user_status_set_at`.
 *
 *   2. Whether the `capabilities` row still exists at all. `capabilities` has no
 *      soft-delete column (confirmed via `information_schema.columns`) — a missing row
 *      is a real hard delete, via one of two legitimate in-repo pathways
 *      (`steeringExecutor.ts`'s `_delete` merge operation, or
 *      `scripts/provisionDemoOnboardingRuns.js`'s demo cleanup). A ticket whose
 *      capability no longer exists has nothing left to finish; per this ticket type's
 *      own established semantics (`action:'fail'` -> `cancelled`), it closes to
 *      `cancelled`, not `done`. Confirmed live for 1 of the 11 tickets.
 *
 * The remaining 5 tickets' capabilities are still `user_status:'in_progress'` today —
 * the SAME authoritative field that reads `'verified'` for the closeable 5 says, for
 * these, that no human has ever confirmed the build complete. A second candidate
 * signal (`requirements_maps` per-requirement `status`/`verification_status`) was
 * checked and rejected: every row for these 3 capabilities is internally
 * self-contradictory (`status:'verified'` but `verification_status:'not_verified'`)
 * and is not treated as authoritative anywhere else in this codebase. These 5 have no
 * real signal and are left untouched by this module — never force-closed on elapsed
 * time. See this run's `execution-contract.md`
 * (`.loop-architect/runs/20260816-bpos-orchestrator-capability-ticket-resolver/`) for
 * the full per-ticket evidence table.
 *
 * `user_status:'archived'` ("hidden from active recommendations... not treated as
 * equivalent to verified/done anywhere in the model's own doc) is deliberately left
 * classified as `no_signal` here, not as a third closeable outcome — none of the 11
 * real tickets hit it, and closing on it would be inventing a heuristic this run's
 * evidence doesn't support.
 *
 * No time-based fallback closure of any kind lives in this file: no wall-clock
 * comparison, no ticket-age computation, no "close after N days" heuristic anywhere.
 * A dedicated test in `__tests__/bposCapabilityTicketResolutionRules.test.ts` greps
 * this file's own executable source (comments stripped) for the tokens such a gate
 * would require and asserts zero matches, mirroring
 * `reeseStudentSupportSupersessionRules.ts`'s established pattern.
 */

export type BposCapabilityTicketOutcome =
  | 'capability_verified'
  | 'capability_deleted'
  | 'no_signal'
  | 'already_terminal';

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['done', 'cancelled']);

export interface BposCapabilityInfo {
  userStatus: string | null;
}

export interface BposCapabilityTicketInput {
  ticketId: string;
  /** The ticket's real current status. Defense in depth: the resolver is expected to
   * pre-filter to non-terminal tickets before calling this, but the classifier must
   * behave safely (never close, never throw) if handed a terminal one directly. */
  ticketStatus: string;
  entityId: string | null;
  /**
   * `null` means the caller looked up `entityId` in `capabilities` and found NO row
   * (hard-deleted, or never existed). A present object means the row exists — its
   * `userStatus` carries the capability's real, current `user_status` value.
   * `undefined` is never passed; the caller always resolves this before calling.
   */
  capability: BposCapabilityInfo | null;
}

export interface BposCapabilityTicketClassification {
  outcome: BposCapabilityTicketOutcome;
  shouldClose: boolean;
  closeToStatus: 'done' | 'cancelled' | null;
  reason: string;
}

/**
 * Classifies one `bpos_execution` ticket given its referenced capability's current
 * live state (the caller already resolved `entityId` -> `capability`). Pure, total,
 * never throws.
 */
export function classifyBposCapabilityTicket(
  input: BposCapabilityTicketInput,
): BposCapabilityTicketClassification {
  if (TERMINAL_STATUSES.has(input.ticketStatus)) {
    return {
      outcome: 'already_terminal',
      shouldClose: false,
      closeToStatus: null,
      reason:
        `Ticket is already '${input.ticketStatus}' — nothing to do. The resolver is expected to have already ` +
        'filtered this out; this is a defense-in-depth safety net, not the normal path.',
    };
  }

  if (!input.entityId) {
    return {
      outcome: 'no_signal',
      shouldClose: false,
      closeToStatus: null,
      reason:
        'This ticket carries no entity_id — there is nothing to check it against. Should not occur against real ' +
        'data (every bpos_execution ticket carries entity_id at creation time); defense-in-depth only.',
    };
  }

  if (input.capability === null) {
    return {
      outcome: 'capability_deleted',
      shouldClose: true,
      closeToStatus: 'cancelled',
      reason:
        `The capability this ticket was tracking (id ${input.entityId}) no longer exists in the capabilities ` +
        'table — a real, confirmed deletion (capabilities has no soft-delete column), not a lookup error. There ' +
        "is nothing left to finish. Closed to 'cancelled', matching this ticket type's own established semantics " +
        "for a build target that can never be validated (the live route's action:'fail' maps to 'cancelled', " +
        "never 'done').",
    };
  }

  if (input.capability.userStatus === 'verified') {
    return {
      outcome: 'capability_verified',
      shouldClose: true,
      closeToStatus: 'done',
      reason:
        `The capability this ticket was tracking (id ${input.entityId}) has user_status:'verified' — a real, ` +
        'human-asserted, authoritative signal ("user clicked Mark Verified after Claude Code reported Status: ' +
        'COMPLETE and tests passed", per Capability.ts\'s own documented contract). The build this ticket was ' +
        'tracking a stage of is confirmed complete; only the (now-dead) frontend call that would have told THIS ' +
        "ticket never fired. Closed to 'done' to reflect that already-established fact, never because time has " +
        'elapsed.',
    };
  }

  return {
    outcome: 'no_signal',
    shouldClose: false,
    closeToStatus: null,
    reason:
      `The capability this ticket was tracking (id ${input.entityId}) has user_status:'${input.capability.userStatus ?? 'unknown'}' ` +
      "today, not 'verified' — no human has confirmed this business process build as complete, and no other " +
      'reliable signal exists (requirements_maps rows for this ticket type were checked and found internally ' +
      "self-contradictory, not authoritative). Left open; not force-closed on elapsed time.",
  };
}
