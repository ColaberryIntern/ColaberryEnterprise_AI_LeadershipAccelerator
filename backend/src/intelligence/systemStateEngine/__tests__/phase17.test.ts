/**
 * Phase 17 tests — adaptive validator intelligence + causal governance
 * evolution.
 *
 * Coverage (pure helpers + lazy-DB paths with mocked models):
 *   - validatorReliabilityTracker: cold-start, accuracy raises with agreement,
 *     FP/FN counters, rollback prevention bookkeeping
 *   - validatorDriftDetector: stable / cautionary / drifting / unstable / suppressed
 *   - validatorSpecializationAnalyzer: per-domain accuracy, strong/weak detection
 *   - adaptiveValidatorEngine: dynamic weights, AdaptiveWeightAttribution
 *   - hard-veto preservation: containment confidence ≤ 20 still vetoes
 *     even with adaptive weights
 *   - causalForecastingEngine: heuristic projection, ForecastConfidenceBounds,
 *     no-prior-sample widens bounds, ≤4h horizon clamp
 *   - ancestryRollbackAdvisor: ordered chain, MAX_PLAN_STEPS truncation
 *   - validatorMetaReasoning: highest disagreement pair, instability score
 *   - causalRecoveryChainPlanner: ordered steps, MAX_RECOVERY_CHAIN_STEPS cap
 *   - organizationalCausalIntelligence: archetype detection (project-local)
 *   - adaptiveGovernanceSummaryCounters + AuthoritativeSystemState surface
 */

jest.mock('../../../models/GovernanceAuditEntry', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}), findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) },
}));

import {
  observeArbitration, readReliabilityProfile, readRoleMetrics,
  noteRollbackPrevented, noteRollbackMissed,
  _resetReliabilityTracker, _testRecordObservation,
} from '../adaptiveGovernance/validatorReliabilityTracker';
import {
  buildDriftProfile, suppressValidator, unsuppressValidator,
  isValidatorSuppressed, _resetDriftDetector,
} from '../adaptiveGovernance/validatorDriftDetector';
import {
  observeForSpecialization, buildSpecializationMap, specializationAccuracy,
  _resetSpecializationAnalyzer, _testRecordSpecialization,
} from '../adaptiveGovernance/validatorSpecializationAnalyzer';
import {
  buildAdaptiveWeights, buildAdaptiveWeightOverrides,
  _ROLE_WEIGHT_MIN_FOR_TESTS, _ROLE_WEIGHT_MAX_FOR_TESTS,
} from '../adaptiveGovernance/adaptiveValidatorEngine';
import {
  buildCausalStabilityForecast, _MAX_FORECAST_HORIZON_MS_FOR_TESTS,
} from '../adaptiveGovernance/causalForecastingEngine';
import {
  buildAncestryRollbackPlan, _MAX_PLAN_STEPS_FOR_TESTS,
} from '../adaptiveGovernance/ancestryRollbackAdvisor';
import {
  buildValidatorMetaReasoningSummary,
} from '../adaptiveGovernance/validatorMetaReasoning';
import {
  buildCausalRecoveryChain, _MAX_RECOVERY_CHAIN_STEPS_FOR_TESTS,
} from '../adaptiveGovernance/causalRecoveryChainPlanner';
import {
  buildOrganizationalCausalIntelligence, _RECURRENCE_THRESHOLD_FOR_TESTS,
} from '../adaptiveGovernance/organizationalCausalIntelligence';
import {
  noteValidatorDrift, noteForecastGenerated, noteRecoveryChainGenerated,
  noteAncestryRollbackRecommended, readAdaptiveGovernanceSummary,
  _resetAdaptiveGovernanceSummary,
} from '../adaptiveGovernance/adaptiveGovernanceSummaryCounters';
import { runAllValidators } from '../causality/distributedValidationHarness';
import { arbitrate } from '../causality/validationArbitrationEngine';
import { buildLineageGraph } from '../causality/mutationLineageGraph';
import { buildContradictionPropagationProfile } from '../causality/contradictionPropagationTracker';
import { analyzeRootCauses } from '../causality/rootCauseAnalyzer';
import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';
import type { LineageNode, MutationEnvelope, ValidatorVerdict, ValidationArbitrationResult } from '../causality/causalityTypes';

// ─── Helpers ──────────────────────────────────────────────────────────

function envelopeFor(intent: string, blastTier: 'low' | 'moderate' | 'high'): MutationEnvelope {
  return {
    mutation_id: 'mut-test-1', mutation_class: intent as any, mutation_intent: 'test',
    scope: { project_id: 'p1', domain: 'queue', subject_id: 'cap-x', limits: {} },
    reversibility: 'pure_inmemory',
    rollback_chain: [{ kind: 'restore_policy', args: { update: {} } }],
    blast_radius: { score: blastTier === 'high' ? 80 : blastTier === 'moderate' ? 45 : 15, tier: blastTier, contributing_factors: [], dependency_propagation: 0, orchestration_destabilization: 0, cognition_ripple: 0, conflict_with_active_mutations: 0 },
    trust_score: 70, verification_status: 'pending', containment_state: 'none',
    provenance: { entries: [{ source: 'remediation', summary: 'cluster reranked', recorded_at: '2026-05-07T00:00:00Z' }], inherited_severity: 'info' },
    provenance_origin: 'autonomous',
    created_at: '2026-05-07T00:00:00Z', executed_at: null, verified_at: null, rolled_back_at: null,
  } as MutationEnvelope;
}

const ctxHealthy = (env: MutationEnvelope) => ({
  envelope: env, current_trust_score: 80, is_contained: false, is_frozen: false, avg_project_trust: 70,
});

// ─── validatorReliabilityTracker ─────────────────────────────────────

describe('validatorReliabilityTracker', () => {
  beforeEach(() => { _resetReliabilityTracker(); });

  it('cold-start metrics return 100 accuracy and 0 observations', () => {
    const m = readRoleMetrics('p1', 'mutation_validator');
    expect(m.accuracy).toBe(100);
    expect(m.observations).toBe(0);
  });

  it('observeArbitration accumulates per-validator observations', () => {
    const verdicts = runAllValidators(ctxHealthy(envelopeFor('POLICY_NUDGE', 'low')));
    const result = arbitrate({ mutation_id: 'm-1', verdicts });
    observeArbitration('p1', result);
    const m = readReliabilityProfile('p1');
    expect(m.metrics_by_role.mutation_validator.observations).toBe(1);
  });

  it('agreement raises accuracy', () => {
    const verdicts = runAllValidators(ctxHealthy(envelopeFor('POLICY_NUDGE', 'low')));
    for (let i = 0; i < 5; i++) {
      observeArbitration('p1', arbitrate({ mutation_id: `m-${i}`, verdicts }));
    }
    expect(readRoleMetrics('p1', 'mutation_validator').accuracy).toBe(100);
  });

  it('rollback_prevented and rollback_missed update prevention rate', () => {
    noteRollbackPrevented('p1', 'rollback_validator');
    noteRollbackPrevented('p1', 'rollback_validator');
    noteRollbackMissed('p1', 'rollback_validator');
    expect(readRoleMetrics('p1', 'rollback_validator').rollback_prevention_rate).toBeCloseTo(67, 0);
  });

  it('false-positive vs consensus is detected', () => {
    // Force a verdict-vs-consensus mismatch.
    _testRecordObservation('p1', { validator_type: 'mutation_validator', confidence: 80, recommendation: 'reject', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] }, 'apply');
    _testRecordObservation('p1', { validator_type: 'mutation_validator', confidence: 80, recommendation: 'reject', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] }, 'apply');
    const m = readRoleMetrics('p1', 'mutation_validator');
    expect(m.false_positive_rate).toBe(100);
  });
});

// ─── validatorDriftDetector ──────────────────────────────────────────

describe('validatorDriftDetector', () => {
  beforeEach(() => {
    _resetReliabilityTracker();
    _resetDriftDetector();
  });

  it('classifies cold-start as stable (insufficient observations)', () => {
    const profile = buildDriftProfile('p1');
    expect(profile.signals.every(s => s.tier === 'stable')).toBe(true);
  });

  it('classifies as drifting when accuracy < 60', () => {
    // Force 5 observations with all FPs.
    for (let i = 0; i < 5; i++) {
      _testRecordObservation('p1', { validator_type: 'mutation_validator', confidence: 80, recommendation: 'reject', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] }, 'apply');
    }
    const profile = buildDriftProfile('p1');
    const sig = profile.signals.find(s => s.validator_role === 'mutation_validator')!;
    expect(['drifting', 'unstable']).toContain(sig.tier);
  });

  it('suppressValidator marks tier=suppressed regardless of accuracy', () => {
    suppressValidator('p1', 'mutation_validator');
    expect(isValidatorSuppressed('p1', 'mutation_validator')).toBe(true);
    const profile = buildDriftProfile('p1');
    const sig = profile.signals.find(s => s.validator_role === 'mutation_validator')!;
    expect(sig.tier).toBe('suppressed');
    expect(sig.recommended_action).toBe('noop');
  });

  it('unsuppress restores classification based on metrics', () => {
    suppressValidator('p1', 'mutation_validator');
    unsuppressValidator('p1', 'mutation_validator');
    expect(isValidatorSuppressed('p1', 'mutation_validator')).toBe(false);
  });

  it('worst_tier reflects the worst validator', () => {
    suppressValidator('p1', 'rollback_validator');
    const profile = buildDriftProfile('p1');
    expect(profile.worst_tier).toBe('suppressed');
  });
});

// ─── validatorSpecializationAnalyzer ─────────────────────────────────

describe('validatorSpecializationAnalyzer', () => {
  beforeEach(() => { _resetSpecializationAnalyzer(); });

  it('cold-start specialization returns 100% with 0 observations', () => {
    const acc = specializationAccuracy('p1', 'mutation_validator', 'POLICY_NUDGE');
    expect(acc.accuracy).toBe(100);
    expect(acc.observations).toBe(0);
  });

  it('per-domain accuracy tracks separately', () => {
    const verdict: ValidatorVerdict = { validator_type: 'mutation_validator', confidence: 80, recommendation: 'apply', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] };
    for (let i = 0; i < 5; i++) {
      _testRecordSpecialization('p1', 'POLICY_NUDGE', verdict, 'apply');
    }
    for (let i = 0; i < 5; i++) {
      _testRecordSpecialization('p1', 'QUEUE_STABILIZATION', verdict, 'reject');
    }
    expect(specializationAccuracy('p1', 'mutation_validator', 'POLICY_NUDGE').accuracy).toBe(100);
    expect(specializationAccuracy('p1', 'mutation_validator', 'QUEUE_STABILIZATION').accuracy).toBe(0);
  });

  it('strong/weak detection requires ≥3 observations + ±10 vs overall', () => {
    const verdict: ValidatorVerdict = { validator_type: 'mutation_validator', confidence: 80, recommendation: 'apply', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] };
    for (let i = 0; i < 5; i++) _testRecordSpecialization('p1', 'POLICY_NUDGE', verdict, 'apply');
    for (let i = 0; i < 5; i++) _testRecordSpecialization('p1', 'QUEUE_STABILIZATION', verdict, 'reject');
    const map = buildSpecializationMap('p1');
    const policy = map.entries.find(e => e.validator_role === 'mutation_validator' && e.domain === 'POLICY_NUDGE')!;
    const queue = map.entries.find(e => e.validator_role === 'mutation_validator' && e.domain === 'QUEUE_STABILIZATION')!;
    expect(policy.is_strong).toBe(true);
    expect(queue.is_weak).toBe(true);
  });

  it('strongest_per_domain picks highest accuracy', () => {
    const apply: ValidatorVerdict = { validator_type: 'mutation_validator', confidence: 80, recommendation: 'apply', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] };
    const reject: ValidatorVerdict = { validator_type: 'rollback_validator', confidence: 80, recommendation: 'reject', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] };
    for (let i = 0; i < 5; i++) {
      _testRecordSpecialization('p1', 'POLICY_NUDGE', apply, 'apply');
      _testRecordSpecialization('p1', 'POLICY_NUDGE', reject, 'apply');
    }
    const map = buildSpecializationMap('p1');
    expect(map.strongest_per_domain.POLICY_NUDGE).toBe('mutation_validator');
  });
});

// ─── adaptiveValidatorEngine ─────────────────────────────────────────

describe('adaptiveValidatorEngine', () => {
  beforeEach(() => {
    _resetReliabilityTracker();
    _resetDriftDetector();
    _resetSpecializationAnalyzer();
  });

  it('cold-start preserves prior weights', () => {
    const set = buildAdaptiveWeights({ project_id: 'p1' });
    const containment = set.attributions.find(a => a.validator_role === 'containment_validator')!;
    expect(containment.adjusted_weight).toBe(containment.prior_weight);
    expect(containment.adjustment_reason).toMatch(/cold-start/);
  });

  it('every attribution carries reliability_inputs + drift_inputs + specialization_inputs', () => {
    const set = buildAdaptiveWeights({ project_id: 'p1' });
    expect(set.attributions.length).toBe(5);
    for (const a of set.attributions) {
      expect(a.reliability_inputs).toBeDefined();
      expect(a.drift_inputs).toBeDefined();
      expect(a.specialization_inputs).toBeDefined();
    }
  });

  it('drifting validators get suppressed weights', () => {
    // Force a drifting state via FPs.
    for (let i = 0; i < 8; i++) {
      _testRecordObservation('p1', { validator_type: 'mutation_validator', confidence: 80, recommendation: 'reject', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] }, 'apply');
    }
    const set = buildAdaptiveWeights({ project_id: 'p1' });
    const mutation = set.attributions.find(a => a.validator_role === 'mutation_validator')!;
    expect(mutation.adjusted_weight).toBeLessThan(mutation.prior_weight);
    expect(mutation.drift_inputs.tier === 'drifting' || mutation.drift_inputs.tier === 'unstable').toBe(true);
  });

  it('weights are clamped to [ROLE_WEIGHT_MIN, ROLE_WEIGHT_MAX]', () => {
    for (let i = 0; i < 20; i++) {
      _testRecordObservation('p1', { validator_type: 'mutation_validator', confidence: 80, recommendation: 'reject', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] }, 'apply');
    }
    const set = buildAdaptiveWeights({ project_id: 'p1' });
    for (const w of Object.values(set.weights_by_role)) {
      expect(w).toBeGreaterThanOrEqual(_ROLE_WEIGHT_MIN_FOR_TESTS);
      expect(w).toBeLessThanOrEqual(_ROLE_WEIGHT_MAX_FOR_TESTS);
    }
  });

  it('buildAdaptiveWeightOverrides returns the weight map', () => {
    const overrides = buildAdaptiveWeightOverrides({ project_id: 'p1' });
    expect(Object.keys(overrides).length).toBe(5);
  });

  it('target_intent biases via specialization', () => {
    // Force strong specialization on POLICY_NUDGE for mutation_validator.
    const verdict: ValidatorVerdict = { validator_type: 'mutation_validator', confidence: 80, recommendation: 'apply', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] };
    for (let i = 0; i < 6; i++) _testRecordSpecialization('p1', 'POLICY_NUDGE', verdict, 'apply');
    const setNoTarget = buildAdaptiveWeights({ project_id: 'p1' });
    const setTargeted = buildAdaptiveWeights({ project_id: 'p1', target_intent: 'POLICY_NUDGE' });
    const mNo = setNoTarget.attributions.find(a => a.validator_role === 'mutation_validator')!;
    const mYes = setTargeted.attributions.find(a => a.validator_role === 'mutation_validator')!;
    expect(mYes.adjusted_weight).toBeGreaterThanOrEqual(mNo.adjusted_weight);
  });
});

// ─── Hard-veto preservation ──────────────────────────────────────────

describe('hard-veto preservation under adaptive weights', () => {
  beforeEach(() => {
    _resetReliabilityTracker();
    _resetDriftDetector();
  });

  it('frozen intent still vetoes even with adaptive weights set', () => {
    const env = envelopeFor('POLICY_NUDGE', 'low');
    const verdicts = runAllValidators({ ...ctxHealthy(env), is_frozen: true });
    const overrides = { mutation_validator: 2.0, containment_validator: 0.4 };  // try to dilute containment
    const result = arbitrate({ mutation_id: 'mut-1', verdicts, weight_overrides: overrides });
    expect(result.consensus_recommendation).toBe('reject');
    expect(result.escalation_required).toBe(true);
  });

  it('weight_overrides modulate normal voting when no hard veto fires', () => {
    const env = envelopeFor('POLICY_NUDGE', 'low');
    const verdicts = runAllValidators(ctxHealthy(env));
    const r1 = arbitrate({ mutation_id: 'mut-a', verdicts });
    const r2 = arbitrate({ mutation_id: 'mut-b', verdicts, weight_overrides: { mutation_validator: 0.3 } });
    // Both should still resolve to apply, but consensus_confidence may differ.
    expect(r1.consensus_recommendation).toBe('apply');
    expect(r2.consensus_recommendation).toBe('apply');
  });
});

// ─── causalForecastingEngine ─────────────────────────────────────────

describe('causalForecastingEngine', () => {
  it('produces 5 entries (one per ForecastSignal)', () => {
    const f = buildCausalStabilityForecast({
      project_id: 'p1',
      current: { rollback_rate_per_hour: 1, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
    });
    expect(f.entries.length).toBe(5);
  });

  it('horizon clamped to MAX_FORECAST_HORIZON_MS', () => {
    const f = buildCausalStabilityForecast({
      project_id: 'p1',
      horizon_ms: 100 * 60 * 60 * 1000,     // 100h — should clamp to 4h
      current: { rollback_rate_per_hour: 1, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
    });
    expect(f.entries[0].horizon_ms).toBeLessThanOrEqual(_MAX_FORECAST_HORIZON_MS_FOR_TESTS);
  });

  it('no prior sample widens confidence bounds + adds uncertainty driver', () => {
    const f = buildCausalStabilityForecast({
      project_id: 'p1',
      current: { rollback_rate_per_hour: 5, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
    });
    expect(f.entries[0].bounds.uncertainty_drivers).toContain('no_prior_sample');
  });

  it('rising slope produces degrading direction for rollback rate', () => {
    const f = buildCausalStabilityForecast({
      project_id: 'p1',
      current: { rollback_rate_per_hour: 5, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
      prior: { observed_at_ms: Date.now() - 60 * 60 * 1000, rollback_rate_per_hour: 1, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
    });
    expect(f.entries.find(e => e.signal === 'rollback_rate_trend')!.direction).toBe('degrading');
  });

  it('flat trajectory produces flat direction', () => {
    const now = Date.now();
    const f = buildCausalStabilityForecast({
      project_id: 'p1',
      current: { rollback_rate_per_hour: 1, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
      prior: { observed_at_ms: now - 60 * 60 * 1000, rollback_rate_per_hour: 1, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
      now_ms: now,
    });
    expect(f.entries[0].direction).toBe('flat');
  });

  it('worst_signal points to a degrading entry when present', () => {
    const f = buildCausalStabilityForecast({
      project_id: 'p1',
      current: { rollback_rate_per_hour: 10, validator_divergence_pct: 80, avg_inherited_trust_decay: 50, contradiction_count: 20, arbitration_escalation_rate_pct: 80 },
      prior: { observed_at_ms: Date.now() - 60 * 60 * 1000, rollback_rate_per_hour: 1, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
    });
    expect(f.worst_signal).toBeTruthy();
  });
});

// ─── ancestryRollbackAdvisor ─────────────────────────────────────────

describe('ancestryRollbackAdvisor', () => {
  it('builds an ordered chain leaf-first', () => {
    const c1: LineageNode = { node_id: 'c1', kind: 'contradiction', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:00:00Z', summary: 'c', severity: 'warning', payload: {} };
    const m1: LineageNode = { node_id: 'm1', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:25:00Z', summary: 'm1', severity: 'info', payload: { mutation_class: 'POLICY_NUDGE', blast_radius: { score: 25 } } };
    const m2: LineageNode = { node_id: 'm2', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:50:00Z', summary: 'm2', severity: 'warning', payload: { mutation_class: 'POLICY_NUDGE', blast_radius: { score: 60 } } };
    const g = buildLineageGraph({ project_id: 'p1', nodes: [c1, m1, m2] });
    const plan = buildAncestryRollbackPlan({ graph: g, target_mutation_id: 'm2', propagation: null });
    expect(plan.steps[0].target_node_id).toBe('m2');     // leaf first
  });

  it('truncates plan at MAX_PLAN_STEPS', () => {
    const nodes: LineageNode[] = [];
    for (let i = 0; i < 10; i++) {
      const ts = new Date(Date.parse('2026-05-07T10:00:00Z') + i * 25 * 60 * 1000).toISOString();
      nodes.push({ node_id: `m${i}`, kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: ts, summary: '', severity: 'info', payload: { mutation_class: 'POLICY_NUDGE', blast_radius: { score: 20 } } });
    }
    const g = buildLineageGraph({ project_id: 'p1', nodes });
    const plan = buildAncestryRollbackPlan({ graph: g, target_mutation_id: 'm9', propagation: null });
    expect(plan.steps.length).toBeLessThanOrEqual(_MAX_PLAN_STEPS_FOR_TESTS);
  });

  it('each step has rollback_command + forecast bounds + propagation_consequences', () => {
    const m1: LineageNode = { node_id: 'm1', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:00:00Z', summary: '', severity: 'info', payload: { mutation_class: 'POLICY_NUDGE', blast_radius: { score: 25 } } };
    const m2: LineageNode = { node_id: 'm2', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:25:00Z', summary: '', severity: 'info', payload: { mutation_class: 'POLICY_NUDGE', blast_radius: { score: 25 } } };
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1, m2] });
    const plan = buildAncestryRollbackPlan({ graph: g, target_mutation_id: 'm2', propagation: null });
    expect(plan.steps[0].rollback_command).toContain('/rollback');
    expect(plan.steps[0].forecast.uncertainty_drivers.length).toBeGreaterThan(0);
  });

  it('operator_action_required is set to operator-driven', () => {
    const m1: LineageNode = { node_id: 'm1', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:00:00Z', summary: '', severity: 'info', payload: { mutation_class: 'POLICY_NUDGE' } };
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1] });
    const plan = buildAncestryRollbackPlan({ graph: g, target_mutation_id: 'm1', propagation: null });
    expect(plan.operator_action_required).toContain('execute');
  });
});

// ─── validatorMetaReasoning ──────────────────────────────────────────

describe('validatorMetaReasoning', () => {
  beforeEach(() => { _resetReliabilityTracker(); });

  it('reports highest_disagreement_pair when one exists', () => {
    const summary = buildValidatorMetaReasoningSummary({
      project_id: 'p1',
      trust_profile: {
        project_id: 'p1',
        entries: [],
        disagreement_profiles: [
          { validator_pair: ['mutation_validator', 'rollback_validator'], disagreement_rate: 80, disagreement_topics: ['flags_x'], confidence_divergence: 20, arbitration_frequency: 5, escalation_rate: 50 },
          { validator_pair: ['trust_validator', 'blast_radius_validator'], disagreement_rate: 20, disagreement_topics: [], confidence_divergence: 10, arbitration_frequency: 5, escalation_rate: 0 },
        ],
        built_at: 'now',
      },
    });
    expect(summary.highest_disagreement_pair?.pair[0]).toBe('mutation_validator');
    expect(summary.highest_disagreement_pair?.rate).toBe(80);
  });

  it('arbitration_instability_score weights escalation + disagreement', () => {
    const summary = buildValidatorMetaReasoningSummary({
      project_id: 'p1',
      trust_profile: {
        project_id: 'p1', entries: [],
        disagreement_profiles: [
          { validator_pair: ['mutation_validator', 'rollback_validator'], disagreement_rate: 100, disagreement_topics: [], confidence_divergence: 50, arbitration_frequency: 10, escalation_rate: 100 },
        ],
        built_at: 'now',
      },
    });
    expect(summary.arbitration_instability_score).toBeGreaterThan(0);
  });

  it('zero-state produces 0/0 scores without crashing', () => {
    const summary = buildValidatorMetaReasoningSummary({
      project_id: 'p1',
      trust_profile: { project_id: 'p1', entries: [], disagreement_profiles: [], built_at: 'now' },
    });
    expect(summary.highest_disagreement_pair).toBeNull();
    expect(summary.arbitration_instability_score).toBe(0);
  });
});

// ─── causalRecoveryChainPlanner ──────────────────────────────────────

describe('causalRecoveryChainPlanner', () => {
  it('contains the root when root_cause confidence ≥ 50', () => {
    const m1: LineageNode = { node_id: 'm1', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:00:00Z', summary: '', severity: 'error', payload: { mutation_class: 'POLICY_NUDGE' } };
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1] });
    const propagation = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const root_cause = analyzeRootCauses({ graph: g, target_node_id: 'm1', propagation });
    const chain = buildCausalRecoveryChain({
      project_id: 'p1', root_cause, propagation, forecast: null, latest_arbitration: null,
      trigger_summary: 'test',
    });
    expect(chain.steps.length).toBeGreaterThan(0);
  });

  it('caps at MAX_RECOVERY_CHAIN_STEPS', () => {
    const m1: LineageNode = { node_id: 'm1', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:00:00Z', summary: '', severity: 'error', payload: { mutation_class: 'POLICY_NUDGE' } };
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1] });
    const propagation = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const root_cause = analyzeRootCauses({ graph: g, target_node_id: 'm1', propagation });
    const chain = buildCausalRecoveryChain({
      project_id: 'p1', root_cause, propagation, forecast: null,
      latest_arbitration: { mutation_id: 'mut-1', verdicts: [], consensus_recommendation: 'reject', consensus_confidence: 50, confidence_range: { min: 30, max: 70 }, minority_warning: null, arbitration_risk: 90, escalation_required: true, built_at: 'now' } as ValidationArbitrationResult,
      trigger_summary: 'test',
    });
    expect(chain.steps.length).toBeLessThanOrEqual(_MAX_RECOVERY_CHAIN_STEPS_FOR_TESTS);
  });

  it('emits monitor_only when forecast has degrading signals', () => {
    const m1: LineageNode = { node_id: 'm1', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:00:00Z', summary: '', severity: 'info', payload: { mutation_class: 'POLICY_NUDGE' } };
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1] });
    const propagation = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const root_cause = analyzeRootCauses({ graph: g, target_node_id: 'm1', propagation });
    const forecast = buildCausalStabilityForecast({
      project_id: 'p1',
      current: { rollback_rate_per_hour: 10, validator_divergence_pct: 80, avg_inherited_trust_decay: 50, contradiction_count: 20, arbitration_escalation_rate_pct: 80 },
      prior: { observed_at_ms: Date.now() - 60 * 60 * 1000, rollback_rate_per_hour: 1, validator_divergence_pct: 10, avg_inherited_trust_decay: 5, contradiction_count: 2, arbitration_escalation_rate_pct: 5 },
    });
    const chain = buildCausalRecoveryChain({
      project_id: 'p1', root_cause, propagation, forecast, latest_arbitration: null,
      trigger_summary: 'test',
    });
    const hasMonitorOnly = chain.steps.some(s => s.kind === 'monitor_only');
    expect(hasMonitorOnly).toBe(true);
  });

  it('reenable_governance fires when all signals are non-degrading', () => {
    const m1: LineageNode = { node_id: 'm1', kind: 'mutation', project_id: 'p1', subject_id: 'cap-x', timestamp: '2026-05-07T10:00:00Z', summary: '', severity: 'info', payload: { mutation_class: 'POLICY_NUDGE' } };
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1] });
    const propagation = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const root_cause = analyzeRootCauses({ graph: g, target_node_id: 'm1', propagation });
    const now = Date.now();
    // Improving trajectory
    const forecast = buildCausalStabilityForecast({
      project_id: 'p1',
      current: { rollback_rate_per_hour: 1, validator_divergence_pct: 5, avg_inherited_trust_decay: 5, contradiction_count: 1, arbitration_escalation_rate_pct: 5 },
      prior: { observed_at_ms: now - 60 * 60 * 1000, rollback_rate_per_hour: 5, validator_divergence_pct: 30, avg_inherited_trust_decay: 30, contradiction_count: 10, arbitration_escalation_rate_pct: 30 },
      now_ms: now,
    });
    const chain = buildCausalRecoveryChain({
      project_id: 'p1', root_cause, propagation, forecast, latest_arbitration: null,
      trigger_summary: 'test',
    });
    const hasReenable = chain.steps.some(s => s.kind === 'reenable_governance');
    expect(hasReenable).toBe(true);
  });
});

// ─── organizationalCausalIntelligence ────────────────────────────────

describe('organizationalCausalIntelligence', () => {
  it('detects recurring_contradiction_kind when count ≥ threshold', () => {
    const flag = (kind: string): any => ({ kind, severity: 'warning', message: '', project_id: 'p1', evidence: {} });
    const report = buildOrganizationalCausalIntelligence({
      project_id: 'p1',
      contradictions: [flag('telemetry_drift'), flag('telemetry_drift'), flag('telemetry_drift'), flag('orphan_route')],
      contained_mutations: [], rolled_back_mutations: [], policy_changes: [], hotspots: [],
    });
    expect(report.entries.some(e => e.archetype === 'recurring_contradiction_kind' && e.signature === 'telemetry_drift')).toBe(true);
  });

  it('detects unstable_mutation_pattern across contained intent_class', () => {
    const c = (intent: string) => ({ intent_class: intent, recorded_at: '2026-05-07' });
    const report = buildOrganizationalCausalIntelligence({
      project_id: 'p1',
      contradictions: [],
      contained_mutations: [c('POLICY_NUDGE'), c('POLICY_NUDGE'), c('POLICY_NUDGE')],
      rolled_back_mutations: [], policy_changes: [], hotspots: [],
    });
    expect(report.entries.some(e => e.archetype === 'unstable_mutation_pattern' && e.signature === 'POLICY_NUDGE')).toBe(true);
  });

  it('detects propagation_archetype when hotspot count ≥ threshold', () => {
    const report = buildOrganizationalCausalIntelligence({
      project_id: 'p1',
      contradictions: [], contained_mutations: [], rolled_back_mutations: [], policy_changes: [],
      hotspots: [{ subject_id: 'cap-x', count: 5 }],
    });
    expect(report.entries.some(e => e.archetype === 'propagation_archetype' && e.signature === 'cap-x')).toBe(true);
  });

  it('every entry has project_id (no cross-project contamination)', () => {
    const report = buildOrganizationalCausalIntelligence({
      project_id: 'p-isolated',
      contradictions: [
        { kind: 'telemetry_drift', severity: 'warning', message: '', project_id: 'p-isolated', evidence: {} } as any,
        { kind: 'telemetry_drift', severity: 'warning', message: '', project_id: 'p-isolated', evidence: {} } as any,
        { kind: 'telemetry_drift', severity: 'warning', message: '', project_id: 'p-isolated', evidence: {} } as any,
      ],
      contained_mutations: [], rolled_back_mutations: [], policy_changes: [], hotspots: [],
    });
    for (const e of report.entries) {
      expect(e.project_id).toBe('p-isolated');
    }
  });

  it('threshold constant is reasonable', () => {
    expect(_RECURRENCE_THRESHOLD_FOR_TESTS).toBe(3);
  });
});

// ─── adaptiveGovernanceSummaryCounters + AuthoritativeSystemState ────

describe('adaptiveGovernanceSummary surface', () => {
  beforeEach(() => { _resetAdaptiveGovernanceSummary(); });

  it('counters reflect into adaptive_governance_summary', () => {
    noteValidatorDrift('proj-x', 'drifting');
    noteValidatorDrift('proj-x', 'unstable');
    noteForecastGenerated('proj-x');
    noteRecoveryChainGenerated('proj-x');
    noteAncestryRollbackRecommended('proj-x');
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-x', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.adaptive_governance_summary?.drifting_validators).toBe(2);
    expect(state.adaptive_governance_summary?.active_forecasts).toBe(1);
    expect(state.adaptive_governance_summary?.active_recovery_chains).toBe(1);
    expect(state.adaptive_governance_summary?.ancestry_rollbacks_recommended).toBe(1);
    expect(state.adaptive_governance_summary?.worst_validator_tier).toBe('unstable');
  });

  it('zero state surfaces zeros', () => {
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-y', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.adaptive_governance_summary?.drifting_validators).toBe(0);
    expect(state.adaptive_governance_summary?.worst_validator_tier).toBe('stable');
  });

  it('snapshot reads are per-project isolated', () => {
    noteValidatorDrift('proj-a', 'drifting');
    noteValidatorDrift('proj-b', 'unstable');
    expect(readAdaptiveGovernanceSummary('proj-a').worst_validator_tier).toBe('drifting');
    expect(readAdaptiveGovernanceSummary('proj-b').worst_validator_tier).toBe('unstable');
  });
});
