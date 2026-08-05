import { WorkLedgerEvent, TicketActionLink } from '../../models';
import { workLedgerEventInputSchema, WorkLedgerEventInput } from '../../schemas/workLedgerEventSchema';
import { env } from '../../config/env';

// ProofDesk Work Ledger — Milestone 1 (Foundation). emitEvent() is the single
// append-only writer for work_ledger_events. Shadow mode: nothing outside
// workLedger/* and its admin-panel reader depends on this yet, so a failure here
// must never surface to (or change the behavior of) the ticket operation it is
// observing — see the bridge call sites in ticketService.ts and
// ticketAgentDispatcher.ts, each of which wraps its own emitEvent() call in a
// local try/catch that only logs.
//
// Failure-First Design (root CLAUDE.md):
// 1. What happens if this fails? The write is rejected (malformed envelope) or made
//    safe (duplicate idempotency_key -> no-op, concurrent race -> re-fetch existing).
// 2. Retry? None automatic inside emitEvent() itself — it is a single DB write. The
//    idempotency key is what makes an upstream retry of the *whole calling
//    operation* safe to replay.
// 3. Recovery if exhausted? None automatic in Milestone 1 — a lost event surfaces as
//    an "orphan action" in the ingestion-health admin panel (workLedgerHealthService)
//    for manual follow-up. No dead-letter queue yet.
// 4. Explicit failure modes handled: malformed envelope (validation error), duplicate
//    idempotency key (no-op), unique-constraint race on idempotency_key (re-fetch and
//    return the winner). Not handled: DB fully unavailable — that propagates as a
//    generic error; it is each *caller's* job (per the bridge functions) to catch and
//    log it without breaking the ticket operation being observed.

export class WorkLedgerValidationError extends Error {
  error_class = 'WorkLedgerValidationError';
  issues?: unknown;

  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'WorkLedgerValidationError';
    this.issues = issues;
  }
}

function isUniqueConstraintError(err: any): boolean {
  return err?.name === 'SequelizeUniqueConstraintError';
}

/**
 * Append one event to the Work Ledger. Validates the envelope, enforces
 * idempotency on `idempotencyKey` (a duplicate key is a no-op that returns the
 * existing row, not an error — per root CLAUDE.md > Idempotency & Replayability),
 * and links the event to its ticket(s) via ticket_action_links.
 *
 * Throws `WorkLedgerValidationError` for a malformed envelope. Callers that must
 * not let a ledger failure affect their own control flow should wrap this call in
 * their own try/catch (see ticketService.ts / ticketAgentDispatcher.ts).
 */
export async function emitEvent(input: WorkLedgerEventInput): Promise<WorkLedgerEvent> {
  const parsed = workLedgerEventInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new WorkLedgerValidationError(`Malformed work ledger envelope: ${detail}`, parsed.error.issues);
  }
  const data = parsed.data;

  const existing = await WorkLedgerEvent.findOne({ where: { idempotency_key: data.idempotencyKey } });
  if (existing) {
    return existing;
  }

  let created: WorkLedgerEvent;
  try {
    created = await WorkLedgerEvent.create({
      // ProofDesk Milestone 4: use the caller-supplied event_id when provided (so a
      // pre-computed governance decision can reference this exact row), otherwise let
      // the DB default (DataTypes.UUIDV4) generate one, exactly as before this
      // milestone. `event_id: undefined` is a no-op for Sequelize's create() - the
      // column default still applies - so this is fully backward compatible.
      event_id: data.eventId ?? undefined,
      work_context_id: data.workContextId ?? null,
      ticket_id: data.ticketId ?? null,
      work_unit_id: data.workUnitId ?? null,
      run_id: data.runId ?? null,
      trace_id: data.traceId,
      parent_event_id: data.parentEventId ?? null,
      actor_type: data.actorType,
      actor_id: data.actorId,
      agent_version: data.agentVersion ?? null,
      intent: data.intent,
      domain: data.domain,
      action_class: data.actionClass,
      target_type: data.targetType,
      target_id: data.targetId ?? null,
      environment: data.environment ?? env.nodeEnv,
      risk_tier: data.riskTier ?? 'R0',
      authorization_decision_id: data.authorizationDecisionId ?? null,
      idempotency_key: data.idempotencyKey,
      before_state_ref: data.beforeStateRef ?? null,
      after_state_ref: data.afterStateRef ?? null,
      result: data.result,
      reason_code: data.reasonCode ?? null,
      duration_ms: data.durationMs ?? null,
      cost_usd: data.costUsd ?? null,
      source_record_type: data.sourceRecordType ?? null,
      source_record_id: data.sourceRecordId ?? null,
      occurred_at: data.occurredAt ?? new Date(),
    } as any);
  } catch (err: any) {
    if (isUniqueConstraintError(err)) {
      // Concurrency race: two near-simultaneous calls with the same idempotency_key
      // — the unique constraint rejects the loser. Re-fetch and return the winner's
      // row instead of throwing, so idempotency holds even under overlapping retries.
      const winner = await WorkLedgerEvent.findOne({ where: { idempotency_key: data.idempotencyKey } });
      if (winner) return winner;
    }
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'workLedger',
        event: 'emit_event_failed',
        outcome: 'failure',
        error_class: 'WorkLedgerWriteError',
        context: { idempotency_key: data.idempotencyKey, message: err?.message },
      }),
    );
    throw err;
  }

  const ticketLinks: Array<{ ticketId: string; role: 'primary' | 'related' }> = [];
  if (data.ticketId) ticketLinks.push({ ticketId: data.ticketId, role: 'primary' });
  for (const relatedId of data.relatedTicketIds ?? []) {
    if (relatedId !== data.ticketId) ticketLinks.push({ ticketId: relatedId, role: 'related' });
  }

  for (const link of ticketLinks) {
    try {
      await TicketActionLink.findOrCreate({
        where: { ticket_id: link.ticketId, event_id: created.event_id },
        defaults: {
          ticket_id: link.ticketId,
          event_id: created.event_id,
          link_role: link.role,
        } as any,
      });
    } catch (err: any) {
      // Non-fatal: the event row itself is already durable; a missing link only
      // degrades the ingestion-health panel's per-ticket breakdown, it doesn't lose
      // the underlying evidence.
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'workLedger',
          event: 'ticket_action_link_failed',
          outcome: 'partial',
          error_class: 'WorkLedgerLinkError',
          context: { ticket_id: link.ticketId, event_id: created.event_id, message: err?.message },
        }),
      );
    }
  }

  return created;
}
