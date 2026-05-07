/**
 * adaptivePriorityWeighting — dynamically alter authoritative-task priority
 * based on real behavioral evidence + multimodal regressions.
 *
 * The engine produces a queue with calculated_rank values. This module
 * applies multipliers/offsets to those ranks before the engine returns
 * the queue. Behavioral signals shift visual tasks earlier; calm metrics
 * leave them alone.
 *
 * Pure: takes the queue + behavioral context, returns a re-ranked queue.
 *
 * Phase 7 §6 — THE adaptive orchestration weighting.
 */
import type { AuthoritativeTask } from '../types/systemState.types';

export interface BehavioralPressureInputs {
  /** Project-wide friction pressure (Phase 6). 0-100. */
  readonly friction_pressure?: number;
  /** Number of routes with rage_clicks > 0. */
  readonly rage_routes?: number;
  /** Number of routes with nav_loops > 0. */
  readonly loop_routes?: number;
  /** Number of routes with form_abandons > 0. */
  readonly abandon_routes?: number;
  /** Worst cognition score from any route's vision report. 0-100. */
  readonly worst_cognition_score?: number;
  /** Whether a UX regression has been detected on any route. */
  readonly has_recent_regression?: boolean;
  /** Number of unresolved high-severity contradictions. */
  readonly unresolved_high_contradictions?: number;
}

export interface RankAdjustment {
  readonly task_id: string;
  readonly previous_rank: number;
  readonly adjusted_rank: number;
  readonly delta: number;
  readonly reasons: ReadonlyArray<string>;
}

export interface AdaptiveResult {
  readonly tasks: ReadonlyArray<AuthoritativeTask>;
  readonly adjustments: ReadonlyArray<RankAdjustment>;
  readonly applied_weight_factor: number;
}

/**
 * Compute the global weight factor based on behavioral + visual evidence.
 *   1.0 = no shift (calm project)
 *   <1.0 = boost visual priority (negative ranks become more negative; visual tasks earlier)
 *   <0.5 = severe escalation
 */
export function computeWeightFactor(input: BehavioralPressureInputs): number {
  let factor = 1.0;
  const friction = input.friction_pressure ?? 0;
  if (friction >= 60) factor *= 0.55;
  else if (friction >= 40) factor *= 0.7;
  else if (friction >= 20) factor *= 0.85;

  const worst = input.worst_cognition_score ?? 100;
  if (worst < 40) factor *= 0.7;
  else if (worst < 60) factor *= 0.85;

  if (input.has_recent_regression) factor *= 0.8;
  if ((input.unresolved_high_contradictions ?? 0) >= 3) factor *= 0.75;

  if ((input.rage_routes ?? 0) >= 3) factor *= 0.85;
  if ((input.loop_routes ?? 0) >= 2) factor *= 0.9;
  if ((input.abandon_routes ?? 0) >= 3) factor *= 0.85;

  // Floor: factor never goes below 0.4 — adaptive weighting bounded so other
  // queue concerns aren't completely drowned out.
  return Math.max(0.4, factor);
}

/**
 * Apply the computed factor to a queue. Visual / UX tasks (`type === 'ui_review'`)
 * get the full multiplier; other task types get a much milder shift (1 + (factor-1)*0.3).
 *
 * The factor multiplies `calculated_rank`. Since lower rank = earlier and
 * the engine produces NEGATIVE composite ranks, multiplying by a factor <1
 * pulls visual ranks closer to zero, but applies _more strongly_ to the
 * visual ranks because they were already negative — the effect is to push
 * visual ranks to the front when factor < 1.
 *
 * Concretely: rank = -50 (early). factor 0.5. visual: rank * 0.5 = -25 (later).
 * That's wrong for our intent — we want visual to be pulled EARLIER. So
 * instead we ADD an offset proportional to (1 - factor) * boost magnitude.
 */
export function applyAdaptiveWeighting(
  tasks: ReadonlyArray<AuthoritativeTask>,
  pressureInputs: BehavioralPressureInputs,
): AdaptiveResult {
  const factor = computeWeightFactor(pressureInputs);
  if (factor === 1.0 || tasks.length === 0) {
    return { tasks, adjustments: [], applied_weight_factor: factor };
  }

  // (1 - factor) is in [0, 0.6]. Multiply by 30 → up to 18-point rank boost.
  const visualBoost = (1 - factor) * 30;
  const otherBoost = visualBoost * 0.3;

  const adjustments: RankAdjustment[] = [];
  const newTasks = tasks.map((t): AuthoritativeTask => {
    const isVisual = t.type === 'ui_review';
    const boost = isVisual ? visualBoost : otherBoost;
    if (boost <= 0.5) return t;     // not enough movement to bother

    const reasons: string[] = [];
    if (isVisual) reasons.push(`Visual task: priority elevated ${Math.round(boost * 10) / 10} points (factor ${factor.toFixed(2)}).`);
    else reasons.push(`Behavioral pressure also lifts non-visual tasks slightly (factor ${factor.toFixed(2)}).`);

    if ((pressureInputs.friction_pressure ?? 0) >= 40) reasons.push(`Friction pressure ${pressureInputs.friction_pressure} drove the boost.`);
    if (pressureInputs.has_recent_regression) reasons.push('Recent UX regression escalated all visual priorities.');
    if ((pressureInputs.rage_routes ?? 0) >= 3) reasons.push('Multiple routes show rage_clicks.');

    const adjustedRank = t.calculated_rank - boost;
    adjustments.push({
      task_id: t.id,
      previous_rank: t.calculated_rank,
      adjusted_rank: adjustedRank,
      delta: -boost,
      reasons,
    });
    return Object.freeze({ ...t, calculated_rank: adjustedRank });
  });

  // Re-sort by the adjusted ranks (lower = earlier).
  newTasks.sort((a, b) => a.calculated_rank - b.calculated_rank);

  return {
    tasks: newTasks,
    adjustments,
    applied_weight_factor: factor,
  };
}
