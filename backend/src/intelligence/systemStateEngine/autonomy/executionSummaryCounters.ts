/**
 * executionSummaryCounters — in-memory rolling counters used by the
 * engine state's `execution_summary` block. Strictly sync, no DB reads.
 * Counters are reset on process restart, which is acceptable: the UI
 * shows "0 in last 24h" rather than crashing, and the source-of-truth
 * for historical activity is GovernanceAuditEntry rows.
 *
 * Updated by the handoff/verification/rollback/self-heal listeners.
 *
 * Phase 14 §H.
 */

interface ProjectExecutionCounters {
  active_handoffs_24h: Set<string>;       // plan_ids fired in last 24h
  recent_verifications: number;
  recent_rollbacks: number;
  self_heal_actions_24h: number;
  last_event_at: number;
}

const states = new Map<string, ProjectExecutionCounters>();

function getOrInit(project_id: string): ProjectExecutionCounters {
  let s = states.get(project_id);
  if (!s) {
    s = {
      active_handoffs_24h: new Set(),
      recent_verifications: 0,
      recent_rollbacks: 0,
      self_heal_actions_24h: 0,
      last_event_at: Date.now(),
    };
    states.set(project_id, s);
  }
  return s;
}

export function noteHandoffFired(project_id: string, plan_id: string): void {
  const s = getOrInit(project_id);
  s.active_handoffs_24h.add(plan_id);
  s.last_event_at = Date.now();
}

export function noteVerificationOutcome(project_id: string): void {
  const s = getOrInit(project_id);
  s.recent_verifications++;
  s.last_event_at = Date.now();
}

export function noteRollback(project_id: string): void {
  const s = getOrInit(project_id);
  s.recent_rollbacks++;
  s.last_event_at = Date.now();
}

export function noteSelfHeal(project_id: string): void {
  const s = getOrInit(project_id);
  s.self_heal_actions_24h++;
  s.last_event_at = Date.now();
}

export interface ExecutionSummarySnapshot {
  active_handoffs_24h: number;
  recent_verifications: number;
  recent_rollbacks: number;
  self_heal_actions_24h: number;
}

export function readSummary(project_id: string): ExecutionSummarySnapshot {
  const s = getOrInit(project_id);
  return {
    active_handoffs_24h: s.active_handoffs_24h.size,
    recent_verifications: s.recent_verifications,
    recent_rollbacks: s.recent_rollbacks,
    self_heal_actions_24h: s.self_heal_actions_24h,
  };
}

export function _resetExecutionSummaryCounters(): void {
  states.clear();
}
