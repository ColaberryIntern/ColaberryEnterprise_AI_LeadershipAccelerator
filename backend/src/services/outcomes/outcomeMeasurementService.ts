import { Op } from 'sequelize';
import { OutcomeMeasurement, Ticket } from '../../models';

// ProofDesk Outcomes & Learning — Milestone 5. Outcome follow-up (spec 20.4):
// "completion proves implementation, outcome monitoring proves value." v1 measures
// exactly one honest, code-checkable signal — see OutcomeMeasurement.ts's header for
// why: does a new ticket sharing the closed ticket's `(entity_type, entity_id)` or
// naming it as `parent_ticket_id` appear within a fixed 7-day observation window.
// The due-measurement processor (processDueOutcomeMeasurements, T004) resolves
// scheduled rows once `scheduled_for` has arrived, wired into schedulerService.ts's
// daily cron.
//
// Failure-First Design (root CLAUDE.md):
// 1. What happens if this fails? scheduleOutcomeMeasurement() is called from
//    ticketService.ts's non-blocking done-hook (`.catch(() => {})`), so a failure
//    here never blocks or breaks the ticket status transition it observes.
// 2. Retry? None automatic inside this function — the caller's non-blocking hook is
//    itself not retried; a missed schedule simply means no follow-up row for that
//    ticket, which is a silent gap, not a crash.
// 3. Recovery if exhausted? None automatic in this milestone — no dead-letter queue.
//    A lost schedule surfaces as "this ticket has no outcome_measurements row",
//    discoverable via a manual query; not surfaced in an admin panel this milestone.
// 4. Explicit failure modes handled: ticket not found (throws, caught by caller),
//    duplicate schedule attempt (idempotent no-op via findOrCreate on the unique
//    (ticket_id, measurement_type) index), a closed ticket with neither
//    entity_type/entity_id nor any child relationship to check (schedules cleanly —
//    the insufficient_data resolution happens later, in T004's processor, never here).
//    Not handled: DB fully unavailable — propagates to the caller.

const OBSERVATION_WINDOW_DAYS = 7;

/**
 * Schedules a 7-day recurrence-check follow-up for a ticket that just reached `done`.
 * Idempotent: a duplicate call for the same ticket is a no-op that returns the
 * existing row (findOrCreate on the unique (ticket_id, measurement_type) index),
 * never a second row or a thrown duplicate-key error.
 */
export async function scheduleOutcomeMeasurement(ticketId: string): Promise<OutcomeMeasurement> {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  const t = ticket as any;
  const scheduledFor = new Date(Date.now() + OBSERVATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await (OutcomeMeasurement as any).findOrCreate({
    where: { ticket_id: ticketId, measurement_type: 'ticket_recurrence_check' },
    defaults: {
      ticket_id: ticketId,
      measurement_type: 'ticket_recurrence_check',
      baseline: {
        ticket_status: t.status,
        entity_type: t.entity_type ?? null,
        entity_id: t.entity_id ?? null,
        parent_ticket_id: t.parent_ticket_id ?? null,
        completed_at: t.completed_at ? new Date(t.completed_at).toISOString() : null,
      },
      target: { expected: 'no_recurrence_ticket_within_window' },
      observation_window_days: OBSERVATION_WINDOW_DAYS,
      scheduled_for: scheduledFor,
      status: 'scheduled',
      outcome_status: 'pending',
    },
  });

  return row;
}

export interface ProcessDueOutcomeMeasurementsResult {
  processed: number;
  stable: number;
  recurrence_detected: number;
  insufficient_data: number;
}

/**
 * Resolves every `outcome_measurements` row whose `scheduled_for` has arrived.
 *
 * Candidate recurrence tickets: any ticket created strictly after the closed ticket's
 * `completed_at` where EITHER `parent_ticket_id` = the closed ticket's id, OR (only if
 * the closed ticket had both `entity_type` and `entity_id` set) `entity_type` +
 * `entity_id` both match.
 *
 * Resolution (honest, per CLAUDE.md — never fabricate a confident verdict from a weak
 * signal):
 * - A candidate found -> `recurrence_detected` (a real, positive signal regardless of
 *   which check surfaced it).
 * - No candidate found AND the closed ticket had a real entity link to check ->
 *   `stable` (there was something meaningful to check, and it came back clean).
 * - No candidate found AND the closed ticket had NO entity link (only the always-
 *   checkable-but-weak parent_ticket_id lookup was possible) -> `insufficient_data`,
 *   never a fabricated `stable` — this is the common case in production today, since
 *   `entity_type`/`entity_id` are optional ticket fields.
 *
 * Idempotent: only `status='scheduled'` rows are selected, so re-running the
 * processor (e.g. a second cron tick before the next day) never reprocesses an
 * already-`observed` row.
 */
export async function processDueOutcomeMeasurements(): Promise<ProcessDueOutcomeMeasurementsResult> {
  const due = await (OutcomeMeasurement as any).findAll({
    where: { status: 'scheduled', scheduled_for: { [Op.lte]: new Date() } },
  });

  const result: ProcessDueOutcomeMeasurementsResult = {
    processed: 0,
    stable: 0,
    recurrence_detected: 0,
    insufficient_data: 0,
  };

  for (const row of due as any[]) {
    const baseline = row.baseline || {};
    const hasEntitySignal = !!(baseline.entity_type && baseline.entity_id);
    const completedAt = baseline.completed_at ? new Date(baseline.completed_at) : row.created_at;

    const orConditions: any[] = [{ parent_ticket_id: row.ticket_id }];
    if (hasEntitySignal) {
      orConditions.push({ entity_type: baseline.entity_type, entity_id: baseline.entity_id });
    }

    const candidates = await (Ticket as any).findAll({
      where: {
        id: { [Op.ne]: row.ticket_id },
        created_at: { [Op.gt]: completedAt },
        [Op.or]: orConditions,
      },
      attributes: ['id'],
    });

    const recurrenceTicketIds: string[] = candidates.map((t: any) => t.id);
    let outcomeStatus: 'stable' | 'recurrence_detected' | 'insufficient_data';
    if (recurrenceTicketIds.length > 0) {
      outcomeStatus = 'recurrence_detected';
    } else if (hasEntitySignal) {
      outcomeStatus = 'stable';
    } else {
      outcomeStatus = 'insufficient_data';
    }

    await row.update({
      status: 'observed',
      observed_at: new Date(),
      observed_result: { recurrence_ticket_ids: recurrenceTicketIds, found: recurrenceTicketIds.length > 0 },
      outcome_status: outcomeStatus,
    });

    result.processed += 1;
    result[outcomeStatus] += 1;
  }

  return result;
}

export interface OutcomeMeasurementsSummary {
  scheduled: number;
  observed: number;
  stable: number;
  recurrence_detected: number;
  insufficient_data: number;
}

/** Read-only summary for the admin panel (T009/T010): counts by lifecycle status
 * (scheduled vs observed) and, among observed rows, by outcome_status. */
export async function getOutcomeMeasurementsSummary(): Promise<OutcomeMeasurementsSummary> {
  const rows = await (OutcomeMeasurement as any).findAll({
    attributes: ['status', 'outcome_status'],
  });

  const summary: OutcomeMeasurementsSummary = {
    scheduled: 0,
    observed: 0,
    stable: 0,
    recurrence_detected: 0,
    insufficient_data: 0,
  };

  for (const row of rows as any[]) {
    if (row.status === 'scheduled') summary.scheduled += 1;
    if (row.status === 'observed') {
      summary.observed += 1;
      if (row.outcome_status === 'stable') summary.stable += 1;
      else if (row.outcome_status === 'recurrence_detected') summary.recurrence_detected += 1;
      else if (row.outcome_status === 'insufficient_data') summary.insufficient_data += 1;
    }
  }

  return summary;
}
