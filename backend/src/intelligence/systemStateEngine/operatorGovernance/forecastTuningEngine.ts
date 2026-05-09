/**
 * forecastTuningEngine — Phase 18. Empirical bound calibration for the
 * Phase 17 heuristic forecasts.
 *
 * Architectural commitment (per Phase 18 stress-test):
 *   - This is EMPIRICAL bound-widening, NOT ML retraining.
 *   - Behavior:
 *       - Compare actual outcome vs predicted [low, high] bounds.
 *       - Track within_bounds_rate per signal over the recent observations.
 *       - When repeatedly outside bounds → recommend `widen` action.
 *       - When repeatedly inside bounds with low error → recommend `tighten`.
 *       - Otherwise → `hold`.
 *   - The forecast engine still produces forecasts; the tuning engine
 *     augments them with a `bound_widen_factor` multiplier that the
 *     forecast caller can apply on next forecast generation.
 *   - Tuning is bounded + deterministic + replayable — no probabilistic
 *     simulation, no hidden adaptive layers, no self-learning.
 */

import type { ForecastSignal } from '../adaptiveGovernance/adaptiveGovernanceTypes';
import type {
  ForecastOutcomeObservation, ForecastCalibrationProfile,
} from './operatorGovernanceTypes';
import {
  FORECAST_TUNING_OBSERVATIONS_FLOOR,
  FORECAST_BOUNDS_WIDEN_FACTOR,
  FORECAST_BOUNDS_TIGHTEN_FACTOR,
} from './operatorGovernanceTypes';

const SIGNALS: ReadonlyArray<ForecastSignal> = [
  'rollback_rate_trend',
  'validator_divergence_trend',
  'trust_decay_trajectory',
  'contradiction_amplification_trend',
  'arbitration_instability_projection',
];

const MAX_OBSERVATIONS_PER_SIGNAL = 50;
const WIDEN_THRESHOLD_PCT = 40;     // <40% within-bounds → widen
const TIGHTEN_THRESHOLD_PCT = 90;   // ≥90% within-bounds + low error → tighten
const TIGHTEN_MAX_MEAN_ERROR = 5;

interface SignalState {
  observations: ForecastOutcomeObservation[];
  bound_widen_factor: number;
}

interface ProjectTuningState {
  per_signal: Map<ForecastSignal, SignalState>;
}

const projectStates = new Map<string, ProjectTuningState>();

function getProjectState(project_id: string): ProjectTuningState {
  let s = projectStates.get(project_id);
  if (!s) {
    const m = new Map<ForecastSignal, SignalState>();
    for (const sig of SIGNALS) {
      m.set(sig, { observations: [], bound_widen_factor: 1.0 });
    }
    s = { per_signal: m };
    projectStates.set(project_id, s);
  }
  return s;
}

/**
 * Record a single forecast outcome observation. Caller is responsible
 * for computing `within_bounds` (predicted_low ≤ actual ≤ predicted_high).
 */
export function recordForecastOutcome(project_id: string, observation: ForecastOutcomeObservation): void {
  const state = getProjectState(project_id);
  const sigState = state.per_signal.get(observation.signal)!;
  sigState.observations.push(observation);
  if (sigState.observations.length > MAX_OBSERVATIONS_PER_SIGNAL) {
    sigState.observations.shift();
  }
  // Update bound_widen_factor based on current state.
  sigState.bound_widen_factor = computeWidenFactor(sigState);
}

export function buildForecastCalibrationProfile(project_id: string): ForecastCalibrationProfile {
  const state = getProjectState(project_id);
  const per_signal = {} as Record<ForecastSignal, ForecastCalibrationProfile['per_signal'][ForecastSignal]>;
  for (const signal of SIGNALS) {
    const sigState = state.per_signal.get(signal)!;
    const obs = sigState.observations;
    const n = obs.length;
    if (n < FORECAST_TUNING_OBSERVATIONS_FLOOR) {
      per_signal[signal] = {
        observations: n,
        within_bounds_rate: 100,             // cold-start
        mean_abs_error: 0,
        bound_widen_factor: sigState.bound_widen_factor,
        recommended_action: 'hold',
        notes: ['insufficient_observations'],
      };
      continue;
    }
    const inBounds = obs.filter(o => o.within_bounds).length;
    const within_bounds_rate = Math.round((inBounds / n) * 100);
    const mean_abs_error = Math.round(obs.reduce((s, o) => s + Math.abs(o.actual_value - o.predicted_value), 0) / n * 100) / 100;
    const action = recommendAction(within_bounds_rate, mean_abs_error);
    const notes: string[] = [`${inBounds}/${n} within bounds`];
    if (mean_abs_error > 0) notes.push(`mean abs error ${mean_abs_error}`);
    if (action === 'widen') notes.push('bounds will widen on next forecast call');
    if (action === 'tighten') notes.push('bounds will tighten on next forecast call');
    per_signal[signal] = {
      observations: n,
      within_bounds_rate,
      mean_abs_error,
      bound_widen_factor: sigState.bound_widen_factor,
      recommended_action: action,
      notes,
    };
  }
  return {
    project_id,
    per_signal,
    built_at: new Date().toISOString(),
  };
}

function computeWidenFactor(sigState: SignalState): number {
  const obs = sigState.observations;
  if (obs.length < FORECAST_TUNING_OBSERVATIONS_FLOOR) return sigState.bound_widen_factor;
  const inBounds = obs.filter(o => o.within_bounds).length;
  const rate = (inBounds / obs.length) * 100;
  const mean_abs_error = obs.reduce((s, o) => s + Math.abs(o.actual_value - o.predicted_value), 0) / obs.length;
  if (rate < WIDEN_THRESHOLD_PCT) {
    // Widen, but bounded — never beyond 4x.
    return Math.min(4.0, sigState.bound_widen_factor * FORECAST_BOUNDS_WIDEN_FACTOR);
  }
  if (rate >= TIGHTEN_THRESHOLD_PCT && mean_abs_error <= TIGHTEN_MAX_MEAN_ERROR) {
    // Tighten, but bounded — never below 0.5x.
    return Math.max(0.5, sigState.bound_widen_factor * FORECAST_BOUNDS_TIGHTEN_FACTOR);
  }
  return sigState.bound_widen_factor;
}

function recommendAction(within_bounds_rate: number, mean_abs_error: number): 'widen' | 'tighten' | 'hold' {
  if (within_bounds_rate < WIDEN_THRESHOLD_PCT) return 'widen';
  if (within_bounds_rate >= TIGHTEN_THRESHOLD_PCT && mean_abs_error <= TIGHTEN_MAX_MEAN_ERROR) return 'tighten';
  return 'hold';
}

/** Read the current widen factor for a single signal — used by callers
 *  who want to apply the multiplier when generating a fresh forecast. */
export function readBoundWidenFactor(project_id: string, signal: ForecastSignal): number {
  return getProjectState(project_id).per_signal.get(signal)?.bound_widen_factor ?? 1.0;
}

export function _resetForecastTuning(): void {
  projectStates.clear();
}

export const _WIDEN_THRESHOLD_PCT_FOR_TESTS = WIDEN_THRESHOLD_PCT;
export const _TIGHTEN_THRESHOLD_PCT_FOR_TESTS = TIGHTEN_THRESHOLD_PCT;
export const _MAX_OBSERVATIONS_PER_SIGNAL_FOR_TESTS = MAX_OBSERVATIONS_PER_SIGNAL;
