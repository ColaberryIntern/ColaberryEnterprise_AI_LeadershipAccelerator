/**
 * orchestrationSimulationEngine — pure simulator that lets operators ask
 * "what would happen if we ran the queue in this order?" without
 * affecting production.
 *
 * V1 simulates pressure evolution by applying a simple per-task pressure-
 * delta heuristic derived from task type. Phase 11 can swap with a real
 * stochastic model once enough outcome history exists.
 *
 * Phase 10 §11.
 */

export interface SimulatedTask {
  readonly id: string;
  readonly type: string;
  readonly priority_score: number;
  readonly blocking_score: number;
  readonly execution_cost: number;
}

export interface SimulationInput {
  readonly initial_pressure: number;
  readonly initial_cognition: number;
  readonly tasks: ReadonlyArray<SimulatedTask>;
  /** Default per-task pressure deltas by type (negative = pressure reduced). */
  readonly type_pressure_delta?: Readonly<Record<string, number>>;
  /** Default per-task cognition deltas by type (positive = cognition improved). */
  readonly type_cognition_delta?: Readonly<Record<string, number>>;
}

const DEFAULT_PRESSURE_DELTA: Record<string, number> = {
  ui_review: -8,
  backend: -5,
  frontend: -4,
  database: -6,
  validation: -3,
  testing: -2,
  intelligence: -3,
  optimization: -2,
  foundation: -10,
};

const DEFAULT_COGNITION_DELTA: Record<string, number> = {
  ui_review: 6,
  frontend: 4,
  backend: 2,
  database: 1,
  validation: 1,
  testing: 1,
  intelligence: 2,
  optimization: 1,
  foundation: 5,
};

export interface SimulationStep {
  readonly position: number;
  readonly task_id: string;
  readonly task_type: string;
  readonly pressure_after: number;
  readonly cognition_after: number;
  readonly delta_pressure: number;
  readonly delta_cognition: number;
}

export interface SimulationOutcome {
  readonly final_pressure: number;
  readonly final_cognition: number;
  readonly net_pressure_drop: number;
  readonly net_cognition_gain: number;
  readonly steps: ReadonlyArray<SimulationStep>;
  readonly summary: string;
}

export function simulateQueue(input: SimulationInput): SimulationOutcome {
  const pressureMap = { ...DEFAULT_PRESSURE_DELTA, ...(input.type_pressure_delta ?? {}) };
  const cognitionMap = { ...DEFAULT_COGNITION_DELTA, ...(input.type_cognition_delta ?? {}) };

  let pressure = input.initial_pressure;
  let cognition = input.initial_cognition;
  const steps: SimulationStep[] = [];

  for (let i = 0; i < input.tasks.length; i++) {
    const t = input.tasks[i];
    // Higher blocking_score amplifies the pressure drop.
    const baseDelta = pressureMap[t.type] ?? -2;
    const amplification = 1 + Math.min(0.5, t.blocking_score / 200);
    const dPressure = Math.round(baseDelta * amplification);
    const dCognition = Math.round((cognitionMap[t.type] ?? 0) * amplification);
    pressure = clamp(pressure + dPressure);
    cognition = clamp(cognition + dCognition);
    steps.push({
      position: i,
      task_id: t.id,
      task_type: t.type,
      pressure_after: pressure,
      cognition_after: cognition,
      delta_pressure: dPressure,
      delta_cognition: dCognition,
    });
  }

  const summary = `Pressure ${input.initial_pressure} → ${pressure} (Δ${pressure - input.initial_pressure}). Cognition ${input.initial_cognition} → ${cognition} (Δ${cognition - input.initial_cognition}).`;

  return {
    final_pressure: pressure,
    final_cognition: cognition,
    net_pressure_drop: input.initial_pressure - pressure,
    net_cognition_gain: cognition - input.initial_cognition,
    steps,
    summary,
  };
}

/**
 * Compare two queue orderings and report which performs better.
 */
export interface ComparisonResult {
  readonly ordering_a: SimulationOutcome;
  readonly ordering_b: SimulationOutcome;
  readonly preferred: 'a' | 'b' | 'tie';
  readonly reason: string;
}

export function compareQueueOrderings(
  initialPressure: number,
  initialCognition: number,
  orderingA: ReadonlyArray<SimulatedTask>,
  orderingB: ReadonlyArray<SimulatedTask>,
): ComparisonResult {
  const a = simulateQueue({ initial_pressure: initialPressure, initial_cognition: initialCognition, tasks: orderingA });
  const b = simulateQueue({ initial_pressure: initialPressure, initial_cognition: initialCognition, tasks: orderingB });
  const aScore = a.net_pressure_drop * 0.7 + a.net_cognition_gain * 0.3;
  const bScore = b.net_pressure_drop * 0.7 + b.net_cognition_gain * 0.3;
  let preferred: ComparisonResult['preferred'];
  if (Math.abs(aScore - bScore) < 1) preferred = 'tie';
  else preferred = aScore > bScore ? 'a' : 'b';
  return {
    ordering_a: a,
    ordering_b: b,
    preferred,
    reason: `A score ${aScore.toFixed(1)} vs B score ${bScore.toFixed(1)} (70% pressure-drop + 30% cognition-gain weighting).`,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// ── Phase 12 — additive simulators ─────────────────────────────────────────

export interface RemediationPlanSimulationInput {
  readonly cluster_signature: string;
  readonly issue_count: number;
  readonly historical_success_rate: number;     // 0-100
  readonly initial_pressure: number;
  readonly initial_cognition: number;
}

/**
 * Phase 12 §E — simulate the projected pressure/cognition impact of
 * applying a PreparedRemediationPlan. Wraps simulateQueue with a single
 * synthetic 'ui_review' task whose pressure drop scales with the plan's
 * historical success rate (low-success plans contribute less pressure
 * relief).
 */
export function simulateRemediationPlan(input: RemediationPlanSimulationInput): SimulationOutcome {
  const successScale = Math.max(0.2, Math.min(1.0, input.historical_success_rate / 100));
  const pressureDelta = -8 * successScale * Math.min(1.5, 1 + input.issue_count * 0.05);
  const cognitionDelta = 6 * successScale;
  return simulateQueue({
    initial_pressure: input.initial_pressure,
    initial_cognition: input.initial_cognition,
    tasks: [{
      id: `plan-${input.cluster_signature}`,
      type: 'ui_review',
      priority_score: 70,
      blocking_score: 20,
      execution_cost: 30,
    }],
    type_pressure_delta: { ui_review: pressureDelta },
    type_cognition_delta: { ui_review: cognitionDelta },
  });
}

export interface ContradictionResolutionSimulationInput {
  readonly contradiction_severity: 'info' | 'warning' | 'error';
  readonly proposed_action: 'ignore' | 'remediate' | 'escalate';
  readonly initial_pressure: number;
  readonly initial_cognition: number;
}

/**
 * Phase 12 §E — simulate resolving a contradiction. ignore → no
 * deltas; remediate → moderate pressure drop scaled by severity;
 * escalate → small pressure drop + cognition lift (operator unblocks).
 */
export function simulateContradictionResolution(input: ContradictionResolutionSimulationInput): SimulationOutcome {
  const severityWeight = input.contradiction_severity === 'error' ? 1.5 : input.contradiction_severity === 'warning' ? 1.0 : 0.5;
  let pressureDelta = 0;
  let cognitionDelta = 0;
  if (input.proposed_action === 'remediate') {
    pressureDelta = -6 * severityWeight;
    cognitionDelta = 3 * severityWeight;
  } else if (input.proposed_action === 'escalate') {
    pressureDelta = -2 * severityWeight;
    cognitionDelta = 4 * severityWeight;
  }
  return simulateQueue({
    initial_pressure: input.initial_pressure,
    initial_cognition: input.initial_cognition,
    tasks: [{
      id: `contradiction-${input.proposed_action}`,
      type: 'validation',
      priority_score: 60,
      blocking_score: input.contradiction_severity === 'error' ? 50 : 20,
      execution_cost: 15,
    }],
    type_pressure_delta: { validation: pressureDelta },
    type_cognition_delta: { validation: cognitionDelta },
  });
}

export interface UXOutcomeSimulationInput {
  readonly cluster_type: string;
  readonly issue_count: number;
  readonly historical_success_rate: number;     // 0-100
  readonly before: { cognition: number; ux_debt: number; behavioral: number; friction: number };
}

export interface ProjectedDelta {
  readonly cognition_delta: number;
  readonly ux_debt_delta: number;
  readonly behavioral_delta: number;
  readonly friction_delta: number;
  readonly net_delta: number;
  readonly explanation: string;
}

const CLUSTER_TYPE_BIAS: Record<string, { cognition: number; ux_debt: number; behavioral: number; friction: number }> = {
  hierarchy: { cognition: 0.45, ux_debt: 0.30, behavioral: 0.10, friction: 0.15 },
  cta: { cognition: 0.20, ux_debt: 0.20, behavioral: 0.30, friction: 0.30 },
  spacing: { cognition: 0.20, ux_debt: 0.40, behavioral: 0.10, friction: 0.30 },
  accessibility: { cognition: 0.15, ux_debt: 0.50, behavioral: 0.15, friction: 0.20 },
  workflow: { cognition: 0.20, ux_debt: 0.10, behavioral: 0.30, friction: 0.40 },
  navigation: { cognition: 0.20, ux_debt: 0.20, behavioral: 0.40, friction: 0.20 },
  cognition_overload: { cognition: 0.50, ux_debt: 0.20, behavioral: 0.10, friction: 0.20 },
};

/**
 * Phase 12 §E — projects the per-dimension UX delta from applying a
 * remediation. Pure heuristic blend of cluster_type bias × issue_count
 * × historical success rate. Used by the dashboard to show an "if you
 * approve this plan, here's what we expect" panel.
 */
export function simulateUXOutcome(input: UXOutcomeSimulationInput): ProjectedDelta {
  const successScale = Math.max(0.2, Math.min(1.0, input.historical_success_rate / 100));
  const sizeScale = Math.min(1.5, 1 + input.issue_count * 0.05);
  const bias = CLUSTER_TYPE_BIAS[input.cluster_type] || { cognition: 0.25, ux_debt: 0.25, behavioral: 0.25, friction: 0.25 };
  const baseMag = 12 * successScale * sizeScale;
  const cognition_delta = Math.round(baseMag * bias.cognition);
  const ux_debt_delta = Math.round(baseMag * bias.ux_debt);
  const behavioral_delta = Math.round(baseMag * bias.behavioral);
  const friction_delta = Math.round(baseMag * bias.friction);
  const net_delta = Math.round(cognition_delta * 0.4 + ux_debt_delta * 0.3 + behavioral_delta * 0.15 + friction_delta * 0.15);
  return {
    cognition_delta,
    ux_debt_delta,
    behavioral_delta,
    friction_delta,
    net_delta,
    explanation: `Projected net +${net_delta} (success ${Math.round(successScale * 100)}%, ${input.issue_count} issue${input.issue_count === 1 ? '' : 's'}, biased by ${input.cluster_type}).`,
  };
}

export interface RecommendationApplicationSimulationInput {
  readonly recommendation_type: string;
  readonly initial_pressure: number;
  readonly initial_cognition: number;
}

/**
 * Phase 12 §E — projects what happens if the operator accepts a given
 * recommendation. Heuristic mapping from type → expected pressure +
 * cognition shift; used in the dashboard "what if I accept this"
 * preview.
 */
export function simulateRecommendationApplication(input: RecommendationApplicationSimulationInput): SimulationOutcome {
  const presetByType: Record<string, { pressure: number; cognition: number }> = {
    pause_orchestration: { pressure: -12, cognition: 3 },
    escalate_remediation: { pressure: -8, cognition: 5 },
    accelerate_cluster: { pressure: -5, cognition: 6 },
    rollback_policy: { pressure: -6, cognition: 2 },
    request_operator_review: { pressure: -2, cognition: 1 },
    tighten_governance_threshold: { pressure: -3, cognition: 1 },
    loosen_governance_threshold: { pressure: 1, cognition: 1 },
    prepare_remediation_plan: { pressure: 0, cognition: 1 },
  };
  const preset = presetByType[input.recommendation_type] || { pressure: -3, cognition: 2 };
  return simulateQueue({
    initial_pressure: input.initial_pressure,
    initial_cognition: input.initial_cognition,
    tasks: [{
      id: `rec-${input.recommendation_type}`,
      type: 'intelligence',
      priority_score: 70,
      blocking_score: 20,
      execution_cost: 10,
    }],
    type_pressure_delta: { intelligence: preset.pressure },
    type_cognition_delta: { intelligence: preset.cognition },
  });
}
