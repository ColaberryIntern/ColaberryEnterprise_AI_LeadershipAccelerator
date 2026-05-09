/**
 * anomalyAwareForecastEngine — Phase 19. Heuristic z-score + rolling-
 * window stddev anomaly detection over Phase 17 forecast signals.
 *
 * Architectural commitment (per the Phase 19 stress-test):
 *   - Pure heuristic. NO ML. NO probabilistic models. NO predictive
 *     simulation engines.
 *   - Detects: volatility spikes, contradiction spikes, routing
 *     instability, governance fragmentation, forecast divergence.
 *   - Outputs `ForecastAnomalyProfile` with explicit z-score per entry
 *     so operators can trust why something was flagged.
 */

import type {
  ForecastAnomalyProfile, ForecastAnomalyEntry, ForecastAnomalyKind,
} from './federationTypes';
import {
  ANOMALY_Z_SCORE_THRESHOLD, ANOMALY_MIN_OBSERVATIONS,
  MAX_ANOMALY_OBSERVATIONS_PER_SIGNAL,
} from './federationTypes';

interface SignalState {
  observations: number[];
  recorded_at: number[];
}

interface ProjectAnomalyState {
  per_kind: Map<ForecastAnomalyKind, SignalState>;
}

const projectStates = new Map<string, ProjectAnomalyState>();

const ANOMALY_KINDS: ReadonlyArray<ForecastAnomalyKind> = [
  'volatility_spike',
  'contradiction_spike',
  'routing_instability',
  'governance_fragmentation',
  'forecast_divergence',
];

function getProjectState(project_id: string): ProjectAnomalyState {
  let s = projectStates.get(project_id);
  if (!s) {
    const m = new Map<ForecastAnomalyKind, SignalState>();
    for (const k of ANOMALY_KINDS) m.set(k, { observations: [], recorded_at: [] });
    s = { per_kind: m };
    projectStates.set(project_id, s);
  }
  return s;
}

export function recordAnomalyObservation(project_id: string, kind: ForecastAnomalyKind, value: number): void {
  const state = getProjectState(project_id);
  const sig = state.per_kind.get(kind)!;
  sig.observations.push(value);
  sig.recorded_at.push(Date.now());
  if (sig.observations.length > MAX_ANOMALY_OBSERVATIONS_PER_SIGNAL) {
    sig.observations.shift();
    sig.recorded_at.shift();
  }
}

export function buildForecastAnomalyProfile(project_id: string): ForecastAnomalyProfile {
  const state = getProjectState(project_id);
  const entries: ForecastAnomalyEntry[] = [];

  for (const kind of ANOMALY_KINDS) {
    const sig = state.per_kind.get(kind)!;
    const n = sig.observations.length;
    if (n < ANOMALY_MIN_OBSERVATIONS) continue;
    const stats = rollingStats(sig.observations);
    const observed = sig.observations[n - 1];
    const z = stats.stddev === 0 ? 0 : (observed - stats.mean) / stats.stddev;
    const is_anomalous = Math.abs(z) >= ANOMALY_Z_SCORE_THRESHOLD;
    if (!is_anomalous) continue;
    entries.push({
      kind,
      observed_value: observed,
      rolling_mean: Math.round(stats.mean * 100) / 100,
      rolling_stddev: Math.round(stats.stddev * 100) / 100,
      z_score: Math.round(z * 100) / 100,
      is_anomalous,
      observed_at: new Date(sig.recorded_at[n - 1]).toISOString(),
      explanation: explainAnomaly(kind, z, observed, stats),
    });
  }

  const active_anomalies = entries.length;
  // Anomaly pressure score: cumulative |z| across active anomalies, scaled.
  const pressureRaw = entries.reduce((s, e) => s + Math.abs(e.z_score), 0);
  const anomaly_pressure_score = Math.min(100, Math.round(pressureRaw * 15));

  return {
    project_id,
    entries,
    active_anomalies,
    anomaly_pressure_score,
    built_at: new Date().toISOString(),
  };
}

function rollingStats(values: ReadonlyArray<number>): { mean: number; stddev: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, stddev: Math.sqrt(variance) };
}

function explainAnomaly(kind: ForecastAnomalyKind, z: number, observed: number, stats: { mean: number; stddev: number }): string {
  const direction = z > 0 ? 'spike' : 'drop';
  return `${kind} ${direction}: observed ${observed.toFixed(2)} vs rolling mean ${stats.mean.toFixed(2)} (stddev ${stats.stddev.toFixed(2)}); z-score ${z.toFixed(2)}.`;
}

export function _resetAnomalyEngine(): void {
  projectStates.clear();
}

export const _ANOMALY_Z_SCORE_THRESHOLD_FOR_TESTS = ANOMALY_Z_SCORE_THRESHOLD;
export const _ANOMALY_MIN_OBSERVATIONS_FOR_TESTS = ANOMALY_MIN_OBSERVATIONS;
export const _MAX_ANOMALY_OBSERVATIONS_PER_SIGNAL_FOR_TESTS = MAX_ANOMALY_OBSERVATIONS_PER_SIGNAL;
