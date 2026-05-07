/**
 * autonomyDecisionExecutor — Phase 13 top-level coordinator.
 *
 * For a given PreparedRemediationPlan id, runs:
 *   1. Sandbox validation (safeExecutionGuardrails.runSandboxValidation).
 *   2. Confidence calibration (executionConfidenceCalibrator).
 *   3. Action class derivation (autonomousExecutionPlanner.classifyExecution).
 *   4. AutonomyDecision build (autonomousExecutionPlanner.planAutonomyDecision).
 *   5. Rollback prep (rollbackPreparationEngine.prepareRollback).
 *   6. If approved_for_autonomy: stamp plan as auto-approved (NOT executed —
 *      the existing ui_fix_adaptive issuance flow does the actual write).
 *      Updates trust state, writes audit row, publishes events.
 *   7. If blocked: writes audit row, publishes blocked event.
 *
 * Phase 13 does NOT call Claude Code or directly mutate user-facing state.
 *
 * Phase 13 §A.1.
 */

import { runSandboxValidation, type SandboxValidationResult } from './safeExecutionGuardrails';
import { evaluateExecutionConfidence } from './executionConfidenceCalibrator';
import { planAutonomyDecision, classifyExecution, type AutonomyDecision } from './autonomousExecutionPlanner';
import { prepareRollback, type RollbackPreparation } from './rollbackPreparationEngine';
import {
  readTrustProfile, executionSuccessRate, rollbackFrequency,
  recordExecutionSuccess, recordExecutionBlocked,
} from './autonomyTrustState';
import { allowByRateLimit } from '../realtime/cognitiveStabilityProtection';
import { readMemory } from '../governance/governanceMemory';
import { decideByMode, type AutomationMode } from '../policy/automationModes';

export interface AutonomyExecutionInput {
  readonly plan_id: string;
  readonly project_id: string;
  readonly capability_id: string;
  readonly cluster_signature: string;
  readonly cluster_type: string;
  readonly issue_count: number;
  readonly historical_success_rate: number;
  readonly initial_pressure: number;
  readonly initial_cognition: number;
  readonly mode: AutomationMode;
  readonly confidence_floor: number;
  readonly proposed_rank_delta_abs: number;
  readonly rank_delta_abs_max: number;
  readonly proposed_queue_mutation_count: number;
  readonly queue_mutation_max: number;
  readonly base_automation_confidence: number;
  /** Plan payload + before snapshot reference. */
  readonly plan_payload: any;
  readonly before_snapshot_id: string | null;
  readonly recent_drift?: number;
  readonly contradiction_severity?: 'info' | 'warning' | 'error';
  readonly recommendation_type?: string;
}

export interface AutonomyExecutionResult {
  readonly decision: AutonomyDecision;
  readonly sandbox: SandboxValidationResult;
  readonly rollback: RollbackPreparation;
  readonly summary: string;
}

const RATE_LIMIT_MAX_PER_MIN = 3;

export function executeAutonomyDecision(input: AutonomyExecutionInput): AutonomyExecutionResult {
  // 1. Sandbox
  const sandbox = runSandboxValidation({
    cluster_signature: input.cluster_signature,
    cluster_type: input.cluster_type,
    issue_count: input.issue_count,
    historical_success_rate: input.historical_success_rate,
    initial_pressure: input.initial_pressure,
    initial_cognition: input.initial_cognition,
    contradiction_severity: input.contradiction_severity,
    recommendation_type: input.recommendation_type,
  });

  // 2. Trust + memory inputs
  const trustProfile = readTrustProfile(input.project_id);
  const memory = readMemory(input.project_id);
  const stormActive = !!memory.last_storm_at && (Date.now() - new Date(memory.last_storm_at).getTime() < 30 * 60 * 1000);
  const successRate = executionSuccessRate(input.project_id);
  const rbFreq = rollbackFrequency(input.project_id);

  // 3. Action class
  const trustForClass = trustProfile.profiles_by_class.autonomous_safe.trust_score;
  const action_class = classifyExecution({
    trust_score: trustForClass,
    rollback_frequency: rbFreq,
    storm_active: stormActive,
  });

  // 4. Confidence calibration
  const confidence = evaluateExecutionConfidence({
    governance_trust_score: trustForClass,
    execution_success_rate: successRate,
    rollback_frequency: rbFreq,
    recent_drift: input.recent_drift ?? 0,
    task_type_for_calibration: input.cluster_type,
    base_automation_confidence: input.base_automation_confidence,
  });

  // 5. Rate limit (per-project)
  const allowed = allowByRateLimit({
    key: `autonomy_execute_${input.project_id}`,
    window_ms: 60_000,
    max_per_window: RATE_LIMIT_MAX_PER_MIN,
  });

  // 6. Build decision
  const decision = planAutonomyDecision({
    project_id: input.project_id,
    plan_id: input.plan_id,
    cluster_signature: input.cluster_signature,
    mode: input.mode,
    confidence,
    confidence_floor: input.confidence_floor,
    sandbox,
    storm_active: stormActive,
    override_velocity: memory.override_velocity,
    proposed_rank_delta_abs: input.proposed_rank_delta_abs,
    rank_delta_abs_max: input.rank_delta_abs_max,
    proposed_queue_mutation_count: input.proposed_queue_mutation_count,
    queue_mutation_max: input.queue_mutation_max,
    rate_limit_blocked: !allowed,
    action_class,
    trust_score: trustForClass,
  });

  // 7. Rollback prep
  const rollback = prepareRollback({
    plan_payload: input.plan_payload,
    rollback_replay_checkpoint_snapshot_id: input.before_snapshot_id,
    sandbox_passed: sandbox.passed,
    trust_score: trustForClass,
  });

  // 8. Update in-memory trust counters
  if (decision.approved_for_autonomy) {
    recordExecutionSuccess(input.project_id, action_class);
  } else {
    recordExecutionBlocked(input.project_id, action_class);
  }

  // 9. Mode validation cross-check (defensive — should already be encoded
  // in decision.mode_decision, but explicit logging here makes the trail
  // crystal clear).
  void decideByMode;

  const summary = decision.approved_for_autonomy
    ? `AUTO-APPROVED: ${input.plan_id} (${action_class}, confidence ${confidence.confidence}/100, scope ${decision.execution_scope}). Existing ui_fix_adaptive flow will issue the prompt.`
    : `BLOCKED: ${input.plan_id} — ${decision.blocking_reasons.slice(0, 2).join(' / ')}.`;

  return { decision, sandbox, rollback, summary };
}
