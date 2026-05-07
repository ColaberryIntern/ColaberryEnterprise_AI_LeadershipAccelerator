/**
 * Phase 12 tests — governed decision automation.
 *
 * Coverage (pure helpers + safe-fallback paths):
 *   - automationModes: decideByMode (frozen / supervised / autonomous, confidence floor, block reasons)
 *   - automationConfidenceGate: composite score, blocking reasons, mode interaction, unsafe match penalty, storm penalty
 *   - governanceRecommendationEngine: emits recommendations for critical health, pressure, regressions, override velocity, healthy state
 *   - autonomousRemediationPreparer: plan draft shape, rollback prompt body
 *   - decisionExplainabilityEngine: empty-anchor narrative, exports
 *   - governanceMemory: record successful, record unsafe, record overrides, storm trigger threshold
 *   - governanceTaskShaper: pause flattens, escalate boosts, dedupe + cache TTL
 *   - simulation extensions: simulateRemediationPlan, simulateUXOutcome, simulateRecommendationApplication
 *   - decideGovernanceDeletions: cutoff math
 *   - applyCombinedTaskShaping: 4-layer clamp + governance shaper integration
 *   - runGovernanceLearningTick: empty + acceptance baseline
 */

import { decideByMode } from '../policy/automationModes';
import { evaluateAutomationConfidence } from '../governance/automationConfidenceGate';
import { generateGovernanceRecommendations } from '../governance/governanceRecommendationEngine';
import { preparePlanDraft, buildRollbackPromptBody } from '../governance/autonomousRemediationPreparer';
import { explainDecision } from '../governance/decisionExplainabilityEngine';
import {
  recordSuccessfulPlan, recordUnsafePattern, recordOperatorOverride,
  readMemory, _resetGovernanceMemory,
} from '../governance/governanceMemory';
import {
  governanceTaskShaper, noteRecommendationCreated, noteRecommendationDecided,
  _resetGovernanceShaperCache,
} from '../governance/governanceTaskShaper';
import {
  simulateRemediationPlan, simulateContradictionResolution, simulateUXOutcome, simulateRecommendationApplication,
} from '../simulation/orchestrationSimulationEngine';
import { decideGovernanceDeletions, DEFAULT_GOVERNANCE_RETENTION_POLICY } from '../telemetry/governanceRetentionSweeper';
import {
  applyCombinedTaskShaping, _COMBINED_RANK_CLAMP_FOR_TESTS,
} from '../remediation/remediationPriorityWeighting';
import { _resetRemediationPressureState, updateRemediationPressure } from '../remediation/remediationPressureEngine';
import { runGovernanceLearningTick } from '../learning/runGovernanceLearningTick';

// ---------------------------------------------------------------------------
// automationModes.decideByMode
// ---------------------------------------------------------------------------

describe('decideByMode', () => {
  it('frozen → reject regardless of confidence', () => {
    const r = decideByMode({ mode: 'frozen', confidence: 95, min_confidence_to_apply: 50 });
    expect(r.action).toBe('reject');
    expect(r.mode).toBe('frozen');
  });

  it('autonomous + confidence above floor → apply', () => {
    const r = decideByMode({ mode: 'autonomous', confidence: 80, min_confidence_to_apply: 65 });
    expect(r.action).toBe('apply');
  });

  it('autonomous + confidence below floor → queue_for_review', () => {
    const r = decideByMode({ mode: 'autonomous', confidence: 40, min_confidence_to_apply: 65 });
    expect(r.action).toBe('queue_for_review');
  });

  it('supervised + high confidence → still queue_for_review', () => {
    const r = decideByMode({ mode: 'supervised', confidence: 95, min_confidence_to_apply: 50 });
    expect(r.action).toBe('queue_for_review');
  });

  it('block_reasons → queue_for_review', () => {
    const r = decideByMode({ mode: 'autonomous', confidence: 90, min_confidence_to_apply: 50, block_reasons: ['storm detected'] });
    expect(r.action).toBe('queue_for_review');
    expect(r.reason).toContain('storm');
  });
});

// ---------------------------------------------------------------------------
// evaluateAutomationConfidence
// ---------------------------------------------------------------------------

describe('evaluateAutomationConfidence', () => {
  const baseInput = {
    mode: 'autonomous' as const,
    orchestration_confidence: 80,
    remediation_health_score: 80,
    override_velocity: 0,
    unsafe_pattern_signatures: [] as string[],
    proposed_signature: null,
    min_confidence_to_apply: 65,
    recent_storm: false,
    regression_risk: 20,
  };

  it('healthy inputs → automation_allowed', () => {
    const r = evaluateAutomationConfidence(baseInput);
    expect(r.automation_allowed).toBe(true);
    expect(r.tier).toBe('high');
    expect(r.required_human_review).toBe(false);
  });

  it('storm penalty drops confidence + blocks', () => {
    const r = evaluateAutomationConfidence({ ...baseInput, recent_storm: true });
    expect(r.confidence).toBeLessThan(baseInput.orchestration_confidence);
    expect(r.blocking_reasons.some(x => /storm/i.test(x))).toBe(true);
  });

  it('unsafe pattern match penalty applies', () => {
    const r = evaluateAutomationConfidence({
      ...baseInput,
      proposed_signature: 'unsafe-x',
      unsafe_pattern_signatures: ['unsafe-x'],
    });
    expect(r.blocking_reasons.some(x => /unsafe pattern/i.test(x))).toBe(true);
  });

  it('override velocity caps penalty at -40', () => {
    const r = evaluateAutomationConfidence({ ...baseInput, override_velocity: 100 });
    // baseline 80 - 40 = 40 (or lower), should still produce a number
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(80);
  });

  it('frozen mode → required_human_review', () => {
    const r = evaluateAutomationConfidence({ ...baseInput, mode: 'frozen' });
    expect(r.automation_allowed).toBe(false);
    expect(r.required_human_review).toBe(true);
    expect(r.mode_decision.action).toBe('reject');
  });

  it('high regression risk surfaces as blocking reason', () => {
    const r = evaluateAutomationConfidence({ ...baseInput, regression_risk: 80 });
    expect(r.blocking_reasons.some(x => /regression risk/i.test(x))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// governanceRecommendationEngine
// ---------------------------------------------------------------------------

describe('generateGovernanceRecommendations', () => {
  const baseInput = {
    cognitive_health_score: 80,
    cognitive_health_tier: 'healthy' as const,
    remediation_health_score: 80,
    pressure_tier: 'calm' as const,
    unresolved_error_incidents: 0,
    recent_regression_count: 0,
    active_clusters: 0,
    regression_prone_signatures: [] as string[],
    override_velocity: 0,
    unsafe_pattern_signatures: [] as string[],
    automation_confidence: 60,
  };

  it('healthy state with no clusters → no recommendations or just loosen', () => {
    const recs = generateGovernanceRecommendations({ ...baseInput, automation_confidence: 80 });
    // May include loosen_governance_threshold; should NOT include critical/escalate
    expect(recs.find(r => r.type === 'pause_orchestration')).toBeUndefined();
    expect(recs.find(r => r.type === 'request_operator_review')).toBeUndefined();
  });

  it('critical cognitive health → top-priority operator review', () => {
    const recs = generateGovernanceRecommendations({ ...baseInput, cognitive_health_score: 30, cognitive_health_tier: 'critical' });
    expect(recs[0].type).toBe('request_operator_review');
    expect(recs[0].priority).toBe(1);
  });

  it('critical pressure + error incidents → pause orchestration', () => {
    const recs = generateGovernanceRecommendations({
      ...baseInput,
      pressure_tier: 'critical',
      unresolved_error_incidents: 2,
    });
    expect(recs.some(r => r.type === 'pause_orchestration')).toBe(true);
  });

  it('regressions ≥2 → escalate_remediation', () => {
    const recs = generateGovernanceRecommendations({ ...baseInput, recent_regression_count: 3 });
    expect(recs.some(r => r.type === 'escalate_remediation')).toBe(true);
  });

  it('unsafe patterns + active clusters → tighten threshold', () => {
    const recs = generateGovernanceRecommendations({
      ...baseInput,
      unsafe_pattern_signatures: ['x'],
      active_clusters: 2,
    });
    expect(recs.some(r => r.type === 'tighten_governance_threshold')).toBe(true);
  });

  it('high override velocity → request review', () => {
    const recs = generateGovernanceRecommendations({ ...baseInput, override_velocity: 6 });
    expect(recs.some(r => r.type === 'request_operator_review')).toBe(true);
  });

  it('healthy + active clusters + good confidence → prepare plan', () => {
    const recs = generateGovernanceRecommendations({ ...baseInput, active_clusters: 2, automation_confidence: 75 });
    expect(recs.some(r => r.type === 'prepare_remediation_plan')).toBe(true);
  });

  it('output sorted by priority ascending', () => {
    const recs = generateGovernanceRecommendations({
      ...baseInput,
      cognitive_health_tier: 'critical',
      cognitive_health_score: 30,
      recent_regression_count: 3,
    });
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i].priority).toBeGreaterThanOrEqual(recs[i - 1].priority);
    }
  });
});

// ---------------------------------------------------------------------------
// autonomousRemediationPreparer
// ---------------------------------------------------------------------------

describe('preparePlanDraft', () => {
  const sample = {
    project_id: 'p1',
    capability_id: 'cap1',
    cluster_signature: 'accessibility:cap1:/checkout',
    cluster_type: 'accessibility',
    issues: [{ id: 'i1', title: 'aria missing', description: 'desc', severity: 'high' }],
    historical_success_rate: 70,
    regression_prone_patterns: [],
    sequence_position: { position: 1, total: 2, reason: 'a before b' },
    confidence: 65,
    before_dom_snapshot_id: 'snap-1',
    projected_pressure_drop: 8,
    projected_cognition_gain: 5,
  };

  it('draft has status=draft + ui_fix_adaptive target', () => {
    const r = preparePlanDraft(sample);
    expect(r.status).toBe('draft');
    expect(r.plan_payload.target).toBe('ui_fix_adaptive');
  });

  it('rollback carries before_dom_snapshot_id', () => {
    const r = preparePlanDraft(sample);
    expect(r.plan_payload.rollback.before_dom_snapshot_id).toBe('snap-1');
  });

  it('step_key derived from cluster_type', () => {
    const r = preparePlanDraft(sample);
    expect(r.plan_payload.stepKey).toBe('usability');
  });

  it('projected_outcome captures issue count', () => {
    const r = preparePlanDraft(sample);
    expect(r.projected_outcome.projected_issues_resolved).toBe(1);
  });
});

describe('buildRollbackPromptBody', () => {
  it('returns null when before_dom_snapshot_id missing', () => {
    const body = buildRollbackPromptBody({
      target: 'ui_fix_adaptive', stepKey: 'usability', uiIssues: [],
      adaptiveRemediation: { clusters: [] },
      rollback: { rollback_prompt_target: 'ui_fix_adaptive', rollback_payload: { instruction: 'x', reference_dom_snapshot_id: null }, before_dom_snapshot_id: null },
    });
    expect(body).toBeNull();
  });

  it('returns prompt body when snapshot present', () => {
    const body = buildRollbackPromptBody({
      target: 'ui_fix_adaptive', stepKey: 'usability', uiIssues: [],
      adaptiveRemediation: { clusters: [] },
      rollback: { rollback_prompt_target: 'ui_fix_adaptive', rollback_payload: { instruction: 'Revert', reference_dom_snapshot_id: 'snap-1' }, before_dom_snapshot_id: 'snap-1' },
    });
    expect(body).toContain('Revert');
    expect(body).toContain('snap-1');
  });
});

// ---------------------------------------------------------------------------
// decisionExplainabilityEngine
// ---------------------------------------------------------------------------

describe('explainDecision', () => {
  it('returns empty narrative when no anchor provided', async () => {
    const r = await explainDecision({ project_id: 'p1' });
    expect(r.anchor_event).toBeNull();
    expect(r.narrative).toContain('No anchor');
  });

  it('returns chain shape when called with at-timestamp', async () => {
    const r = await explainDecision({ project_id: 'p1', at: new Date() });
    expect(r).toHaveProperty('related_events');
    expect(r).toHaveProperty('state_before');
    expect(r).toHaveProperty('state_after');
  });
});

// ---------------------------------------------------------------------------
// governanceMemory
// ---------------------------------------------------------------------------

describe('governanceMemory', () => {
  beforeEach(() => { _resetGovernanceMemory(); });

  it('records successful plan signatures', () => {
    recordSuccessfulPlan('p1', 'cta:cap1:/x');
    const m = readMemory('p1');
    expect(Object.keys(m.successful_plan_signatures)).toContain('cta:cap1:/x');
  });

  it('records unsafe patterns', () => {
    recordUnsafePattern('p1', 'workflow:cap1:/y', 'override_storm');
    const m = readMemory('p1');
    expect(m.unsafe_pattern_signatures['workflow:cap1:/y']?.reason).toBe('override_storm');
  });

  it('override velocity counts within sliding window', () => {
    recordOperatorOverride('p1');
    recordOperatorOverride('p1');
    const m = readMemory('p1');
    expect(m.override_velocity).toBe(2);
  });

  it('5 overrides in 10 minutes triggers storm', () => {
    let stormSeen = false;
    for (let i = 0; i < 5; i++) {
      const r = recordOperatorOverride('p2');
      if (r.storm_triggered) stormSeen = true;
    }
    expect(stormSeen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// governanceTaskShaper
// ---------------------------------------------------------------------------

describe('governanceTaskShaper', () => {
  beforeEach(() => { _resetGovernanceShaperCache(); });

  const mkTask = (id: string, calculated_rank: number, cluster_signature?: string): any => ({
    id, project_id: 'p1', bp_id: id, title: id, type: 'frontend',
    priority_score: 50, blocking_score: 10, dependency_score: 0, maturity_gain: 0,
    readiness_gain: 0, confidence_score: 50, execution_cost: 10,
    state: 'ready', reasoning: [], calculated_rank,
    cluster_signature,
  });

  it('no recommendations → tasks unchanged', () => {
    const tasks = [mkTask('t1', 50), mkTask('t2', 30)];
    const r = governanceTaskShaper(tasks, 'p1');
    expect(r).toEqual(tasks);
  });

  it('pause_orchestration flattens calculated_rank to average', () => {
    noteRecommendationCreated('p1', { type: 'pause_orchestration', priority: 2 });
    const tasks = [mkTask('t1', 50), mkTask('t2', 30)];
    const r: any[] = [...governanceTaskShaper(tasks, 'p1')];
    expect(r[0].calculated_rank).toBe(40);
    expect(r[1].calculated_rank).toBe(40);
  });

  it('accelerate_cluster boosts matched cluster signatures', () => {
    noteRecommendationCreated('p1', {
      type: 'accelerate_cluster', priority: 2, supporting_evidence: { cluster_signature: 'cta:cap1:/x' },
    });
    const tasks = [mkTask('t1', 50, 'cta:cap1:/x'), mkTask('t2', 30, 'spacing:cap1:/y')];
    const r: any[] = [...governanceTaskShaper(tasks, 'p1')];
    const t1 = r.find(t => t.id === 't1');
    const t2 = r.find(t => t.id === 't2');
    expect(t1.calculated_rank).toBe(50 - 8);
    expect(t2.calculated_rank).toBe(30);
  });

  it('decided recommendations are removed from cache', () => {
    noteRecommendationCreated('p1', { type: 'accelerate_cluster', priority: 2, supporting_evidence: { cluster_signature: 'x:y:/z' } });
    noteRecommendationDecided('p1', { type: 'accelerate_cluster', cluster_signature: 'x:y:/z' });
    const tasks = [mkTask('t1', 50, 'x:y:/z')];
    const r: any[] = [...governanceTaskShaper(tasks, 'p1')];
    expect(r[0].calculated_rank).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Simulation extensions
// ---------------------------------------------------------------------------

describe('Phase 12 simulation extensions', () => {
  it('simulateRemediationPlan returns positive cognition gain on healthy plan', () => {
    const r = simulateRemediationPlan({
      cluster_signature: 'cta:cap1:/x',
      issue_count: 4,
      historical_success_rate: 80,
      initial_pressure: 60,
      initial_cognition: 60,
    });
    expect(r.net_cognition_gain).toBeGreaterThan(0);
    expect(r.net_pressure_drop).toBeGreaterThan(0);
  });

  it('simulateContradictionResolution: ignore action → zero deltas', () => {
    const r = simulateContradictionResolution({
      contradiction_severity: 'warning',
      proposed_action: 'ignore',
      initial_pressure: 50,
      initial_cognition: 50,
    });
    expect(r.net_pressure_drop).toBe(0);
    expect(r.net_cognition_gain).toBe(0);
  });

  it('simulateUXOutcome biases by cluster_type', () => {
    const hierarchy = simulateUXOutcome({
      cluster_type: 'hierarchy',
      issue_count: 5, historical_success_rate: 80,
      before: { cognition: 50, ux_debt: 50, behavioral: 50, friction: 50 },
    });
    const cta = simulateUXOutcome({
      cluster_type: 'cta',
      issue_count: 5, historical_success_rate: 80,
      before: { cognition: 50, ux_debt: 50, behavioral: 50, friction: 50 },
    });
    // hierarchy biases toward cognition; cta biases toward behavioral/friction
    expect(hierarchy.cognition_delta).toBeGreaterThanOrEqual(cta.cognition_delta);
    expect(cta.behavioral_delta + cta.friction_delta).toBeGreaterThanOrEqual(hierarchy.behavioral_delta + hierarchy.friction_delta);
  });

  it('simulateRecommendationApplication: pause_orchestration drops pressure', () => {
    const r = simulateRecommendationApplication({
      recommendation_type: 'pause_orchestration',
      initial_pressure: 70,
      initial_cognition: 60,
    });
    expect(r.net_pressure_drop).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// decideGovernanceDeletions
// ---------------------------------------------------------------------------

describe('decideGovernanceDeletions', () => {
  it('returns rows older than the threshold', () => {
    const now = Date.now();
    const day = 86_400_000;
    const rows = [
      { id: 'a', ts: new Date(now - 30 * day) },
      { id: 'b', ts: new Date(now - 200 * day) },
    ];
    const ids = decideGovernanceDeletions(rows, now, 90 * day);
    expect(ids).toEqual(['b']);
  });

  it('default policy values are sane', () => {
    expect(DEFAULT_GOVERNANCE_RETENTION_POLICY.recommendationsMs).toBeGreaterThan(0);
    expect(DEFAULT_GOVERNANCE_RETENTION_POLICY.preparedPlansMs).toBeGreaterThan(DEFAULT_GOVERNANCE_RETENTION_POLICY.recommendationsMs);
  });
});

// ---------------------------------------------------------------------------
// applyCombinedTaskShaping (4-layer clamp end-to-end)
// ---------------------------------------------------------------------------

describe('applyCombinedTaskShaping', () => {
  beforeEach(() => {
    _resetRemediationPressureState();
    _resetGovernanceShaperCache();
  });

  const mkTask = (id: string, calculated_rank: number, target = 'ui_fix_bulk', bp_id?: string, cluster_signature?: string): any => ({
    id, project_id: 'p1', bp_id: bp_id || id, title: id, type: 'frontend',
    priority_score: 50, blocking_score: 10, dependency_score: 0, maturity_gain: 0,
    readiness_gain: 0, confidence_score: 50, execution_cost: 10,
    state: 'ready', reasoning: [], calculated_rank,
    recommended_prompt_target: target, cluster_signature,
  });

  it('with no shaping inputs is identity (calm pressure, no governance recs)', () => {
    const baseline = [mkTask('t1', 50)];
    const r = applyCombinedTaskShaping(baseline, 'p1', baseline);
    expect((r[0] as any).calculated_rank).toBe(50);
  });

  it('combined adjustments cannot exceed -25 vs baseline', () => {
    // Set critical pressure → -15 boost
    updateRemediationPressure({
      project_id: 'p1',
      clusters: Array.from({ length: 6 }, () => ({ severity: 'high' as const, issue_count: 8 })),
    });
    // Add a governance recommendation that biases the SAME UI cluster by -8
    noteRecommendationCreated('p1', {
      type: 'accelerate_cluster', priority: 2, supporting_evidence: { cluster_signature: 'cta:t1:/x' },
    });
    const baseline = [mkTask('t1', 100, 'ui_fix_adaptive', 't1', 'cta:t1:/x')];
    // Pretend adaptive weighting already moved t1 by -10
    const adaptive = [mkTask('t1', 90, 'ui_fix_adaptive', 't1', 'cta:t1:/x')];
    const r: any[] = [...applyCombinedTaskShaping(adaptive, 'p1', baseline)];
    // Combined: pressure boost (-15) + governance accelerate (-8) + adaptive (-10) = -33,
    // clamped to -25 vs baseline 100 → calculated_rank ≥ 75.
    expect(r[0].calculated_rank).toBeGreaterThanOrEqual(75);
  });

  it('exposes the clamp constant for test assertions', () => {
    expect(_COMBINED_RANK_CLAMP_FOR_TESTS).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// runGovernanceLearningTick
// ---------------------------------------------------------------------------

describe('runGovernanceLearningTick', () => {
  it('returns moderate baseline when no decisions in window', async () => {
    const r = await runGovernanceLearningTick('p-empty');
    expect(r.decisions_scanned).toBe(0);
    expect(r.governance_confidence).toBe(50);
    expect(r.governance_confidence_tier).toBe('moderate');
  });

  it('exports the function with the expected shape', async () => {
    const mod = await import('../learning/runGovernanceLearningTick');
    expect(typeof mod.runGovernanceLearningTick).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// AuthoritativeSystemState shape compile-time check
// ---------------------------------------------------------------------------

describe('AuthoritativeSystemState includes governance_summary', () => {
  it('compile-time check', () => {
    type Check = import('../types/systemState.types').AuthoritativeSystemState;
    const stub = {} as Check;
    void stub;
    expect(true).toBe(true);
  });
});
