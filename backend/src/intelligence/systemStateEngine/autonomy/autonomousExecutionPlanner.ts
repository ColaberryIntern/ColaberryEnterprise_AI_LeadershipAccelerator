/**
 * autonomousExecutionPlanner — pure scorer that decides whether a
 * specific PreparedRemediationPlan should be auto-approved.
 *
 * Composition (no DB reads in this module):
 *   1. Run safeExecutionGuardrails (3 validators).
 *   2. Read execution confidence from executionConfidenceCalibrator.
 *   3. Read storm + override-velocity from governanceMemory.
 *   4. Apply automation_mode policy via decideByMode.
 *   5. Return AutonomyDecision { approved_for_autonomy, ... blocking_reasons }.
 *
 * Phase 13 §A.2.
 */

import { evaluateSafeExecutionGuardrails, type SandboxValidationResult, type ExecutionGuardrailDecision } from './safeExecutionGuardrails';
import { decideByMode, type AutomationMode, type AutomationModeDecision } from '../policy/automationModes';
import type { ExecutionConfidence } from './executionConfidenceCalibrator';

export interface AutonomyDecisionInputs {
  readonly project_id: string;
  readonly plan_id: string;
  readonly cluster_signature: string;
  readonly mode: AutomationMode;
  readonly confidence: ExecutionConfidence;
  readonly confidence_floor: number;
  readonly sandbox: SandboxValidationResult;
  readonly storm_active: boolean;
  readonly override_velocity: number;
  readonly proposed_rank_delta_abs: number;
  readonly rank_delta_abs_max: number;
  readonly proposed_queue_mutation_count: number;
  readonly queue_mutation_max: number;
  readonly rate_limit_blocked: boolean;
  readonly action_class: 'autonomous_safe' | 'supervised_safe' | 'operator_required' | 'autonomy_blocked';
  readonly trust_score: number;
}

export type ActionClass = AutonomyDecisionInputs['action_class'];

export interface AutonomyDecision {
  readonly plan_id: string;
  readonly approved_for_autonomy: boolean;
  readonly confidence: number;
  readonly risk_score: number;
  readonly rollback_ready: boolean;
  readonly required_supervision: boolean;
  readonly execution_scope: 'narrow' | 'cluster' | 'broad';
  readonly blocking_reasons: ReadonlyArray<string>;
  readonly action_class: ActionClass;
  readonly mode_decision: AutomationModeDecision;
  readonly guardrail_decision: ExecutionGuardrailDecision;
  readonly summary: string;
}

const ACTION_CLASS_BY_TRUST: Array<[number, ActionClass]> = [
  [80, 'autonomous_safe'],
  [60, 'supervised_safe'],
  [30, 'operator_required'],
  [0, 'autonomy_blocked'],
];

export function classifyExecution(input: { trust_score: number; rollback_frequency: number; storm_active: boolean }): ActionClass {
  if (input.storm_active) return 'autonomy_blocked';
  if (input.rollback_frequency > 30) return 'operator_required';
  for (const [threshold, klass] of ACTION_CLASS_BY_TRUST) {
    if (input.trust_score >= threshold) return klass;
  }
  return 'autonomy_blocked';
}

export function planAutonomyDecision(input: AutonomyDecisionInputs): AutonomyDecision {
  const blocking_reasons: string[] = [];

  // 1. Storm gate (governanceMemory) — short-circuit
  if (input.storm_active) blocking_reasons.push('Override storm active — autonomy paused.');

  // 2. Rate limit gate — short-circuit
  if (input.rate_limit_blocked) blocking_reasons.push('Autonomy execution rate limit reached for this project.');

  // 3. Action class gate
  if (input.action_class === 'autonomy_blocked') blocking_reasons.push('Action class is autonomy_blocked (governance trust too low).');
  if (input.action_class === 'operator_required') blocking_reasons.push('Action class is operator_required.');

  // 4. Run guardrails
  const guardrail_decision = evaluateSafeExecutionGuardrails({
    confidence: input.confidence.confidence,
    confidence_floor: input.confidence_floor,
    sandbox: input.sandbox,
    rank_delta_abs_max: input.rank_delta_abs_max,
    proposed_rank_delta_abs: input.proposed_rank_delta_abs,
    proposed_queue_mutation_count: input.proposed_queue_mutation_count,
    queue_mutation_max: input.queue_mutation_max,
  });
  if (guardrail_decision.action !== 'apply') {
    blocking_reasons.push(`Guardrails: ${guardrail_decision.reason}`);
  }

  // 5. Mode decision
  const mode_decision = decideByMode({
    mode: input.mode,
    confidence: input.confidence.confidence,
    min_confidence_to_apply: input.confidence_floor,
    block_reasons: blocking_reasons.length > 0 ? blocking_reasons : undefined,
    reject_reason_if_frozen: 'Automation mode is frozen.',
  });

  const approved_for_autonomy = mode_decision.action === 'apply' && blocking_reasons.length === 0;

  // Risk score: composite of UX regression probability + governance instability
  // - guardrail-passed plans have low risk; rejected plans high.
  const baseRisk = Math.max(input.sandbox.ux_regression_probability, input.sandbox.governance_instability_signal);
  const risk_score = approved_for_autonomy ? Math.min(50, baseRisk) : Math.min(100, baseRisk + 30);

  // Execution scope: heuristic — narrow if rank delta small + 1 mutation; cluster if multiple mutations same cluster; broad otherwise
  let execution_scope: 'narrow' | 'cluster' | 'broad' = 'narrow';
  if (input.proposed_queue_mutation_count > 4 || input.proposed_rank_delta_abs > 12) execution_scope = 'broad';
  else if (input.proposed_queue_mutation_count > 1) execution_scope = 'cluster';

  const required_supervision = !approved_for_autonomy
    || input.action_class === 'supervised_safe'
    || input.confidence.tier !== 'high';

  const summary = approved_for_autonomy
    ? `Auto-approve: ${input.action_class}, confidence ${input.confidence.confidence}/100, scope ${execution_scope}.`
    : `Block autonomy: ${blocking_reasons.slice(0, 3).join(' / ')}.`;

  return {
    plan_id: input.plan_id,
    approved_for_autonomy,
    confidence: input.confidence.confidence,
    risk_score,
    rollback_ready: input.sandbox.passed,
    required_supervision,
    execution_scope,
    blocking_reasons,
    action_class: input.action_class,
    mode_decision,
    guardrail_decision,
    summary,
  };
}
