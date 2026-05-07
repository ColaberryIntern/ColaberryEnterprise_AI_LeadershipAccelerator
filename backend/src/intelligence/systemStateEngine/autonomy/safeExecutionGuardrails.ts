/**
 * safeExecutionGuardrails — Phase 13 v1 only enforces 3 validators
 * locally; the others fold into existing primitives:
 *   - confidence_floor — configurable per-project
 *   - sandbox_must_pass — sandbox returned passed=true
 *   - blast_radius_cap — rank delta + queue mutation count under
 *     per-project policy max
 *
 * Validators that DON'T live here (reused primitives):
 *   - "no-storm-active"          → governanceMemory.last_storm_at
 *   - "max-concurrent-executions"→ cognitiveStabilityProtection.allowByRateLimit
 *   - "max-frequency"            → cognitiveStabilityProtection.allowByRateLimit
 *   - "no-frozen-mode"           → automationModes.decideByMode (already)
 *
 * Phase 13 §A.5.
 */

import { simulateRemediationPlan, simulateUXOutcome, simulateContradictionResolution, simulateRecommendationApplication } from '../simulation/orchestrationSimulationEngine';

export interface SandboxValidationResult {
  readonly queue_impact: number;                       // 0-100, higher = larger impact
  readonly pressure_evolution: number;                  // signed: + = improvement
  readonly contradiction_growth: number;                // 0-100; lower = better
  readonly ux_regression_probability: number;           // 0-100
  readonly governance_instability_signal: number;       // 0-100
  readonly passed: boolean;
  readonly blocking_reasons: ReadonlyArray<string>;
}

export interface SafeExecutionInputs {
  readonly confidence: number;
  readonly confidence_floor: number;
  readonly sandbox: SandboxValidationResult;
  readonly rank_delta_abs_max: number;                  // proposed maximum rank shift in plan
  readonly proposed_rank_delta_abs: number;
  readonly proposed_queue_mutation_count: number;
  readonly queue_mutation_max: number;
}

export interface ExecutionGuardrailDecision {
  readonly action: 'apply' | 'queue_for_review' | 'reject';
  readonly reason: string;
  readonly checks: {
    confidence_floor: 'pass' | 'fail';
    sandbox_must_pass: 'pass' | 'fail';
    blast_radius_cap: 'pass' | 'fail';
  };
}

export function evaluateSafeExecutionGuardrails(input: SafeExecutionInputs): ExecutionGuardrailDecision {
  const checks: ExecutionGuardrailDecision['checks'] = {
    confidence_floor: input.confidence >= input.confidence_floor ? 'pass' : 'fail',
    sandbox_must_pass: input.sandbox.passed ? 'pass' : 'fail',
    blast_radius_cap:
      input.proposed_rank_delta_abs <= input.rank_delta_abs_max
        && input.proposed_queue_mutation_count <= input.queue_mutation_max
        ? 'pass' : 'fail',
  };

  const failed: string[] = [];
  if (checks.confidence_floor === 'fail') failed.push(`confidence ${input.confidence} below floor ${input.confidence_floor}`);
  if (checks.sandbox_must_pass === 'fail') failed.push(`sandbox failed: ${input.sandbox.blocking_reasons.slice(0, 3).join('; ')}`);
  if (checks.blast_radius_cap === 'fail') failed.push(`blast radius exceeded: rank delta=${input.proposed_rank_delta_abs} (max ${input.rank_delta_abs_max}), mutations=${input.proposed_queue_mutation_count} (max ${input.queue_mutation_max})`);

  if (failed.length > 0) {
    return {
      action: 'reject',
      reason: failed.join('; '),
      checks,
    };
  }
  return { action: 'apply', reason: 'All guardrails passed.', checks };
}

/**
 * Compose the 4 Phase 12 simulators into a single sandbox validation.
 * Pure function: deterministic given inputs. Returns blocking_reasons
 * that the gate uses for rejection messages.
 */
export interface RunSandboxInput {
  readonly cluster_signature: string;
  readonly cluster_type: string;
  readonly issue_count: number;
  readonly historical_success_rate: number;
  readonly initial_pressure: number;
  readonly initial_cognition: number;
  readonly contradiction_severity?: 'info' | 'warning' | 'error';
  readonly recommendation_type?: string;
}

export function runSandboxValidation(input: RunSandboxInput): SandboxValidationResult {
  const blocking_reasons: string[] = [];

  const remediationOutcome = simulateRemediationPlan({
    cluster_signature: input.cluster_signature,
    issue_count: input.issue_count,
    historical_success_rate: input.historical_success_rate,
    initial_pressure: input.initial_pressure,
    initial_cognition: input.initial_cognition,
  });

  const uxOutcome = simulateUXOutcome({
    cluster_type: input.cluster_type,
    issue_count: input.issue_count,
    historical_success_rate: input.historical_success_rate,
    before: { cognition: input.initial_cognition, ux_debt: 60, behavioral: 50, friction: 50 },
  });

  const contradictionOutcome = input.contradiction_severity
    ? simulateContradictionResolution({
        contradiction_severity: input.contradiction_severity,
        proposed_action: 'remediate',
        initial_pressure: input.initial_pressure,
        initial_cognition: input.initial_cognition,
      })
    : null;

  const recOutcome = input.recommendation_type
    ? simulateRecommendationApplication({
        recommendation_type: input.recommendation_type,
        initial_pressure: input.initial_pressure,
        initial_cognition: input.initial_cognition,
      })
    : null;

  // Aggregate
  const queue_impact = Math.min(100, Math.round(Math.abs(remediationOutcome.net_pressure_drop) * 4));
  const pressure_evolution = remediationOutcome.net_pressure_drop;
  // Heuristic: when net delta is negative (regression), contradiction growth proxy rises
  const contradiction_growth = uxOutcome.net_delta < 0
    ? Math.min(100, Math.round(Math.abs(uxOutcome.net_delta) * 6))
    : 0;
  const ux_regression_probability = uxOutcome.net_delta < 0
    ? Math.min(100, Math.round(Math.abs(uxOutcome.net_delta) * 4 + 20))
    : Math.max(0, 30 - Math.round(input.historical_success_rate / 4));
  // Governance instability: composite of contradiction outcome (if any) and recommendation outcome
  const governance_instability_signal = Math.max(
    contradictionOutcome ? Math.max(0, -contradictionOutcome.net_pressure_drop) * 3 : 0,
    recOutcome ? Math.max(0, -recOutcome.net_pressure_drop) * 3 : 0,
    contradiction_growth / 3,
  );

  if (remediationOutcome.net_pressure_drop < -2) blocking_reasons.push('Sandbox predicts pressure increase.');
  if (uxOutcome.net_delta < -2) blocking_reasons.push('Sandbox predicts UX regression.');
  if (governance_instability_signal > 60) blocking_reasons.push(`Governance instability projected (signal ${Math.round(governance_instability_signal)}).`);

  const passed = blocking_reasons.length === 0;

  return {
    queue_impact,
    pressure_evolution,
    contradiction_growth,
    ux_regression_probability,
    governance_instability_signal: Math.round(governance_instability_signal),
    passed,
    blocking_reasons,
  };
}

// ── Phase 14 — blast radius assessment ─────────────────────────────────────

export interface BlastRadiusInput {
  readonly affected_components_count: number;
  readonly proposed_queue_mutation_count: number;
  readonly proposed_rank_delta_abs: number;
  readonly cluster_severity: 'low' | 'medium' | 'high';
  /** Approximate dependency fan-out for the touched cluster (count of related capabilities). */
  readonly dependency_fanout: number;
  /** UX-collateral signal — how many neighbouring routes share the cluster_signature. */
  readonly neighbouring_routes: number;
}

export interface BlastRadiusProfile {
  readonly affected_components_count: number;
  readonly dependency_propagation_score: number;     // 0-100
  readonly ux_collateral_risk: number;                // 0-100
  readonly orchestration_instability_risk: number;    // 0-100
  readonly contradiction_amplification_probability: number; // 0-100
  readonly blast_score: number;                       // 0-100 composite
  readonly risk_tier: 'low' | 'moderate' | 'high';
  readonly contributing_factors: ReadonlyArray<string>;
}

const SEVERITY_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3 };

/**
 * Phase 14 — heuristic blast-radius scorer. Composite of: affected
 * component count + queue-mutation count × rank delta + dependency
 * fan-out + cluster severity. Risk tier 'high' triggers a hard block
 * regardless of decision approval (per the safety rule).
 */
export function assessBlastRadius(input: BlastRadiusInput): BlastRadiusProfile {
  const factors: string[] = [];

  const dependency_propagation_score = Math.min(100, Math.round(input.dependency_fanout * 8 + input.affected_components_count * 4));
  if (dependency_propagation_score > 60) factors.push(`Dependency propagation high (${dependency_propagation_score}/100; fanout ${input.dependency_fanout}).`);

  const ux_collateral_risk = Math.min(100, Math.round(input.neighbouring_routes * 12 + input.affected_components_count * 3));
  if (ux_collateral_risk > 60) factors.push(`UX collateral risk high (${ux_collateral_risk}/100; ${input.neighbouring_routes} neighbouring routes).`);

  const orchestration_instability_risk = Math.min(100, Math.round(
    input.proposed_queue_mutation_count * 8 + input.proposed_rank_delta_abs * 1.5,
  ));
  if (orchestration_instability_risk > 60) factors.push(`Orchestration instability projected (${orchestration_instability_risk}/100).`);

  const sevW = SEVERITY_WEIGHT[input.cluster_severity] ?? 2;
  const contradiction_amplification_probability = Math.min(100, Math.round(
    sevW * 20 + input.dependency_fanout * 4,
  ));
  if (contradiction_amplification_probability > 60) factors.push(`Contradiction amplification likely (${contradiction_amplification_probability}/100; ${input.cluster_severity} severity).`);

  // Composite blast score: weighted blend.
  const blast_score = Math.round(
    dependency_propagation_score * 0.30
    + ux_collateral_risk * 0.30
    + orchestration_instability_risk * 0.20
    + contradiction_amplification_probability * 0.20,
  );
  const risk_tier: BlastRadiusProfile['risk_tier'] =
    blast_score >= 70 ? 'high' :
    blast_score >= 40 ? 'moderate' :
    'low';
  if (risk_tier === 'high') factors.unshift(`Composite blast score ${blast_score}/100 — autonomous handoff blocked.`);

  return {
    affected_components_count: input.affected_components_count,
    dependency_propagation_score,
    ux_collateral_risk,
    orchestration_instability_risk,
    contradiction_amplification_probability,
    blast_score,
    risk_tier,
    contributing_factors: factors,
  };
}

/**
 * Phase 14 — blast-radius gate. Returns a guardrail-style decision so
 * autonomousHandoffEngine can short-circuit when blast risk is high.
 */
export function evaluateBlastRadiusGate(profile: BlastRadiusProfile): { action: 'apply' | 'reject'; reason: string } {
  if (profile.risk_tier === 'high') {
    return { action: 'reject', reason: `Blast radius high (${profile.blast_score}/100) — autonomous handoff blocked.` };
  }
  return { action: 'apply', reason: `Blast radius ${profile.risk_tier} (${profile.blast_score}/100).` };
}
