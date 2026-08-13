import { AgentRun, TicketWorkUnit } from '../../models';

// ProofDesk Outcomes & Learning — Milestone 5. Cost-to-proof (spec 20.11): "Measure
// cost until evidence-backed completion, not only model-call cost." Confirmed in
// DISCOVER: `AgentRun` (the table this metric would naturally read cost from) has NO
// `cost_usd` column at all, and `WorkLedgerEvent.cost_usd` — the only place a dollar
// figure could live — is never set to a real value by any of this repo's ~6
// `emitEvent()` call sites today. Fabricating a dollar cost from data that doesn't
// exist would violate CLAUDE.md's Contract Enforcement + Definition of Done ("no
// fabricated numbers"). This service therefore measures REAL duration-to-proof
// (`AgentRun.duration_ms`, which IS populated) as the honest v1 proxy, and every
// returned row carries an explicit note saying so — never silently implying a dollar
// figure.
//
// Failure-First Design:
// 1. What happens if this fails? Read-only aggregation; a DB failure propagates.
// 2. Retry? None — stateless read.
// 3. Recovery if exhausted? N/A — no write side effect.
// 4. Explicit failure modes handled: a capability whose `done` work units have no
//    linked `AgentRun`/`duration_ms` (insufficient_data, never a fabricated 0ms);
//    empty input (returns []).

export type CostToProofDataStatus = 'sufficient_data' | 'insufficient_data';

export interface CostToProofEntry {
  capability: string;
  verified_count: number;
  avg_duration_to_proof_ms: number | null;
  status: CostToProofDataStatus;
  cost_usd_note: string;
}

const COST_USD_NOTE =
  'cost_usd is not populated by any current write path in this repo; this metric uses duration as the real, measurable proxy.';

/**
 * Per-`required_capability` average duration (ms) from `assigned_run_id` to `done`,
 * for work units that reached `done` (a verified/concluded state). Only work units
 * with BOTH a `done` status AND a linked `AgentRun` with a non-null `duration_ms`
 * contribute to the average; a capability whose `done` work units have no such
 * linkage reports `insufficient_data`, not a fabricated `0`.
 */
export async function computeCostToProof(): Promise<CostToProofEntry[]> {
  const doneUnits = await (TicketWorkUnit as any).findAll({
    where: { status: 'done' },
    attributes: ['required_capability', 'assigned_run_id'],
  });

  const groups = new Map<string, { verified_count: number; durations: number[] }>();
  for (const unit of doneUnits as any[]) {
    const capability = unit.required_capability;
    if (!groups.has(capability)) {
      groups.set(capability, { verified_count: 0, durations: [] });
    }
    groups.get(capability)!.verified_count += 1;
  }

  const runIds = (doneUnits as any[]).map((u) => u.assigned_run_id).filter((id): id is string => !!id);
  const runs = runIds.length
    ? await (AgentRun as any).findAll({
        where: { id: runIds },
        attributes: ['id', 'duration_ms'],
      })
    : [];
  const durationByRunId = new Map<string, number | null>();
  for (const run of runs as any[]) {
    durationByRunId.set(run.id, run.duration_ms ?? null);
  }

  for (const unit of doneUnits as any[]) {
    if (!unit.assigned_run_id) continue;
    const duration = durationByRunId.get(unit.assigned_run_id);
    if (duration != null) {
      groups.get(unit.required_capability)!.durations.push(duration);
    }
  }

  return Array.from(groups.entries()).map(([capability, g]) => {
    const hasDurations = g.durations.length > 0;
    const avg = hasDurations ? g.durations.reduce((a, b) => a + b, 0) / g.durations.length : null;
    return {
      capability,
      verified_count: g.verified_count,
      avg_duration_to_proof_ms: avg,
      status: hasDurations ? 'sufficient_data' : 'insufficient_data',
      cost_usd_note: COST_USD_NOTE,
    };
  });
}
