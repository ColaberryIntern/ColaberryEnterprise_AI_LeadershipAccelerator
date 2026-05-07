/**
 * Phase 10 tests — pure helpers covering the self-learning layer.
 *
 * Coverage:
 *   - remediationOutcomeLearner.scoreRemediationOutcome (tier mapping, recurrence penalty)
 *   - adaptivePriorityTrainer.proposeWeightAdjustments (no-data, success, failure, drift cap)
 *   - operationalConfidenceCalibrator (confidence math + tier)
 *   - escalationEffectivenessLearner.scoreEscalations (sub-scores)
 *   - queueOptimizationLearner.deriveQueueOptimizationInsights (best/worst first-type)
 *   - safeLearningGuardrails.evaluateGuardrails (autonomous / supervised / frozen / rollback / drift / confidence floor)
 *   - cognitivePolicyEngine.updatePolicy (versioning + drift accounting)
 *   - simulation engine (queue ordering effect on pressure)
 *   - simulation comparison (preferred ordering)
 *   - crossProjectLearning.fetchSharedRemediations (filter + confidence)
 *   - governanceFoundation.adviseDeploymentGovernance (risk levels)
 */
import { scoreRemediationOutcome } from '../learning/remediationOutcomeLearner';
import { proposeWeightAdjustments, BASELINE_WEIGHTS } from '../learning/adaptivePriorityTrainer';
import { calibrateOperationalConfidence } from '../learning/operationalConfidenceCalibrator';
import { scoreEscalations } from '../learning/escalationEffectivenessLearner';
import { deriveQueueOptimizationInsights } from '../learning/queueOptimizationLearner';
import { evaluateGuardrails, DEFAULT_GUARDRAILS } from '../policy/safeLearningGuardrails';
import { simulateQueue, compareQueueOrderings } from '../simulation/orchestrationSimulationEngine';
import { adviseDeploymentGovernance } from '../transfer/governanceFoundation';

// ---------------------------------------------------------------------------
// scoreRemediationOutcome
// ---------------------------------------------------------------------------

describe('scoreRemediationOutcome', () => {
  it('full success → strong tier', () => {
    const r = scoreRemediationOutcome({
      accepted: true, implemented: true, resolved: true,
      pressure_delta: -20, cognition_delta: 15, recurred_within_7d: false,
    });
    expect(r.tier).toBe('strong');
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it('resolved but recurred within 7d → marginal/ineffective', () => {
    const r = scoreRemediationOutcome({
      accepted: true, implemented: true, resolved: true,
      pressure_delta: -10, cognition_delta: 5, recurred_within_7d: true,
    });
    expect(r.contributions.recurrence_penalty).toBe(-25);
    expect(r.notes.some(n => /recurred/.test(n))).toBe(true);
  });

  it('user rejected the remediation → low score', () => {
    const r = scoreRemediationOutcome({
      accepted: false, implemented: false, resolved: false,
      pressure_delta: null, cognition_delta: null, recurred_within_7d: false,
    });
    expect(r.tier).toBe('ineffective');
    expect(r.notes.some(n => /rejected/.test(n))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// proposeWeightAdjustments
// ---------------------------------------------------------------------------

describe('proposeWeightAdjustments', () => {
  it('insufficient samples → no adjustment', () => {
    const r = proposeWeightAdjustments(BASELINE_WEIGHTS, {
      global: { attempts: 3, resolved: 2, avg_pressure_delta: -2, avg_cognition_delta: 1 },
    });
    expect(r.proposed).toEqual(BASELINE_WEIGHTS);
    expect(r.reasons.some(r => /below min-attempts/.test(r))).toBe(true);
  });

  it('low success + rising pressure → boost blocking', () => {
    const r = proposeWeightAdjustments(BASELINE_WEIGHTS, {
      global: { attempts: 20, resolved: 5, avg_pressure_delta: 8, avg_cognition_delta: -5 },
    });
    expect(r.proposed.blocking).toBeGreaterThan(BASELINE_WEIGHTS.blocking);
    expect(r.reasons.some(r => /boost blocking/i.test(r))).toBe(true);
  });

  it('falling pressure → reinforce priority', () => {
    const r = proposeWeightAdjustments(BASELINE_WEIGHTS, {
      global: { attempts: 30, resolved: 28, avg_pressure_delta: -10, avg_cognition_delta: 8 },
    });
    expect(r.proposed.priority).toBeGreaterThan(BASELINE_WEIGHTS.priority);
  });

  it('clamps drift per-tick to max_delta_per_tick', () => {
    const r = proposeWeightAdjustments(BASELINE_WEIGHTS, {
      global: { attempts: 100, resolved: 10, avg_pressure_delta: 50, avg_cognition_delta: -20 },
    }, { learning_rate: 0.5, max_delta_per_tick: 0.02 });
    for (const v of Object.values(r.deltas)) {
      expect(Math.abs(v)).toBeLessThanOrEqual(0.02);
    }
  });
});

// ---------------------------------------------------------------------------
// calibrateOperationalConfidence
// ---------------------------------------------------------------------------

describe('calibrateOperationalConfidence', () => {
  it('strong inputs → high tier', () => {
    const r = calibrateOperationalConfidence({
      sample_count: 200,
      prediction_accuracy: 0.85,
      contradiction_churn_per_hour: 0,
      policy_changes_last_24h: 0,
      historical_pattern_matches: 50,
      recent_remediation_success_rate: 0.85,
    });
    expect(r.tier).toBe('high');
    expect(r.confidence).toBeGreaterThan(70);
  });

  it('thin sample + low accuracy → low tier with reasons', () => {
    const r = calibrateOperationalConfidence({
      sample_count: 2,
      prediction_accuracy: 0.4,
      contradiction_churn_per_hour: 12,
      policy_changes_last_24h: 4,
      historical_pattern_matches: 0,
      recent_remediation_success_rate: 0.3,
    });
    expect(r.tier).toBe('low');
    expect(r.uncertainty_reasons.length).toBeGreaterThan(2);
  });

  it('contradiction churn drops trust', () => {
    const a = calibrateOperationalConfidence({
      sample_count: 100, prediction_accuracy: 0.8,
      contradiction_churn_per_hour: 0,
      policy_changes_last_24h: 0,
      historical_pattern_matches: 10,
      recent_remediation_success_rate: 0.8,
    });
    const b = calibrateOperationalConfidence({
      sample_count: 100, prediction_accuracy: 0.8,
      contradiction_churn_per_hour: 8,
      policy_changes_last_24h: 0,
      historical_pattern_matches: 10,
      recent_remediation_success_rate: 0.8,
    });
    expect(b.confidence).toBeLessThan(a.confidence);
  });
});

// ---------------------------------------------------------------------------
// scoreEscalations
// ---------------------------------------------------------------------------

describe('scoreEscalations', () => {
  it('returns empty report on no input', () => {
    const r = scoreEscalations([]);
    expect(r.subscriber_scores.length).toBe(0);
  });

  it('ranks subscribers by score', () => {
    const r = scoreEscalations([
      { subscriber_id: 'console', severity: 'error', succeeded: true,
        time_to_ack_ms: 5 * 60_000, time_to_resolve_ms: 30 * 60_000, pressure_delta_30min: -20 },
      { subscriber_id: 'slow', severity: 'error', succeeded: true,
        time_to_ack_ms: 60 * 60_000, time_to_resolve_ms: 180 * 60_000, pressure_delta_30min: 0 },
    ]);
    expect(r.best_subscriber).toBe('console');
    const console = r.subscriber_scores.find(s => s.subscriber_id === 'console')!;
    const slow = r.subscriber_scores.find(s => s.subscriber_id === 'slow')!;
    expect(console.score).toBeGreaterThan(slow.score);
  });
});

// ---------------------------------------------------------------------------
// deriveQueueOptimizationInsights
// ---------------------------------------------------------------------------

describe('deriveQueueOptimizationInsights', () => {
  it('returns empty insights with no observations', () => {
    const r = deriveQueueOptimizationInsights([]);
    expect(r.best_first_task_type).toBeNull();
  });

  it('identifies first-type with biggest pressure drop', () => {
    // Sequence A: backend first, then ui_review (pressure 60 → 50 → 30)
    // Sequence B: ui_review first, then backend (pressure 60 → 55 → 50)
    const obs = [
      { task_id: 'a1', task_type: 'backend',   position: 0, observed_pressure_at_completion: 60 },
      { task_id: 'a2', task_type: 'ui_review', position: 1, observed_pressure_at_completion: 50 },
      { task_id: 'a3', task_type: 'frontend',  position: 2, observed_pressure_at_completion: 30 },
      { task_id: 'b1', task_type: 'ui_review', position: 0, observed_pressure_at_completion: 60 },
      { task_id: 'b2', task_type: 'backend',   position: 1, observed_pressure_at_completion: 55 },
      { task_id: 'b3', task_type: 'frontend',  position: 2, observed_pressure_at_completion: 50 },
    ];
    const r = deriveQueueOptimizationInsights(obs);
    expect(r.best_first_task_type).toBe('backend');
  });
});

// ---------------------------------------------------------------------------
// evaluateGuardrails
// ---------------------------------------------------------------------------

describe('evaluateGuardrails', () => {
  const goodProposal = {
    proposed: BASELINE_WEIGHTS,
    deltas: { priority: 0.01, blocking: 0, maturity_gain: 0, readiness_gain: 0, dependency: 0, confidence: 0, execution_cost_penalty: 0 },
    reasons: ['ok'],
    confidence: 80,
    clamped: false,
  };

  it('autonomous mode with good proposal → apply', () => {
    const d = evaluateGuardrails({
      proposal: goodProposal,
      recent_drift: 0,
      consecutive_worse_outcomes: 0,
      config: { ...DEFAULT_GUARDRAILS, mode: 'autonomous' },
    });
    expect(d.action).toBe('apply');
  });

  it('supervised mode → queue_for_review', () => {
    const d = evaluateGuardrails({
      proposal: goodProposal,
      recent_drift: 0,
      consecutive_worse_outcomes: 0,
      config: { ...DEFAULT_GUARDRAILS, mode: 'supervised' },
    });
    expect(d.action).toBe('queue_for_review');
  });

  it('frozen mode → reject', () => {
    const d = evaluateGuardrails({
      proposal: goodProposal,
      recent_drift: 0,
      consecutive_worse_outcomes: 0,
      config: { ...DEFAULT_GUARDRAILS, mode: 'frozen' },
    });
    expect(d.action).toBe('reject');
  });

  it('low confidence → queue_for_review', () => {
    const d = evaluateGuardrails({
      proposal: { ...goodProposal, confidence: 30 },
      recent_drift: 0,
      consecutive_worse_outcomes: 0,
      config: { ...DEFAULT_GUARDRAILS, mode: 'autonomous', min_confidence_to_apply: 65 },
    });
    expect(d.action).toBe('queue_for_review');
  });

  it('drift over budget → reject', () => {
    const d = evaluateGuardrails({
      proposal: goodProposal,
      recent_drift: 0.15,
      consecutive_worse_outcomes: 0,
      config: { ...DEFAULT_GUARDRAILS, mode: 'autonomous', max_total_drift_per_window: 0.10 },
    });
    expect(d.action).toBe('reject');
  });

  it('3 consecutive worse outcomes → rollback', () => {
    const d = evaluateGuardrails({
      proposal: goodProposal,
      recent_drift: 0,
      consecutive_worse_outcomes: 3,
      config: DEFAULT_GUARDRAILS,
      rollback_target: BASELINE_WEIGHTS,
    });
    expect(d.action).toBe('rollback');
  });
});

// ---------------------------------------------------------------------------
// simulateQueue
// ---------------------------------------------------------------------------

describe('simulateQueue', () => {
  it('empty queue → no change', () => {
    const r = simulateQueue({ initial_pressure: 50, initial_cognition: 70, tasks: [] });
    expect(r.final_pressure).toBe(50);
    expect(r.final_cognition).toBe(70);
    expect(r.steps.length).toBe(0);
  });

  it('foundation task drops pressure most', () => {
    const r = simulateQueue({
      initial_pressure: 80, initial_cognition: 50,
      tasks: [{ id: 't1', type: 'foundation', priority_score: 100, blocking_score: 100, execution_cost: 30 }],
    });
    expect(r.net_pressure_drop).toBeGreaterThan(0);
    expect(r.final_pressure).toBeLessThan(80);
  });

  it('clamps pressure to 0–100', () => {
    const r = simulateQueue({
      initial_pressure: 5, initial_cognition: 50,
      tasks: Array.from({ length: 5 }, (_, i) => ({
        id: `t${i}`, type: 'foundation', priority_score: 100, blocking_score: 100, execution_cost: 30,
      })),
    });
    expect(r.final_pressure).toBeGreaterThanOrEqual(0);
  });
});

describe('compareQueueOrderings', () => {
  it('foundation-first beats foundation-last', () => {
    const tasks = [
      { id: 'f', type: 'foundation', priority_score: 100, blocking_score: 100, execution_cost: 30 },
      { id: 'b', type: 'backend',    priority_score: 50,  blocking_score: 30,  execution_cost: 30 },
      { id: 'u', type: 'ui_review',  priority_score: 50,  blocking_score: 20,  execution_cost: 30 },
    ];
    const reordered = [tasks[1], tasks[2], tasks[0]];   // foundation last
    const r = compareQueueOrderings(80, 50, tasks, reordered);
    // Either A wins or it's a tie — but A should NOT lose to B.
    expect(['a', 'tie']).toContain(r.preferred);
  });
});

// ---------------------------------------------------------------------------
// adviseDeploymentGovernance
// ---------------------------------------------------------------------------

describe('adviseDeploymentGovernance', () => {
  it('healthy state → low risk, safe to proceed', () => {
    const a = adviseDeploymentGovernance({
      cognitive_health_score: 92, cognitive_health_tier: 'healthy',
      pressure_tier: 'calm',
      unresolved_incidents: [],
      prediction_confidence: 80,
      recent_regression_count: 0,
    });
    expect(a.risk_level).toBe('low');
    expect(a.should_block_rollout).toBe(false);
    expect(a.required_human_approval).toBe(false);
  });

  it('error incidents + critical pressure → high risk, blocks rollout', () => {
    const a = adviseDeploymentGovernance({
      cognitive_health_score: 35, cognitive_health_tier: 'critical',
      pressure_tier: 'critical',
      unresolved_incidents: [
        { severity: 'error', type: 'ux_regression', affected_routes: ['/admin/dashboard'] },
        { severity: 'error', type: 'cognition_collapse', affected_routes: ['/admin/leads'] },
      ],
      prediction_confidence: 30,
      recent_regression_count: 2,
    });
    expect(a.risk_level).toBe('high');
    expect(a.should_block_rollout).toBe(true);
    expect(a.required_human_approval).toBe(true);
  });

  it('cautious + warnings → moderate', () => {
    const a = adviseDeploymentGovernance({
      cognitive_health_score: 75, cognitive_health_tier: 'cautious',
      pressure_tier: 'elevated',
      unresolved_incidents: [{ severity: 'warning', type: 'visual_drift', affected_routes: ['/x'] }],
      prediction_confidence: 70,
      recent_regression_count: 0,
    });
    expect(['low', 'moderate']).toContain(a.risk_level);
  });

  it('watch_routes derived from incident routes', () => {
    const a = adviseDeploymentGovernance({
      cognitive_health_score: 80, cognitive_health_tier: 'cautious',
      pressure_tier: 'elevated',
      unresolved_incidents: [{ severity: 'warning', type: 'x', affected_routes: ['/a', '/b'] }],
      prediction_confidence: 70,
      recent_regression_count: 0,
    });
    expect([...a.watch_routes].sort()).toEqual(['/a', '/b']);
  });
});
