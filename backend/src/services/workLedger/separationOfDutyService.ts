import { Op } from 'sequelize';
import { WorkLedgerEvent } from '../../models';
import { emitEvent } from './workLedgerService';

// ProofDesk Governance — Milestone 4 (Governance Enforcement, SHADOW MODE ONLY).
//
// Separation-of-duty check: flags (LOGS, NEVER BLOCKS) when the same agent that
// performed an R2+ action on a ticket is also about to verify it on that same ticket.
// This is ProofDesk-specific (not covered by abac-design.md's generic ladder), keyed
// on agent_name since ProofDesk's actors are agents, not individual humans — the only
// identity field that actually exists on work_ledger_events/agent_runs today.
//
// The current dispatch attempt's OWN ledger event doesn't exist yet at the point this
// check runs (it's written only after mapping.execute() completes, same as the
// authorization decision in agentActionAuthorizationBridge.ts) - so there is no risk
// of a dispatch attempt self-matching against its own not-yet-written row.
//
// Failure-First Design (root CLAUDE.md):
// 1. What happens if this fails? Degrades to `{ flagged: false, priorEventIds: [] }` -
//    the caller's real action still proceeds unmodified, exactly like every other
//    Milestone 4 check in this run.
// 2. Retry? None automatic - a single read + (on flag) one ledger write per dispatch
//    attempt. The flag ledger event's idempotency key is scoped to THIS dispatch
//    attempt (via the caller-supplied dispatchEventId), so a retried dispatch attempt
//    produces a fresh flag check and a fresh, non-duplicate flag event if it flags again.
// 3. Recovery if exhausted? None needed - a missed flag only under-documents a
//    same-agent-verifies-own-work pattern in the ledger; it never blocks or loses the
//    real action.
// 4. Explicit failure modes handled: the WorkLedgerEvent query throwing (caught, safe
//    default), the flag-event emitEvent() call throwing (caught locally, logged, does
//    not propagate - same *Safe() pattern as every other ledger write in this run).

export interface SeparationOfDutyResult {
  flagged: boolean;
  priorEventIds: string[];
}

const HIGH_RISK_TIERS = ['R2', 'R3', 'R4'];

/**
 * Does `verifyingAgentName` have a prior R2+ work_ledger_events row on this ticket?
 * Pure read, no side effects - callers decide what (if anything) to log with the
 * result via recordSeparationOfDutyFlag() below.
 */
export async function checkSeparationOfDuty(
  ticketId: string,
  verifyingAgentName: string,
): Promise<SeparationOfDutyResult> {
  try {
    const priorEvents = await WorkLedgerEvent.findAll({
      where: {
        ticket_id: ticketId,
        actor_id: verifyingAgentName,
        risk_tier: { [Op.in]: HIGH_RISK_TIERS },
      },
      attributes: ['event_id'],
    });

    if (priorEvents.length === 0) {
      return { flagged: false, priorEventIds: [] };
    }
    return { flagged: true, priorEventIds: priorEvents.map((e: any) => e.event_id) };
  } catch (err: any) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'separationOfDutyService',
        event: 'check_separation_of_duty_failed',
        outcome: 'failure',
        error_class: err?.name || 'Error',
        context: { ticket_id: ticketId, agent_name: verifyingAgentName, message: err?.message },
      }),
    );
    return { flagged: false, priorEventIds: [] };
  }
}

/**
 * Writes a log-only `separation_of_duty_flag` ledger event when checkSeparationOfDuty()
 * flagged a violation. Never blocks, never throws to the caller - wrapped the same way
 * every other Milestone 4 ledger write in this run is wrapped.
 */
export async function recordSeparationOfDutyFlag(input: {
  ticketId: string;
  runId?: string | null;
  traceId: string;
  agentName: string;
  idempotencyKey: string;
  priorEventIds: string[];
}): Promise<void> {
  try {
    await emitEvent({
      ticketId: input.ticketId,
      runId: input.runId ?? null,
      traceId: input.traceId,
      actorType: 'agent',
      actorId: input.agentName,
      intent: 'ticket.separation_of_duty_check',
      domain: 'tickets',
      actionClass: 'separation_of_duty_flag',
      targetType: 'ticket',
      targetId: input.ticketId,
      idempotencyKey: input.idempotencyKey,
      result: 'skipped', // log-only marker, matches the 'no agent mapping' skip convention
      reasonCode: 'same_agent_prior_r2plus_action',
      sourceRecordType: 'ticket',
      sourceRecordId: input.ticketId,
    });
  } catch (err: any) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'separationOfDutyService',
        event: 'record_separation_of_duty_flag_failed',
        outcome: 'failure',
        error_class: err?.name || err?.error_class || 'Error',
        context: { ticket_id: input.ticketId, agent_name: input.agentName, message: err?.message },
      }),
    );
  }
}
