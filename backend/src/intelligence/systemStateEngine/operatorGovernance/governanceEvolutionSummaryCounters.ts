/**
 * governanceEvolutionSummaryCounters — Phase 18 in-memory rolling
 * counters used by the engine state's `governance_evolution_summary`
 * block. Strictly sync, no DB reads.
 *
 * Counters reset on process restart; GovernanceAuditEntry rows of the
 * Phase 18 audit kinds remain authoritative for history.
 */

import type {
  RoutingStabilityTier, GovernanceEvolutionSummarySnapshot, GovernanceHealthScores,
} from './operatorGovernanceTypes';
import type { ForecastSignal } from '../adaptiveGovernance/adaptiveGovernanceTypes';

interface ProjectCounters {
  pending_calibration_proposals: number;
  approved_calibrations_24h: number;
  rejected_calibrations_24h: number;
  active_recovery_sessions: number;
  forecast_signals_widened: Set<ForecastSignal>;
  routing_stability: RoutingStabilityTier;
  // Health-score input counters (raw signals; final scores computed on read)
  recent_calibration_decisions: number;
  recent_calibration_overrides: number;
  recent_routing_shifts: number;
  recent_recovery_outcomes_success: number;
  recent_recovery_outcomes_total: number;
  recent_forecasts_within_bounds: number;
  recent_forecasts_total: number;
  recent_attribution_entries: number;
  last_event_at: number;
}

const states = new Map<string, ProjectCounters>();

function getOrInit(project_id: string): ProjectCounters {
  let s = states.get(project_id);
  if (!s) {
    s = {
      pending_calibration_proposals: 0,
      approved_calibrations_24h: 0,
      rejected_calibrations_24h: 0,
      active_recovery_sessions: 0,
      forecast_signals_widened: new Set(),
      routing_stability: 'stable',
      recent_calibration_decisions: 0,
      recent_calibration_overrides: 0,
      recent_routing_shifts: 0,
      recent_recovery_outcomes_success: 0,
      recent_recovery_outcomes_total: 0,
      recent_forecasts_within_bounds: 0,
      recent_forecasts_total: 0,
      recent_attribution_entries: 0,
      last_event_at: Date.now(),
    };
    states.set(project_id, s);
  }
  return s;
}

export function noteCalibrationProposed(project_id: string): void {
  const s = getOrInit(project_id);
  s.pending_calibration_proposals++;
  s.last_event_at = Date.now();
}

export function noteCalibrationApproved(project_id: string): void {
  const s = getOrInit(project_id);
  s.approved_calibrations_24h++;
  s.recent_calibration_decisions++;
  s.pending_calibration_proposals = Math.max(0, s.pending_calibration_proposals - 1);
  s.last_event_at = Date.now();
}

export function noteCalibrationRejected(project_id: string): void {
  const s = getOrInit(project_id);
  s.rejected_calibrations_24h++;
  s.recent_calibration_decisions++;
  s.recent_calibration_overrides++;
  s.pending_calibration_proposals = Math.max(0, s.pending_calibration_proposals - 1);
  s.last_event_at = Date.now();
}

export function noteRecoverySessionCreated(project_id: string): void {
  const s = getOrInit(project_id);
  s.active_recovery_sessions++;
  s.last_event_at = Date.now();
}

export function noteRecoverySessionFinished(project_id: string, succeeded: boolean): void {
  const s = getOrInit(project_id);
  s.active_recovery_sessions = Math.max(0, s.active_recovery_sessions - 1);
  s.recent_recovery_outcomes_total++;
  if (succeeded) s.recent_recovery_outcomes_success++;
  s.last_event_at = Date.now();
}

export function noteForecastSignalWidened(project_id: string, signal: ForecastSignal): void {
  const s = getOrInit(project_id);
  s.forecast_signals_widened.add(signal);
  s.last_event_at = Date.now();
}

export function noteForecastObservation(project_id: string, within_bounds: boolean): void {
  const s = getOrInit(project_id);
  s.recent_forecasts_total++;
  if (within_bounds) s.recent_forecasts_within_bounds++;
  s.last_event_at = Date.now();
}

export function noteRoutingShift(project_id: string, tier: RoutingStabilityTier): void {
  const s = getOrInit(project_id);
  s.routing_stability = tier;
  s.recent_routing_shifts++;
  s.last_event_at = Date.now();
}

export function noteAttributionEntry(project_id: string): void {
  const s = getOrInit(project_id);
  s.recent_attribution_entries++;
  s.last_event_at = Date.now();
}

export function readGovernanceEvolutionSummary(project_id: string): GovernanceEvolutionSummarySnapshot {
  const s = getOrInit(project_id);
  return {
    pending_calibration_proposals: s.pending_calibration_proposals,
    approved_calibrations_24h: s.approved_calibrations_24h,
    rejected_calibrations_24h: s.rejected_calibrations_24h,
    active_recovery_sessions: s.active_recovery_sessions,
    forecast_signals_widened: s.forecast_signals_widened.size,
    routing_stability: s.routing_stability,
    health_scores: computeHealthScores(s),
  };
}

function computeHealthScores(s: ProjectCounters): GovernanceHealthScores {
  // Calibration stability: ratio of approved vs total decisions (less
  // override volume means more stable governance).
  const calibration_stability = s.recent_calibration_decisions === 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(100 - (s.recent_calibration_overrides / s.recent_calibration_decisions) * 100)));

  // Routing stability: from current tier.
  const routing_stability =
    s.routing_stability === 'stable' ? 100 :
    s.routing_stability === 'adaptive' ? 80 :
    s.routing_stability === 'overridden' ? 60 :
    s.routing_stability === 'volatile' ? 30 :
    s.routing_stability === 'suppressed' ? 50 : 70;

  // Recovery optimization: success rate of recent outcomes.
  const recovery_optimization = s.recent_recovery_outcomes_total === 0
    ? 100
    : Math.round((s.recent_recovery_outcomes_success / s.recent_recovery_outcomes_total) * 100);

  // Forecast reliability: within-bounds rate.
  const forecast_reliability = s.recent_forecasts_total === 0
    ? 100
    : Math.round((s.recent_forecasts_within_bounds / s.recent_forecasts_total) * 100);

  // Governance transparency: ratio of attribution entries vs decisions
  // (more attribution = more transparent).
  const denominator = Math.max(1, s.recent_calibration_decisions);
  const governance_transparency = Math.max(0, Math.min(100, Math.round((s.recent_attribution_entries / denominator) * 100)));

  return {
    calibration_stability,
    routing_stability,
    recovery_optimization,
    forecast_reliability,
    governance_transparency,
  };
}

export function _resetGovernanceEvolutionSummary(): void {
  states.clear();
}
