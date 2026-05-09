/**
 * adaptiveGovernanceSummaryCounters — Phase 17 in-memory rolling
 * counters used by the engine state's `adaptive_governance_summary`
 * block. Strictly sync, no DB reads.
 *
 * Counters reset on process restart; GovernanceAuditEntry rows of
 * the new Phase 17 audit kinds remain authoritative for history.
 */

import type { ValidatorStabilityTier, AdaptiveGovernanceSummarySnapshot } from './adaptiveGovernanceTypes';

interface ProjectAdaptiveCounters {
  drifting_validators: number;
  suppressed_validators: number;
  active_forecasts: number;
  active_recovery_chains: number;
  ancestry_rollbacks_recommended: number;
  worst_validator_tier: ValidatorStabilityTier;
  last_event_at: number;
}

const states = new Map<string, ProjectAdaptiveCounters>();

function getOrInit(project_id: string): ProjectAdaptiveCounters {
  let s = states.get(project_id);
  if (!s) {
    s = {
      drifting_validators: 0,
      suppressed_validators: 0,
      active_forecasts: 0,
      active_recovery_chains: 0,
      ancestry_rollbacks_recommended: 0,
      worst_validator_tier: 'stable',
      last_event_at: Date.now(),
    };
    states.set(project_id, s);
  }
  return s;
}

export function noteValidatorDrift(project_id: string, tier: ValidatorStabilityTier): void {
  const s = getOrInit(project_id);
  if (tier === 'drifting' || tier === 'unstable') s.drifting_validators++;
  if (tier === 'suppressed') s.suppressed_validators++;
  if (tierRank(tier) > tierRank(s.worst_validator_tier)) s.worst_validator_tier = tier;
  s.last_event_at = Date.now();
}

export function noteForecastGenerated(project_id: string): void {
  const s = getOrInit(project_id);
  s.active_forecasts++;
  s.last_event_at = Date.now();
}

export function noteRecoveryChainGenerated(project_id: string): void {
  const s = getOrInit(project_id);
  s.active_recovery_chains++;
  s.last_event_at = Date.now();
}

export function noteAncestryRollbackRecommended(project_id: string): void {
  const s = getOrInit(project_id);
  s.ancestry_rollbacks_recommended++;
  s.last_event_at = Date.now();
}

export function readAdaptiveGovernanceSummary(project_id: string): AdaptiveGovernanceSummarySnapshot {
  const s = getOrInit(project_id);
  return {
    drifting_validators: s.drifting_validators,
    suppressed_validators: s.suppressed_validators,
    active_forecasts: s.active_forecasts,
    active_recovery_chains: s.active_recovery_chains,
    ancestry_rollbacks_recommended: s.ancestry_rollbacks_recommended,
    worst_validator_tier: s.worst_validator_tier,
  };
}

export function _resetAdaptiveGovernanceSummary(): void {
  states.clear();
}

function tierRank(t: ValidatorStabilityTier): number {
  switch (t) {
    case 'stable': return 0;
    case 'cautionary': return 1;
    case 'drifting': return 2;
    case 'unstable': return 3;
    case 'suppressed': return 4;
  }
}
