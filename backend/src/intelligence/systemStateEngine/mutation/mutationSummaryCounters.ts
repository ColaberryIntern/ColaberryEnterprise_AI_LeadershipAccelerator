/**
 * mutationSummaryCounters — in-memory rolling counters used by the
 * engine state's `mutation_summary` block. Strictly sync, no DB reads.
 *
 * The Phase 14 `executionSummaryCounters` covers handoff/verification
 * activity for user-facing remediation. Phase 15 mutations are about
 * the engine's own operational state — different surface, separate
 * counter so the two don't entangle.
 *
 * Counters reset on process restart; GovernanceAuditEntry rows remain
 * the source of truth for historical activity.
 */

interface ProjectMutationCounters {
  active_envelopes_24h: Set<string>;        // mutation_ids fired in last 24h
  recent_verifications: number;
  recent_rollbacks: number;
  last_event_at: number;
}

const states = new Map<string, ProjectMutationCounters>();

function getOrInit(project_id: string): ProjectMutationCounters {
  let s = states.get(project_id);
  if (!s) {
    s = {
      active_envelopes_24h: new Set(),
      recent_verifications: 0,
      recent_rollbacks: 0,
      last_event_at: Date.now(),
    };
    states.set(project_id, s);
  }
  return s;
}

export function noteMutationFired(project_id: string, mutation_id: string): void {
  const s = getOrInit(project_id);
  s.active_envelopes_24h.add(mutation_id);
  s.last_event_at = Date.now();
}

export function noteMutationVerification(project_id: string): void {
  const s = getOrInit(project_id);
  s.recent_verifications++;
  s.last_event_at = Date.now();
}

export function noteMutationRollback(project_id: string): void {
  const s = getOrInit(project_id);
  s.recent_rollbacks++;
  s.last_event_at = Date.now();
}

export interface MutationCounterSnapshot {
  readonly active_envelopes_24h: number;
  readonly recent_verifications: number;
  readonly recent_rollbacks: number;
}

export function readMutationCounters(project_id: string): MutationCounterSnapshot {
  const s = getOrInit(project_id);
  return {
    active_envelopes_24h: s.active_envelopes_24h.size,
    recent_verifications: s.recent_verifications,
    recent_rollbacks: s.recent_rollbacks,
  };
}

export function _resetMutationSummaryCounters(): void {
  states.clear();
}
