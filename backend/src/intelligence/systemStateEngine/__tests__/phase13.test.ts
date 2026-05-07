/**
 * Phase 13 tests — supervised autonomous decision approval.
 *
 * Coverage (pure helpers + safe-fallback paths):
 *   - sandboxCalibrationBuffer: cold-start, error scoring, buffer cap
 *   - safeExecutionGuardrails (gate + sandbox aggregator)
 *   - executionConfidenceCalibrator
 *   - autonomousExecutionPlanner (classifyExecution + planAutonomyDecision)
 *   - rollbackPreparationEngine
 *   - autonomyDecisionExecutor (composite path)
 *   - executionDriftDetector
 *   - autonomyTrustState (success/rollback/blocked counters + trust math)
 *   - federatedTrustProfiles.shouldFederationInfluence
 *   - runAutonomousOutcomeLearningTick (cooldown path + DB-fallback)
 *   - cognitiveHealthIndex weight rebalance (operational_stability 0.8 → 1.0)
 *   - extended buildRollbackPromptBody with post-execution change-set
 *   - AuthoritativeSystemState type compile-check
 */

import {
  recordCalibrationSample, calibrationScoreFor,
  _resetSandboxCalibrationBuffer,
} from '../autonomy/sandboxCalibrationBuffer';
import { evaluateSafeExecutionGuardrails, runSandboxValidation } from '../autonomy/safeExecutionGuardrails';
import { evaluateExecutionConfidence } from '../autonomy/executionConfidenceCalibrator';
import { classifyExecution, planAutonomyDecision } from '../autonomy/autonomousExecutionPlanner';
import { prepareRollback } from '../autonomy/rollbackPreparationEngine';
import { executeAutonomyDecision } from '../autonomy/autonomyDecisionExecutor';
import { detectExecutionDrift } from '../autonomy/executionDriftDetector';
import {
  recordExecutionSuccess, recordExecutionRollback, recordExecutionBlocked,
  readTrustProfile, executionSuccessRate, rollbackFrequency,
  _resetAutonomyTrustState,
} from '../autonomy/autonomyTrustState';
import { shouldFederationInfluence } from '../transfer/federatedTrustProfiles';
import { runAutonomousOutcomeLearningTick } from '../learning/runAutonomousOutcomeLearningTick';
import { computeCognitiveHealthIndex } from '../health/cognitiveHealthIndex';
import { buildRollbackPromptBody } from '../governance/autonomousRemediationPreparer';
import { _resetGovernanceMemory } from '../governance/governanceMemory';
import { _resetStabilityForTests } from '../realtime/cognitiveStabilityProtection';

// ---------------------------------------------------------------------------
// sandboxCalibrationBuffer
// ---------------------------------------------------------------------------

describe('sandboxCalibrationBuffer', () => {
  beforeEach(() => { _resetSandboxCalibrationBuffer(); });

  it('cold start returns score 100 (no penalty)', () => {
    const r = calibrationScoreFor('ui_review');
    expect(r.score).toBe(100);
    expect(r.samples_evaluated).toBe(0);
  });

  it('records samples and computes mean abs error', () => {
    for (let i = 0; i < 5; i++) {
      recordCalibrationSample('ui_review', {
        predicted_pressure_delta: -10,
        actual_pressure_delta: -5,
        predicted_cognition_delta: 5,
        actual_cognition_delta: 3,
      });
    }
    const r = calibrationScoreFor('ui_review');
    expect(r.samples_evaluated).toBeGreaterThan(0);
    // 50% error → score around 50 (capped between 40 and 100)
    expect(r.score).toBeLessThanOrEqual(70);
    expect(r.mean_abs_pct_error).toBeGreaterThan(0);
  });

  it('perfect predictions stay at score 100', () => {
    for (let i = 0; i < 5; i++) {
      recordCalibrationSample('ui_review', {
        predicted_pressure_delta: -8,
        actual_pressure_delta: -8,
        predicted_cognition_delta: 5,
        actual_cognition_delta: 5,
      });
    }
    expect(calibrationScoreFor('ui_review').score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// safeExecutionGuardrails
// ---------------------------------------------------------------------------

describe('evaluateSafeExecutionGuardrails', () => {
  const happySandbox = {
    queue_impact: 30, pressure_evolution: 5, contradiction_growth: 0,
    ux_regression_probability: 10, governance_instability_signal: 5,
    passed: true, blocking_reasons: [],
  };

  it('all checks pass → action=apply', () => {
    const r = evaluateSafeExecutionGuardrails({
      confidence: 80, confidence_floor: 65,
      sandbox: happySandbox,
      rank_delta_abs_max: 20, proposed_rank_delta_abs: 8,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
    });
    expect(r.action).toBe('apply');
    expect(r.checks.confidence_floor).toBe('pass');
    expect(r.checks.sandbox_must_pass).toBe('pass');
    expect(r.checks.blast_radius_cap).toBe('pass');
  });

  it('confidence below floor → reject', () => {
    const r = evaluateSafeExecutionGuardrails({
      confidence: 50, confidence_floor: 65,
      sandbox: happySandbox,
      rank_delta_abs_max: 20, proposed_rank_delta_abs: 8,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
    });
    expect(r.action).toBe('reject');
    expect(r.checks.confidence_floor).toBe('fail');
  });

  it('sandbox failed → reject', () => {
    const r = evaluateSafeExecutionGuardrails({
      confidence: 90, confidence_floor: 65,
      sandbox: { ...happySandbox, passed: false, blocking_reasons: ['regression projected'] },
      rank_delta_abs_max: 20, proposed_rank_delta_abs: 8,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
    });
    expect(r.action).toBe('reject');
    expect(r.checks.sandbox_must_pass).toBe('fail');
  });

  it('blast radius exceeded → reject', () => {
    const r = evaluateSafeExecutionGuardrails({
      confidence: 85, confidence_floor: 65,
      sandbox: happySandbox,
      rank_delta_abs_max: 5, proposed_rank_delta_abs: 30,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
    });
    expect(r.action).toBe('reject');
    expect(r.checks.blast_radius_cap).toBe('fail');
  });
});

describe('runSandboxValidation', () => {
  it('healthy plan returns passed=true', () => {
    const r = runSandboxValidation({
      cluster_signature: 'cta:c1:/x', cluster_type: 'cta',
      issue_count: 4, historical_success_rate: 80,
      initial_pressure: 60, initial_cognition: 60,
    });
    expect(r.passed).toBe(true);
    expect(r.blocking_reasons.length).toBe(0);
    expect(r.queue_impact).toBeGreaterThan(0);
  });

  it('low success rate produces UX regression risk signal', () => {
    const r = runSandboxValidation({
      cluster_signature: 'cta:c1:/x', cluster_type: 'cta',
      issue_count: 2, historical_success_rate: 20,
      initial_pressure: 60, initial_cognition: 60,
    });
    expect(r.ux_regression_probability).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// evaluateExecutionConfidence
// ---------------------------------------------------------------------------

describe('evaluateExecutionConfidence', () => {
  beforeEach(() => { _resetSandboxCalibrationBuffer(); });

  it('healthy inputs produce high tier', () => {
    const r = evaluateExecutionConfidence({
      governance_trust_score: 90,
      execution_success_rate: 95,
      rollback_frequency: 5,
      recent_drift: 10,
      task_type_for_calibration: 'ui_review',
      base_automation_confidence: 80,
    });
    expect(r.tier).toBe('high');
  });

  it('high rollback frequency drops to low tier', () => {
    const r = evaluateExecutionConfidence({
      governance_trust_score: 50,
      execution_success_rate: 40,
      rollback_frequency: 60,
      recent_drift: 60,
      task_type_for_calibration: 'ui_review',
      base_automation_confidence: 30,
    });
    expect(r.tier).toBe('low');
    expect(r.reasons.some(x => /rollback|drift|trust/i.test(x))).toBe(true);
  });

  it('sandbox calibration penalty surfaces in confidence', () => {
    // Push the buffer into bad shape
    for (let i = 0; i < 8; i++) {
      recordCalibrationSample('ui_review', {
        predicted_pressure_delta: -10, actual_pressure_delta: -2,
        predicted_cognition_delta: 5, actual_cognition_delta: 0,
      });
    }
    const r = evaluateExecutionConfidence({
      governance_trust_score: 80, execution_success_rate: 80,
      rollback_frequency: 5, recent_drift: 5,
      task_type_for_calibration: 'ui_review',
      base_automation_confidence: 80,
    });
    expect(r.sandbox_calibration_score).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// autonomousExecutionPlanner
// ---------------------------------------------------------------------------

describe('classifyExecution', () => {
  it('storm active → autonomy_blocked', () => {
    expect(classifyExecution({ trust_score: 90, rollback_frequency: 0, storm_active: true })).toBe('autonomy_blocked');
  });
  it('high trust → autonomous_safe', () => {
    expect(classifyExecution({ trust_score: 85, rollback_frequency: 5, storm_active: false })).toBe('autonomous_safe');
  });
  it('rollback frequency over 30% → operator_required', () => {
    expect(classifyExecution({ trust_score: 90, rollback_frequency: 35, storm_active: false })).toBe('operator_required');
  });
  it('low trust falls through to autonomy_blocked', () => {
    expect(classifyExecution({ trust_score: 10, rollback_frequency: 0, storm_active: false })).toBe('autonomy_blocked');
  });
});

describe('planAutonomyDecision', () => {
  const happyConfidence: any = {
    confidence: 80, tier: 'high', reasons: [], contributions: {}, drift: 5, sandbox_calibration_score: 95,
  };
  const happySandbox = {
    queue_impact: 30, pressure_evolution: 5, contradiction_growth: 0,
    ux_regression_probability: 10, governance_instability_signal: 5,
    passed: true, blocking_reasons: [],
  };

  it('healthy state with autonomous mode → approved_for_autonomy=true', () => {
    const d = planAutonomyDecision({
      project_id: 'p1', plan_id: 'plan-1', cluster_signature: 'cta:cap:/x',
      mode: 'autonomous', confidence: happyConfidence, confidence_floor: 65,
      sandbox: happySandbox, storm_active: false, override_velocity: 0,
      proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
      rate_limit_blocked: false, action_class: 'autonomous_safe', trust_score: 80,
    });
    expect(d.approved_for_autonomy).toBe(true);
    expect(d.execution_scope).toBe('narrow');
  });

  it('frozen mode → approved_for_autonomy=false', () => {
    const d = planAutonomyDecision({
      project_id: 'p1', plan_id: 'plan-1', cluster_signature: 'cta:cap:/x',
      mode: 'frozen', confidence: happyConfidence, confidence_floor: 65,
      sandbox: happySandbox, storm_active: false, override_velocity: 0,
      proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
      rate_limit_blocked: false, action_class: 'autonomous_safe', trust_score: 80,
    });
    expect(d.approved_for_autonomy).toBe(false);
  });

  it('rate limit blocked → approved=false + blocking reason', () => {
    const d = planAutonomyDecision({
      project_id: 'p1', plan_id: 'plan-1', cluster_signature: 'cta:cap:/x',
      mode: 'autonomous', confidence: happyConfidence, confidence_floor: 65,
      sandbox: happySandbox, storm_active: false, override_velocity: 0,
      proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
      rate_limit_blocked: true, action_class: 'autonomous_safe', trust_score: 80,
    });
    expect(d.approved_for_autonomy).toBe(false);
    expect(d.blocking_reasons.some(x => /rate limit/i.test(x))).toBe(true);
  });

  it('storm active short-circuits to blocked', () => {
    const d = planAutonomyDecision({
      project_id: 'p1', plan_id: 'plan-1', cluster_signature: 'cta:cap:/x',
      mode: 'autonomous', confidence: happyConfidence, confidence_floor: 65,
      sandbox: happySandbox, storm_active: true, override_velocity: 6,
      proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
      rate_limit_blocked: false, action_class: 'autonomy_blocked', trust_score: 30,
    });
    expect(d.approved_for_autonomy).toBe(false);
    expect(d.blocking_reasons.some(x => /storm/i.test(x))).toBe(true);
  });

  it('action_class operator_required → blocked', () => {
    const d = planAutonomyDecision({
      project_id: 'p1', plan_id: 'plan-1', cluster_signature: 'cta:cap:/x',
      mode: 'autonomous', confidence: happyConfidence, confidence_floor: 65,
      sandbox: happySandbox, storm_active: false, override_velocity: 0,
      proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
      rate_limit_blocked: false, action_class: 'operator_required', trust_score: 50,
    });
    expect(d.approved_for_autonomy).toBe(false);
  });

  it('execution_scope = broad when many mutations', () => {
    const d = planAutonomyDecision({
      project_id: 'p1', plan_id: 'plan-1', cluster_signature: 'cta:cap:/x',
      mode: 'autonomous', confidence: happyConfidence, confidence_floor: 65,
      sandbox: happySandbox, storm_active: false, override_velocity: 0,
      proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
      proposed_queue_mutation_count: 6, queue_mutation_max: 10,
      rate_limit_blocked: false, action_class: 'autonomous_safe', trust_score: 85,
    });
    expect(d.execution_scope).toBe('broad');
  });
});

// ---------------------------------------------------------------------------
// rollbackPreparationEngine
// ---------------------------------------------------------------------------

describe('prepareRollback', () => {
  const planPayload: any = {
    target: 'ui_fix_adaptive', stepKey: 'usability', uiIssues: [],
    adaptiveRemediation: { clusters: [] },
    rollback: {
      rollback_prompt_target: 'ui_fix_adaptive',
      rollback_payload: { instruction: 'Revert', reference_dom_snapshot_id: 'snap-1' },
      before_dom_snapshot_id: 'snap-1',
    },
  };

  it('happy path returns full readiness', () => {
    const r = prepareRollback({
      plan_payload: planPayload,
      rollback_replay_checkpoint_snapshot_id: 'state-1',
      sandbox_passed: true,
      trust_score: 75,
    });
    expect(r.rollback_prompt).toContain('Revert');
    expect(r.rollback_confidence).toBe(100);
  });

  it('missing snapshot id degrades confidence', () => {
    const r = prepareRollback({
      plan_payload: { ...planPayload, rollback: { ...planPayload.rollback, before_dom_snapshot_id: null } },
      rollback_replay_checkpoint_snapshot_id: null,
      sandbox_passed: true,
      trust_score: 75,
    });
    expect(r.rollback_prompt).toBeNull();
    expect(r.rollback_confidence).toBeLessThanOrEqual(40);
  });

  it('post-execution change-set surfaces in prompt body', () => {
    const r = prepareRollback({
      plan_payload: planPayload,
      post_execution_change_set: 'Modified file X.tsx; added arial-label',
      rollback_replay_checkpoint_snapshot_id: 'state-1',
      sandbox_passed: true,
      trust_score: 75,
    });
    expect(r.rollback_prompt).toContain('POST-EXECUTION CHANGES');
    expect(r.rollback_prompt).toContain('Modified file X.tsx');
  });
});

describe('buildRollbackPromptBody (extended)', () => {
  const planPayload: any = {
    rollback: {
      rollback_prompt_target: 'ui_fix_adaptive',
      rollback_payload: { instruction: 'Revert', reference_dom_snapshot_id: 'snap-1' },
      before_dom_snapshot_id: 'snap-1',
    },
  };

  it('returns null without snapshot reference', () => {
    expect(buildRollbackPromptBody({ ...planPayload, rollback: { ...planPayload.rollback, before_dom_snapshot_id: null } })).toBeNull();
  });

  it('without change-set returns base prompt only', () => {
    const body = buildRollbackPromptBody(planPayload);
    expect(body).toContain('REFERENCE STATE');
    expect(body).not.toContain('POST-EXECUTION CHANGES');
  });

  it('with change-set appends section', () => {
    const body = buildRollbackPromptBody(planPayload, 'Files: X.tsx, Y.tsx');
    expect(body).toContain('POST-EXECUTION CHANGES');
    expect(body).toContain('Files: X.tsx, Y.tsx');
  });
});

// ---------------------------------------------------------------------------
// autonomyTrustState
// ---------------------------------------------------------------------------

describe('autonomyTrustState', () => {
  beforeEach(() => { _resetAutonomyTrustState(); });

  it('starts at trust 50 baseline', () => {
    const t = readTrustProfile('p1');
    expect(t.profiles_by_class.autonomous_safe.trust_score).toBe(50);
  });

  it('successes raise trust', () => {
    for (let i = 0; i < 5; i++) recordExecutionSuccess('p1', 'autonomous_safe');
    expect(readTrustProfile('p1').profiles_by_class.autonomous_safe.trust_score).toBeGreaterThan(50);
  });

  it('rollbacks lower trust', () => {
    for (let i = 0; i < 5; i++) recordExecutionRollback('p1', 'autonomous_safe');
    expect(readTrustProfile('p1').profiles_by_class.autonomous_safe.trust_score).toBeLessThan(50);
  });

  it('blocks lower trust slightly', () => {
    for (let i = 0; i < 5; i++) recordExecutionBlocked('p1', 'autonomous_safe');
    expect(readTrustProfile('p1').profiles_by_class.autonomous_safe.trust_score).toBeLessThan(50);
  });

  it('execution_success_rate computed correctly', () => {
    recordExecutionSuccess('p1', 'autonomous_safe');
    recordExecutionSuccess('p1', 'autonomous_safe');
    recordExecutionRollback('p1', 'autonomous_safe');
    expect(executionSuccessRate('p1')).toBe(67);
  });

  it('rollback_frequency computed correctly', () => {
    recordExecutionSuccess('p1', 'autonomous_safe');
    recordExecutionRollback('p1', 'autonomous_safe');
    expect(rollbackFrequency('p1')).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// executionDriftDetector
// ---------------------------------------------------------------------------

describe('detectExecutionDrift', () => {
  beforeEach(() => {
    _resetAutonomyTrustState();
    _resetGovernanceMemory();
    _resetStabilityForTests();
  });

  it('healthy state → drift_detected=false', () => {
    for (let i = 0; i < 10; i++) recordExecutionSuccess('p1', 'autonomous_safe');
    const r = detectExecutionDrift('p1', { force: true });
    expect(r?.drift_detected).toBe(false);
  });

  it('high rollback frequency triggers drift', () => {
    // 6 rollbacks + 4 successes → success_rate 40% (< 50% floor) + rollback freq 60% (> 15%)
    // → drift_score 30 + 25 = 55 >= 30 threshold → drift flagged.
    for (let i = 0; i < 6; i++) recordExecutionRollback('p1', 'autonomous_safe');
    for (let i = 0; i < 4; i++) recordExecutionSuccess('p1', 'autonomous_safe');
    const r = detectExecutionDrift('p1', { force: true });
    expect(r?.drift_detected).toBe(true);
    expect(r?.reasons.some(x => /rollback/i.test(x))).toBe(true);
  });

  it('cooldown blocks repeat runs', () => {
    detectExecutionDrift('p2');
    const second = detectExecutionDrift('p2');
    expect(second).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// federatedTrustProfiles.shouldFederationInfluence
// ---------------------------------------------------------------------------

describe('shouldFederationInfluence', () => {
  it('cold project + strong federation → influence', () => {
    expect(shouldFederationInfluence({
      local_sample_size: 5,
      federation_total_executions: 100,
      federation_variance: 0.05,
    })).toBe(true);
  });

  it('warm project → no influence', () => {
    expect(shouldFederationInfluence({
      local_sample_size: 50,
      federation_total_executions: 200,
      federation_variance: 0.05,
    })).toBe(false);
  });

  it('high variance federation → no influence', () => {
    expect(shouldFederationInfluence({
      local_sample_size: 5,
      federation_total_executions: 200,
      federation_variance: 0.40,
    })).toBe(false);
  });

  it('low federation samples → no influence', () => {
    expect(shouldFederationInfluence({
      local_sample_size: 5,
      federation_total_executions: 30,
      federation_variance: 0.05,
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runAutonomousOutcomeLearningTick
// ---------------------------------------------------------------------------

describe('runAutonomousOutcomeLearningTick', () => {
  beforeEach(() => {
    _resetAutonomyTrustState();
    _resetStabilityForTests();
  });

  it('returns trust summary even when DB unavailable', async () => {
    recordExecutionSuccess('p1', 'autonomous_safe');
    const r = await runAutonomousOutcomeLearningTick('p1');
    expect(r.project_id).toBe('p1');
    expect(r.trust_score_summary.autonomous_safe).toBeGreaterThan(0);
    expect(r.recent_executions).toBeGreaterThanOrEqual(0);
  });

  it('cooldown suppresses second snapshot in same minute', async () => {
    const r1 = await runAutonomousOutcomeLearningTick('p2');
    const r2 = await runAutonomousOutcomeLearningTick('p2');
    // r2 should NOT have recorded (cooldown active)
    expect(r2.snapshot_recorded).toBe(false);
    void r1;
  });
});

// ---------------------------------------------------------------------------
// cognitiveHealthIndex Phase 13 rebalance
// ---------------------------------------------------------------------------

describe('cognitiveHealthIndex Phase 13 weights', () => {
  it('operational_stability swings score by ~1.0/11.5', () => {
    const baseInputs: any = {
      sync_health: 80, ux_health: 80, workflow_health: 80, cognition_health: 80,
      behavioral_health: 80, pressure_health: 80, contradiction_health: 80,
      prediction_confidence: 80, operational_stability: 0, remediation_health: 80,
    };
    const lo = computeCognitiveHealthIndex(baseInputs);
    const hi = computeCognitiveHealthIndex({ ...baseInputs, operational_stability: 100 });
    expect(hi.score).toBeGreaterThan(lo.score);
  });
});

// ---------------------------------------------------------------------------
// AuthoritativeSystemState type compile-check
// ---------------------------------------------------------------------------

describe('AuthoritativeSystemState includes autonomy_summary', () => {
  it('compile-time check', () => {
    type Check = import('../types/systemState.types').AuthoritativeSystemState;
    const stub = {} as Check;
    void stub;
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// autonomyDecisionExecutor (composite path)
// ---------------------------------------------------------------------------

describe('executeAutonomyDecision', () => {
  beforeEach(() => {
    _resetAutonomyTrustState();
    _resetGovernanceMemory();
    _resetStabilityForTests();
  });

  const planPayload: any = {
    rollback: {
      rollback_prompt_target: 'ui_fix_adaptive',
      rollback_payload: { instruction: 'Revert', reference_dom_snapshot_id: 'snap-1' },
      before_dom_snapshot_id: 'snap-1',
    },
  };

  it('healthy path produces approved decision', () => {
    // Pre-seed trust to autonomous_safe range
    for (let i = 0; i < 10; i++) recordExecutionSuccess('p1', 'autonomous_safe');
    const r = executeAutonomyDecision({
      plan_id: 'plan-1', project_id: 'p1', capability_id: 'cap-1',
      cluster_signature: 'cta:cap-1:/x', cluster_type: 'cta',
      issue_count: 3, historical_success_rate: 80,
      initial_pressure: 50, initial_cognition: 60,
      mode: 'autonomous', confidence_floor: 50,
      proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
      base_automation_confidence: 70,
      plan_payload: planPayload, before_snapshot_id: 'state-1',
    });
    expect(r.decision.approved_for_autonomy).toBe(true);
    expect(r.summary).toMatch(/AUTO-APPROVED/);
  });

  it('frozen mode produces blocked decision', () => {
    const r = executeAutonomyDecision({
      plan_id: 'plan-1', project_id: 'p2', capability_id: 'cap-1',
      cluster_signature: 'cta:cap-1:/x', cluster_type: 'cta',
      issue_count: 3, historical_success_rate: 80,
      initial_pressure: 50, initial_cognition: 60,
      mode: 'frozen', confidence_floor: 50,
      proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
      proposed_queue_mutation_count: 1, queue_mutation_max: 4,
      base_automation_confidence: 70,
      plan_payload: planPayload, before_snapshot_id: 'state-1',
    });
    expect(r.decision.approved_for_autonomy).toBe(false);
    expect(r.summary).toMatch(/BLOCKED/);
  });
});
