/**
 * causalitySummaryCounters — Phase 16 in-memory rolling counters used
 * by the engine state's `causality_summary` block. Strictly sync,
 * no DB reads. Counters are reset on process restart.
 *
 * Source-of-truth for historical data is GovernanceAuditEntry rows
 * (kinds: causal_root_cause_detected, validator_disagreement,
 * arbitration_completed, stabilization_branch_isolated, causality_lineage_updated).
 */

import type { CausalitySummarySnapshot } from './causalityTypes';

interface ProjectCausalityCounters {
  active_root_causes: number;
  unstable_branches: number;
  validator_conflicts: number;
  trust_propagation_alerts: number;
  contradiction_clusters: number;
  last_event_at: number;
}

const states = new Map<string, ProjectCausalityCounters>();

function getOrInit(project_id: string): ProjectCausalityCounters {
  let s = states.get(project_id);
  if (!s) {
    s = {
      active_root_causes: 0,
      unstable_branches: 0,
      validator_conflicts: 0,
      trust_propagation_alerts: 0,
      contradiction_clusters: 0,
      last_event_at: Date.now(),
    };
    states.set(project_id, s);
  }
  return s;
}

export function noteRootCauseDetected(project_id: string): void {
  const s = getOrInit(project_id);
  s.active_root_causes++;
  s.last_event_at = Date.now();
}

export function noteUnstableBranch(project_id: string): void {
  const s = getOrInit(project_id);
  s.unstable_branches++;
  s.last_event_at = Date.now();
}

export function noteValidatorConflict(project_id: string): void {
  const s = getOrInit(project_id);
  s.validator_conflicts++;
  s.last_event_at = Date.now();
}

export function noteTrustPropagationAlert(project_id: string): void {
  const s = getOrInit(project_id);
  s.trust_propagation_alerts++;
  s.last_event_at = Date.now();
}

export function noteContradictionCluster(project_id: string, count = 1): void {
  const s = getOrInit(project_id);
  s.contradiction_clusters += count;
  s.last_event_at = Date.now();
}

export function readCausalitySummary(project_id: string): CausalitySummarySnapshot {
  const s = getOrInit(project_id);
  return {
    active_root_causes: s.active_root_causes,
    unstable_branches: s.unstable_branches,
    validator_conflicts: s.validator_conflicts,
    trust_propagation_alerts: s.trust_propagation_alerts,
    contradiction_clusters: s.contradiction_clusters,
  };
}

export function _resetCausalitySummaryCounters(): void {
  states.clear();
}
