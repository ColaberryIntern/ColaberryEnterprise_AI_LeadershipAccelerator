import crypto from 'crypto';

// ProofDesk Ticket-Board Honesty fix (2026-08-16, session CC-20260816-q4mz). Root
// cause: at least 3 real, confirmed ticket-creation paths
// (`services/company/ticketOrchestrator.ts`'s `createTrackedTicket()` family, and its
// own fallback bypass in `routes/projectRoutes.ts`'s `/execution-ticket` route) call
// `Ticket.create()` directly, bypassing `ticketService.ts`'s `createTicket()` — which is
// the only place that was emitting a `work_ledger_events` row. Result: ~90% of the
// 16,070 production tickets have zero linked ledger events, so the Story tab's
// `summaryGeneratorService.ts` falls back to a generic "No ledger activity recorded"
// line and the founder stopped trusting the ticket board.
//
// Fix: an `afterCreate` hook on the `Ticket` model itself (wired in `models/Ticket.ts`)
// is the one place every creation path passes through, whether it goes through
// `ticketService.createTicket()`, `ticketOrchestrator.createTrackedTicket()`, or any
// future service nobody has written yet — a model hook cannot be bypassed by adding
// another service wrapper, unlike the previous single-point-of-failure design. This
// mirrors an existing, working precedent in this exact codebase:
// `models/TimelineCard.ts`'s `capeSkillMappingHook` (afterCreate/afterUpdate, dynamic
// import to avoid a circular dependency with the service it calls, try/catch so a hook
// failure can never abort the create/update transaction it's attached to).
//
// Known residual gap (disclosed, not silently declared solved): a Sequelize model hook
// fires on `Model.create()` / instance `.save()`, never on raw SQL. An audit at fix time
// (grep for `INSERT INTO tickets` across `backend/src`, case-insensitive) found zero raw
// SQL ticket-insert paths in this codebase today, so this hook currently closes every
// known creation path — but a future `sequelize.query('INSERT INTO tickets ...')` would
// still bypass it. If that ever happens, the gap will show up as a ticket predating no
// hook coverage despite being created after `TICKET_LEDGER_HOOK_LIVE_SINCE` below.
//
// Failure-First Design:
// 1. What happens if this fails? The hook's own try/catch swallows the error and logs a
//    warning — the ticket create/update this hook is attached to must never fail because
//    of ledger bookkeeping (same contract as `capeSkillMappingHook`).
// 2. Retry? None here — `emitLedgerEventSafe` itself never throws, and the idempotency
//    key below means a legitimate retry of the surrounding operation is naturally safe.
// 3. Recovery if exhausted? A swallowed failure here surfaces the same way any other
//    lost ledger event does today: the ingestion-health admin panel
//    (`workLedgerHealthService.ts`) or, for this specific case, the Story tab's honest
//    "no ledger activity" fallback (see `summaryGeneratorService.ts`'s
//    `TICKET_LEDGER_HOOK_LIVE_SINCE`-gated branch).
// 4. Explicit failure modes handled: a rejected async call, a synchronous throw inside
//    the dynamic import itself. Not handled: the DB being fully unavailable at hook
//    time — that already can't roll back the ticket create (Sequelize would have failed
//    the create itself before the hook ran), so there's nothing more for this hook to do.

/**
 * The day this hook shipped to production. Tickets created before this timestamp
 * cannot be assumed to carry a ledger event purely because of this hook — their
 * creation path may simply predate it. `summaryGeneratorService.ts` uses this to
 * render an honest "created before activity tracking was reliable" note instead of
 * either fabricating detail or showing the generic "no ledger activity" line for
 * tickets nobody could have instrumented retroactively.
 */
export const TICKET_LEDGER_HOOK_LIVE_SINCE = new Date('2026-08-16T00:00:00.000Z');

/**
 * `Ticket` model `afterCreate` hook. A named, exported function (not an inline
 * closure) so it is directly unit-testable without needing Sequelize to actually run
 * it — see `models/__tests__/ticketCreationLedgerHook.test.ts`, mirroring
 * `models/__tests__/timelineCardSkillMappingHook.test.ts`'s established pattern.
 *
 * Uses the SAME idempotency key format `ticketService.createTicket()` already uses
 * (`ticket-created:<id>`) so tickets created through the wrapped path — which already
 * calls `emitLedgerEventSafe` itself — get exactly one ledger event, not two:
 * `emitEvent()`'s own dedup (unique constraint on `idempotency_key`, re-fetch on race)
 * makes the second call a safe no-op.
 */
export async function ticketCreationLedgerHook(instance: {
  id: string;
  type?: string | null;
  created_by_type?: string | null;
  created_by_id?: string | null;
}): Promise<void> {
  try {
    if (!instance?.id || !instance.created_by_type || !instance.created_by_id) {
      // Defensive only — the DB schema already enforces created_by_type/created_by_id
      // as NOT NULL, so this should be unreachable in practice. Guards against a
      // malformed in-memory instance (e.g. a partial mock) rather than emitting a
      // ledger event with missing actor identity.
      return;
    }
    const { emitLedgerEventSafe } = await import('./emitLedgerEventSafe');
    // No `any` cast needed here: workLedgerEventSchema.ts declares actorType/actorId/
    // ticketId/etc. as plain `z.string()`, not a narrow literal union, and the guard
    // above already narrows instance.created_by_type/created_by_id from
    // `string | null | undefined` to `string` for the rest of this block.
    await emitLedgerEventSafe({
      ticketId: instance.id,
      traceId: crypto.randomUUID(),
      actorType: instance.created_by_type,
      actorId: instance.created_by_id,
      intent: 'ticket.create',
      domain: 'tickets',
      actionClass: 'create',
      targetType: 'ticket',
      targetId: instance.id,
      idempotencyKey: `ticket-created:${instance.id}`,
      result: 'success',
      sourceRecordType: 'ticket',
      sourceRecordId: instance.id,
    });
  } catch (err: any) {
    // Defense in depth on top of emitLedgerEventSafe's own never-throw contract —
    // matches capeSkillMappingHook's "even a synchronous throw (e.g. a broken dynamic
    // import) is caught" guarantee.
    console.warn('[Ticket] afterCreate ledger hook failed (non-fatal):', err?.message);
  }
}
