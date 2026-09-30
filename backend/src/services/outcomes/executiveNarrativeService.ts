import { Op } from 'sequelize';
import { Ticket, AgentRun, WorkLedgerEvent, ApprovalRequest, OutcomeMeasurement } from '../../models';
import { getGovernanceShadowSummary } from '../workLedger/workLedgerHealthService';

// ProofDesk Outcomes & Learning — Milestone 5. Executive narrative (spec 20.12):
// "Generate daily and weekly stories such as: what shipped, what was prevented, what
// failed safely, what needs a decision, and what produced measurable results." Every
// section is assembled from real ledger/evidence facts queried fresh for the
// requested window — never fabricated. `honest_empty: true` when every section is
// genuinely zero; callers render an explicit "no activity in this window" message
// rather than the generator inventing narrative text.
//
// "Failed safely" (execution-contract.md Assumption 4, the one honest, code-checkable
// interpretation available): failed AgentRuns whose linked WorkLedgerEvent risk_tier
// (via run_id) is R0/R1 — a bounded-blast-radius failure, not a general safety claim.
//
// Failure-First Design:
// 1. What happens if this fails? Read-only aggregation across 5 independent queries;
//    a DB failure propagates to the caller (an admin route).
// 2. Retry? None — stateless read, safe to re-request at will.
// 3. Recovery if exhausted? N/A — no write side effect.
// 4. Explicit failure modes handled: zero activity in every dimension (honest_empty
//    reported, no fabricated content). Not handled: DB unavailable.

export type NarrativeWindow = 'day' | 'week';

export interface ExecutiveNarrative {
  window: NarrativeWindow;
  generated_at: string;
  shipped: { count: number; tickets: Array<{ id: string; title: string }> };
  prevented: { would_block: number; would_require_approval: number };
  failed_safely: { count: number; note: string };
  needs_decision: { count: number; items: Array<{ ticket_id: string; reason: string }> };
  measurable_results: { stable: number; recurrence_detected: number; insufficient_data: number };
  honest_empty: boolean;
}

const FAILED_SAFELY_NOTE =
  'Counts failed agent runs whose ledger event risk_tier is R0/R1 (bounded blast radius) — not a general safety guarantee.';

function windowStart(window: NarrativeWindow): Date {
  const hours = window === 'day' ? 24 : 24 * 7;
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

export async function generateExecutiveNarrative(window: NarrativeWindow): Promise<ExecutiveNarrative> {
  const since = windowStart(window);
  const windowHours = window === 'day' ? 24 : 24 * 7;

  // shipped
  const shippedTickets = await (Ticket as any).findAll({
    where: { status: 'done', completed_at: { [Op.gte]: since } },
    attributes: ['id', 'title'],
  });

  // prevented — reuses M1/M4's existing getGovernanceShadowSummary, not duplicated
  const governance = await getGovernanceShadowSummary(windowHours);

  // failed_safely — failed AgentRuns whose linked WorkLedgerEvent.risk_tier is R0/R1
  const failedRuns = await (AgentRun as any).findAll({
    where: { status: 'failed', started_at: { [Op.gte]: since } },
    attributes: ['id'],
  });
  let failedSafelyCount = 0;
  if (failedRuns.length > 0) {
    const runIds = (failedRuns as any[]).map((r) => r.id);
    const linkedEvents = await (WorkLedgerEvent as any).findAll({
      where: { run_id: { [Op.in]: runIds }, risk_tier: { [Op.in]: ['R0', 'R1'] } },
      attributes: ['run_id'],
    });
    failedSafelyCount = new Set((linkedEvents as any[]).map((e) => e.run_id)).size;
  }

  // needs_decision — approval_requests still awaiting a decision in shadow mode
  const needsDecisionRows = await (ApprovalRequest as any).findAll({
    where: { verdict: 'would_require_approval', created_at: { [Op.gte]: since } },
    attributes: ['ticket_id', 'reason_code'],
  });

  // measurable_results — outcome_measurements observed within the window
  const observedRows = await (OutcomeMeasurement as any).findAll({
    where: { status: 'observed', observed_at: { [Op.gte]: since } },
    attributes: ['outcome_status'],
  });
  const measurable = { stable: 0, recurrence_detected: 0, insufficient_data: 0 };
  for (const row of observedRows as any[]) {
    if (row.outcome_status === 'stable') measurable.stable += 1;
    else if (row.outcome_status === 'recurrence_detected') measurable.recurrence_detected += 1;
    else if (row.outcome_status === 'insufficient_data') measurable.insufficient_data += 1;
  }

  const needsDecisionItems = (needsDecisionRows as any[])
    .filter((r) => r.ticket_id)
    .map((r) => ({ ticket_id: r.ticket_id, reason: r.reason_code || 'unspecified' }));

  const honestEmpty =
    shippedTickets.length === 0 &&
    governance.would_block === 0 &&
    governance.would_require_approval === 0 &&
    failedSafelyCount === 0 &&
    needsDecisionItems.length === 0 &&
    measurable.stable === 0 &&
    measurable.recurrence_detected === 0 &&
    measurable.insufficient_data === 0;

  return {
    window,
    generated_at: new Date().toISOString(),
    shipped: {
      count: shippedTickets.length,
      tickets: (shippedTickets as any[]).map((t) => ({ id: t.id, title: t.title })),
    },
    prevented: {
      would_block: governance.would_block,
      would_require_approval: governance.would_require_approval,
    },
    failed_safely: { count: failedSafelyCount, note: FAILED_SAFELY_NOTE },
    needs_decision: { count: needsDecisionItems.length, items: needsDecisionItems },
    measurable_results: measurable,
    honest_empty: honestEmpty,
  };
}
