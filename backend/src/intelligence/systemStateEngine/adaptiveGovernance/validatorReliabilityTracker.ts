/**
 * validatorReliabilityTracker — Phase 17. Per-validator rolling
 * reliability metrics over a 24-hour window.
 *
 * Strictly in-memory + sync. Counters reset on process restart;
 * GovernanceAuditEntry rows of kind `arbitration_completed` +
 * `validator_disagreement` remain the historical source of truth.
 *
 * Architectural commitment: this tracker only OBSERVES validator
 * outcomes. It never modifies validator code, and it never spawns
 * new validators.
 */

import type { ValidatorRole, ValidationArbitrationResult, ValidatorVerdict } from '../causality/causalityTypes';
import { VALIDATOR_ROLES } from '../causality/distributedValidationHarness';
import type { ValidatorReliabilityMetrics, ValidatorReliabilityProfile } from './adaptiveGovernanceTypes';
import { RELIABILITY_WINDOW_MS } from './adaptiveGovernanceTypes';

interface ObservationEntry {
  readonly recorded_at: number;
  readonly verdict_recommendation: string;
  readonly consensus_recommendation: string;
  readonly verdict_confidence: number;
  readonly was_arbitration_escalated: boolean;
}

interface RoleObservations {
  observations: ObservationEntry[];
  /** Bookkeeping signals from outside arbitration (rollback prevented? stabilization succeeded?). */
  rollback_prevented: number;
  rollback_missed: number;
  stabilization_success: number;
  stabilization_failure: number;
}

const projectStates = new Map<string, Map<ValidatorRole, RoleObservations>>();

function getProjectMap(project_id: string): Map<ValidatorRole, RoleObservations> {
  let m = projectStates.get(project_id);
  if (!m) {
    m = new Map();
    for (const role of VALIDATOR_ROLES) {
      m.set(role, { observations: [], rollback_prevented: 0, rollback_missed: 0, stabilization_success: 0, stabilization_failure: 0 });
    }
    projectStates.set(project_id, m);
  }
  return m;
}

/**
 * Observe an arbitration outcome. For each validator's verdict we
 * record whether it agreed with the eventual consensus.
 */
export function observeArbitration(project_id: string, result: ValidationArbitrationResult): void {
  const map = getProjectMap(project_id);
  const now = Date.now();
  for (const v of result.verdicts) {
    const role = map.get(v.validator_type);
    if (!role) continue;
    role.observations.push({
      recorded_at: now,
      verdict_recommendation: v.recommendation,
      consensus_recommendation: result.consensus_recommendation,
      verdict_confidence: v.confidence,
      was_arbitration_escalated: result.escalation_required,
    });
    pruneOld(role);
  }
}

/** Note that a validator's flagged-reject prevented an actual rollback. */
export function noteRollbackPrevented(project_id: string, role: ValidatorRole): void {
  const r = getProjectMap(project_id).get(role);
  if (r) r.rollback_prevented++;
}

/** Note that a validator's apply recommendation led to a rollback. */
export function noteRollbackMissed(project_id: string, role: ValidatorRole): void {
  const r = getProjectMap(project_id).get(role);
  if (r) r.rollback_missed++;
}

export function noteStabilizationSuccess(project_id: string, role: ValidatorRole): void {
  const r = getProjectMap(project_id).get(role);
  if (r) r.stabilization_success++;
}

export function noteStabilizationFailure(project_id: string, role: ValidatorRole): void {
  const r = getProjectMap(project_id).get(role);
  if (r) r.stabilization_failure++;
}

export function readReliabilityProfile(project_id: string): ValidatorReliabilityProfile {
  const map = getProjectMap(project_id);
  const now = Date.now();
  const windowStart = now - RELIABILITY_WINDOW_MS;
  const metrics_by_role = {} as Record<ValidatorRole, ValidatorReliabilityMetrics>;
  for (const role of VALIDATOR_ROLES) {
    const r = map.get(role)!;
    pruneOld(r);
    metrics_by_role[role] = computeMetrics(role, r, windowStart, now);
  }
  return {
    project_id,
    metrics_by_role,
    built_at: new Date(now).toISOString(),
  };
}

/** Per-role metrics for the adaptive engine + drift detector. */
export function readRoleMetrics(project_id: string, role: ValidatorRole): ValidatorReliabilityMetrics {
  const r = getProjectMap(project_id).get(role)!;
  const now = Date.now();
  const windowStart = now - RELIABILITY_WINDOW_MS;
  pruneOld(r);
  return computeMetrics(role, r, windowStart, now);
}

function computeMetrics(role: ValidatorRole, r: RoleObservations, windowStart: number, now: number): ValidatorReliabilityMetrics {
  const obs = r.observations;
  const n = obs.length;

  // Rollback prevention + stabilization counters are tracked independently
  // of arbitration observations, so compute them outside the cold-start
  // short-circuit. (A validator can have 0 arbitration observations but
  // still have rollback prevention signals.)
  const rollback_total = r.rollback_prevented + r.rollback_missed;
  const rollback_prevention_rate = rollback_total === 0 ? 100 : Math.round((r.rollback_prevented / rollback_total) * 100);
  const stabilization_total = r.stabilization_success + r.stabilization_failure;
  const stabilization_success_rate = stabilization_total === 0 ? 100 : Math.round((r.stabilization_success / stabilization_total) * 100);

  if (n === 0) {
    return {
      validator_role: role,
      observations: 0,
      accuracy: 100,                          // cold-start: no arbitration data → no penalty
      false_positive_rate: 0,
      false_negative_rate: 0,
      rollback_prevention_rate,                // honest: real counter, not 100
      arbitration_agreement_quality: 100,
      stabilization_success_rate,              // honest: real counter, not 100
      window_start: new Date(windowStart).toISOString(),
      window_end: new Date(now).toISOString(),
    };
  }
  const agreements = obs.filter(o => o.verdict_recommendation === o.consensus_recommendation).length;
  const accuracy = Math.round((agreements / n) * 100);
  // false_positive: validator said reject/contain/rollback but consensus was apply/monitor
  const fp = obs.filter(o => isStrict(o.verdict_recommendation) && isLenient(o.consensus_recommendation)).length;
  const fn = obs.filter(o => isLenient(o.verdict_recommendation) && isStrict(o.consensus_recommendation)).length;
  const escalated = obs.filter(o => o.was_arbitration_escalated).length;
  const arbitration_agreement_quality = Math.max(0, Math.min(100, Math.round(((agreements - escalated) / n) * 100 + 50)));
  return {
    validator_role: role,
    observations: n,
    accuracy,
    false_positive_rate: Math.round((fp / n) * 100),
    false_negative_rate: Math.round((fn / n) * 100),
    rollback_prevention_rate,
    arbitration_agreement_quality,
    stabilization_success_rate,
    window_start: new Date(windowStart).toISOString(),
    window_end: new Date(now).toISOString(),
  };
}

function isStrict(rec: string): boolean {
  return rec === 'reject' || rec === 'rollback' || rec === 'contain';
}
function isLenient(rec: string): boolean {
  return rec === 'apply' || rec === 'monitor';
}

function pruneOld(r: RoleObservations): void {
  const cutoff = Date.now() - RELIABILITY_WINDOW_MS;
  while (r.observations.length > 0 && r.observations[0].recorded_at < cutoff) {
    r.observations.shift();
  }
}

export function _resetReliabilityTracker(): void {
  projectStates.clear();
}

export const _RELIABILITY_WINDOW_MS_FOR_TESTS = RELIABILITY_WINDOW_MS;

/** Test helper — observe a single verdict directly without full arbitration. */
export function _testRecordObservation(
  project_id: string,
  verdict: ValidatorVerdict,
  consensus: string,
  escalated = false,
): void {
  const map = getProjectMap(project_id);
  const r = map.get(verdict.validator_type);
  if (!r) return;
  r.observations.push({
    recorded_at: Date.now(),
    verdict_recommendation: verdict.recommendation,
    consensus_recommendation: consensus,
    verdict_confidence: verdict.confidence,
    was_arbitration_escalated: escalated,
  });
}
