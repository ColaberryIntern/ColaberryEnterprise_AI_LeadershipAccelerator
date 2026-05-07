/**
 * adaptivePriorityTrainer — incrementally adjusts the engine's priority
 * weights based on observed remediation outcomes.
 *
 * Strategy: exponentially-weighted moving average. Each successful
 * outcome nudges the relevant weight upward; each failure nudges it
 * downward. Weights are bounded to a safe range; absolute changes
 * per-tick are capped to prevent thrashing.
 *
 * This is statistical learning, not deep learning — fast, deterministic,
 * fully explainable, and safe to roll back. Phase 11 can swap in a
 * trained model behind the same `proposeWeightAdjustments` interface.
 *
 * Phase 10 §4, §9.
 */

export interface PriorityWeights {
  readonly priority: number;
  readonly blocking: number;
  readonly maturity_gain: number;
  readonly readiness_gain: number;
  readonly dependency: number;
  readonly confidence: number;
  readonly execution_cost_penalty: number;
}

export const BASELINE_WEIGHTS: PriorityWeights = Object.freeze({
  priority: 0.30,
  blocking: 0.25,
  maturity_gain: 0.15,
  readiness_gain: 0.15,
  dependency: 0.10,
  confidence: 0.05,
  execution_cost_penalty: 0.20,
});

export interface OutcomeBucket {
  readonly attempts: number;
  readonly resolved: number;
  readonly avg_pressure_delta: number;     // negative = better
  readonly avg_cognition_delta: number;     // positive = better
}

export interface WeightAdjustmentProposal {
  readonly proposed: PriorityWeights;
  readonly deltas: Readonly<Record<keyof PriorityWeights, number>>;
  readonly reasons: ReadonlyArray<string>;
  /** Confidence the proposal will improve outcomes (0-100). */
  readonly confidence: number;
  /** True when the proposal was clamped by the safety guardrails. */
  readonly clamped: boolean;
}

const MAX_DELTA_PER_TICK = 0.03;       // per-weight cap so policy doesn't lurch
const MIN_WEIGHT = 0.01;
const MAX_WEIGHT = 0.5;
const MIN_ATTEMPTS_FOR_LEARNING = 5;

export function proposeWeightAdjustments(
  current: PriorityWeights,
  perTaskTypeOutcomes: Readonly<Record<string, OutcomeBucket>>,
  opts: { learning_rate?: number; max_delta_per_tick?: number } = {},
): WeightAdjustmentProposal {
  const lr = Math.max(0.01, Math.min(0.5, opts.learning_rate ?? 0.1));
  const cap = Math.max(0.005, Math.min(0.1, opts.max_delta_per_tick ?? MAX_DELTA_PER_TICK));

  const reasons: string[] = [];
  let clamped = false;

  // Compute success-rate signals across task types
  let totalAttempts = 0;
  let totalResolved = 0;
  let avgPressureDelta = 0;
  let bucketCount = 0;
  for (const bucket of Object.values(perTaskTypeOutcomes)) {
    totalAttempts += bucket.attempts;
    totalResolved += bucket.resolved;
    avgPressureDelta += bucket.avg_pressure_delta;
    bucketCount++;
  }
  if (totalAttempts < MIN_ATTEMPTS_FOR_LEARNING) {
    reasons.push(`Only ${totalAttempts} outcomes — below min-attempts (${MIN_ATTEMPTS_FOR_LEARNING}); no adjustment.`);
    return {
      proposed: current,
      deltas: zeroDeltas(),
      reasons,
      confidence: 30,
      clamped: false,
    };
  }
  const successRate = totalResolved / totalAttempts;
  const meanPressureDelta = bucketCount > 0 ? avgPressureDelta / bucketCount : 0;

  // Heuristic learning rules:
  //   - Low success rate AND pressure rising → increase blocking weight
  //   - High success rate → trust the current mix more (small reinforce)
  //   - Pressure dropping → increase priority weight (current order works)
  //   - Pressure rising despite remediations → increase blocking + maturity weights
  const deltas: Record<keyof PriorityWeights, number> = zeroDeltas();

  if (successRate < 0.4 && meanPressureDelta > 0) {
    deltas.blocking = +lr;
    deltas.maturity_gain = +lr / 2;
    deltas.execution_cost_penalty = -lr / 2;
    reasons.push(`Success rate ${(successRate * 100).toFixed(0)}% with pressure rising — boost blocking + maturity weights, reduce cost penalty.`);
  } else if (successRate >= 0.7) {
    deltas.priority = +lr / 3;
    reasons.push(`Success rate ${(successRate * 100).toFixed(0)}% — slight reinforcement of priority weight.`);
  }

  if (meanPressureDelta < -5) {
    deltas.priority = (deltas.priority || 0) + lr / 3;
    reasons.push(`Pressure dropping by ${meanPressureDelta.toFixed(1)} per remediation — current ordering works; reinforce priority.`);
  } else if (meanPressureDelta > 5) {
    deltas.blocking = (deltas.blocking || 0) + lr / 2;
    reasons.push(`Pressure rising by ${meanPressureDelta.toFixed(1)} — boost blocking signal.`);
  }

  // Cap each delta at ± MAX_DELTA_PER_TICK
  for (const k of Object.keys(deltas) as Array<keyof PriorityWeights>) {
    if (Math.abs(deltas[k]) > cap) {
      clamped = true;
      deltas[k] = Math.sign(deltas[k]) * cap;
    }
  }

  // Apply deltas + clamp final weights
  const proposed: PriorityWeights = {
    priority: clampWeight(current.priority + deltas.priority),
    blocking: clampWeight(current.blocking + deltas.blocking),
    maturity_gain: clampWeight(current.maturity_gain + deltas.maturity_gain),
    readiness_gain: clampWeight(current.readiness_gain + deltas.readiness_gain),
    dependency: clampWeight(current.dependency + deltas.dependency),
    confidence: clampWeight(current.confidence + deltas.confidence),
    execution_cost_penalty: clampWeight(current.execution_cost_penalty + deltas.execution_cost_penalty),
  };

  // Confidence: more attempts → higher confidence, capped 90.
  const confidence = Math.min(90, 30 + Math.min(40, Math.round(totalAttempts * 2)) +
    (Math.abs(successRate - 0.5) * 30));

  return {
    proposed,
    deltas: Object.freeze(deltas),
    reasons,
    confidence: Math.round(confidence),
    clamped,
  };
}

function zeroDeltas(): Record<keyof PriorityWeights, number> {
  return {
    priority: 0,
    blocking: 0,
    maturity_gain: 0,
    readiness_gain: 0,
    dependency: 0,
    confidence: 0,
    execution_cost_penalty: 0,
  };
}

function clampWeight(w: number): number {
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Math.round(w * 1000) / 1000));
}
