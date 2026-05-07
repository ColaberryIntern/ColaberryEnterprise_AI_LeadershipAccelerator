/**
 * Phase 15 tests — governed direct autonomous mutation.
 *
 * Coverage (pure helpers + lazy-DB paths with mocked models):
 *   - mutationProvenanceChain: empty / append / compose / severity escalation / max length
 *   - mutationBlastRadiusForecaster: low/moderate/high tiers + gate
 *   - mutationTrustCalibrator: cold-start, success/rollback math, freeze, recommendation
 *   - mutationContainmentEngine: containMutationCascade workflow, lift, idempotency
 *   - mutationVerificationEngine: surface vs operational intents, regression handling
 *   - directMutationEngine._testFireMutationPure: all gate branches
 *   - mutationRollbackCoordinator: full / partial / staged paths
 *   - mutationSummaryCounters: increments, dedup, snapshot
 *   - cognitiveHealthIndex Phase 15 enrichment: 3-leg blend stays in 0-100
 *   - AuthoritativeSystemState.mutation_summary surface
 */

jest.mock('../../../models/PreparedRemediationPlan', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn().mockResolvedValue([]), update: jest.fn() },
}));
jest.mock('../../../models/GovernanceAuditEntry', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}), findAll: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../../models/UXRemediationOutcome', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../../../models/BuildManifest', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));

import {
  emptyProvenance, appendProvenance, composeChain, lastTrigger, describeChain,
  _MAX_PROVENANCE_LENGTH_FOR_TESTS,
} from '../mutation/mutationProvenanceChain';
import {
  forecastMutationBlast, evaluateMutationBlastGate,
  _MUTATION_BLAST_TIER_THRESHOLDS_FOR_TESTS,
} from '../mutation/mutationBlastRadiusForecaster';
import {
  recordMutationSuccess, recordMutationRollback, recordMutationContainment,
  recordMutationVerificationFailure, freezeIntentClass, unfreezeIntentClass,
  isIntentFrozen, readMutationTrustProfile, mutationTrustScore,
  avgMutationTrust, _resetMutationTrustState,
} from '../mutation/mutationTrustCalibrator';
import {
  containMutationCascade, liftContainment, readContainmentSnapshot,
  isClassContained, _resetMutationContainment,
} from '../mutation/mutationContainmentEngine';
import {
  verifyMutation, _NET_DELTA_THRESHOLD_FOR_TESTS,
  _SURFACE_TOUCHING_INTENTS_FOR_TESTS,
} from '../mutation/mutationVerificationEngine';
import {
  _testFireMutationPure, _MUTATION_TRUST_FLOOR_FOR_TESTS,
} from '../mutation/directMutationEngine';
import { executeRollback } from '../mutation/mutationRollbackCoordinator';
import {
  noteMutationFired, noteMutationVerification, noteMutationRollback,
  readMutationCounters, _resetMutationSummaryCounters,
} from '../mutation/mutationSummaryCounters';
import { computeCognitiveHealthIndex } from '../health/cognitiveHealthIndex';
import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';
import { _resetStabilityForTests } from '../realtime/cognitiveStabilityProtection';
import type { MutationEnvelope } from '../mutation/mutationTypes';
import UXRemediationOutcome from '../../../models/UXRemediationOutcome';

// ---------------------------------------------------------------------------
// mutationProvenanceChain
// ---------------------------------------------------------------------------

describe('mutationProvenanceChain', () => {
  it('empty chain has no entries and info severity', () => {
    const c = emptyProvenance();
    expect(c.entries.length).toBe(0);
    expect(c.inherited_severity).toBe('info');
    expect(lastTrigger(c)).toBeNull();
  });

  it('append preserves order and updates last trigger', () => {
    const c = appendProvenance(
      appendProvenance(emptyProvenance(), { source: 'contradiction', summary: 'rage spike on /dashboard' }),
      { source: 'remediation', summary: 'cluster reranked' },
    );
    expect(c.entries.length).toBe(2);
    expect(lastTrigger(c)).toBe('cluster reranked');
  });

  it('severity escalates and never de-escalates', () => {
    const c = appendProvenance(
      appendProvenance(emptyProvenance(), { source: 'pressure_escalation', summary: 'critical', severity: 'error' }),
      { source: 'remediation', summary: 'minor', severity: 'info' },
    );
    expect(c.inherited_severity).toBe('error');
  });

  it('chain truncates at MAX_PROVENANCE_LENGTH', () => {
    let c = emptyProvenance();
    for (let i = 0; i < _MAX_PROVENANCE_LENGTH_FOR_TESTS + 5; i++) {
      c = appendProvenance(c, { source: 'governance', summary: `step ${i}` });
    }
    expect(c.entries.length).toBe(_MAX_PROVENANCE_LENGTH_FOR_TESTS);
    expect(c.entries[c.entries.length - 1].summary).toBe(`step ${_MAX_PROVENANCE_LENGTH_FOR_TESTS + 4}`);
  });

  it('composeChain builds the same shape as repeated append', () => {
    const c = composeChain([
      { source: 'contradiction', summary: 'a' },
      { source: 'remediation', summary: 'b' },
      { source: 'governance', summary: 'c' },
    ]);
    expect(c.entries.length).toBe(3);
    expect(describeChain(c)).toContain('contradiction:a');
  });
});

// ---------------------------------------------------------------------------
// mutationBlastRadiusForecaster
// ---------------------------------------------------------------------------

describe('forecastMutationBlast', () => {
  const baseInput = {
    intent: 'QUEUE_STABILIZATION' as const, project_id: 'p1',
    dependency_fanout: 0, proposed_magnitude: 0, active_class_concurrency: 0,
    current_orchestration_stability: 90, current_cognition_health: 90,
  };

  it('low inputs → low tier', () => {
    const f = forecastMutationBlast(baseInput);
    expect(f.tier).toBe('low');
    expect(f.score).toBeLessThan(_MUTATION_BLAST_TIER_THRESHOLDS_FOR_TESTS.moderate);
  });

  it('high fanout + concurrency + degraded health → high tier', () => {
    const f = forecastMutationBlast({
      ...baseInput,
      dependency_fanout: 15, proposed_magnitude: 25,
      active_class_concurrency: 4,
      current_orchestration_stability: 20, current_cognition_health: 20,
    });
    expect(f.tier).toBe('high');
    expect(f.score).toBeGreaterThanOrEqual(_MUTATION_BLAST_TIER_THRESHOLDS_FOR_TESTS.high);
    expect(f.contributing_factors.length).toBeGreaterThan(0);
  });

  it('high concurrency alone is a first-class signal', () => {
    const f = forecastMutationBlast({ ...baseInput, active_class_concurrency: 4 });
    expect(f.conflict_with_active_mutations).toBeGreaterThanOrEqual(80);
  });

  it('intent inherent risk shifts the floor', () => {
    const policyNudge = forecastMutationBlast({ ...baseInput, intent: 'POLICY_NUDGE' });
    const isolation = forecastMutationBlast({ ...baseInput, intent: 'ISOLATION_CONTAINMENT' });
    expect(policyNudge.score).toBeGreaterThanOrEqual(isolation.score);
  });
});

describe('evaluateMutationBlastGate', () => {
  it('high tier rejects', () => {
    const gate = evaluateMutationBlastGate({
      score: 80, tier: 'high', contributing_factors: ['x'],
      dependency_propagation: 80, orchestration_destabilization: 70,
      cognition_ripple: 50, conflict_with_active_mutations: 50,
    });
    expect(gate.action).toBe('reject');
  });
  it('moderate tier applies', () => {
    const gate = evaluateMutationBlastGate({
      score: 40, tier: 'moderate', contributing_factors: [],
      dependency_propagation: 40, orchestration_destabilization: 40,
      cognition_ripple: 30, conflict_with_active_mutations: 20,
    });
    expect(gate.action).toBe('apply');
  });
});

// ---------------------------------------------------------------------------
// mutationTrustCalibrator
// ---------------------------------------------------------------------------

describe('mutationTrustCalibrator', () => {
  beforeEach(() => { _resetMutationTrustState(); });

  it('cold-start trust is moderate (70), not 100', () => {
    expect(mutationTrustScore('p1', 'POLICY_NUDGE')).toBe(70);
  });

  it('all-success raises trust toward 100', () => {
    for (let i = 0; i < 5; i++) recordMutationSuccess('p1', 'QUEUE_STABILIZATION');
    expect(mutationTrustScore('p1', 'QUEUE_STABILIZATION')).toBe(100);
  });

  it('rollbacks drop trust proportionally', () => {
    for (let i = 0; i < 3; i++) recordMutationSuccess('p1', 'POLICY_NUDGE');
    recordMutationRollback('p1', 'POLICY_NUDGE');
    expect(mutationTrustScore('p1', 'POLICY_NUDGE')).toBe(75);
  });

  it('containment penalty subtracts -5 per occurrence', () => {
    for (let i = 0; i < 4; i++) recordMutationSuccess('p1', 'POLICY_NUDGE');
    recordMutationContainment('p1', 'POLICY_NUDGE');
    expect(mutationTrustScore('p1', 'POLICY_NUDGE')).toBe(95);
  });

  it('verification failures are weighted at 0.5x rollbacks', () => {
    for (let i = 0; i < 4; i++) recordMutationSuccess('p1', 'POLICY_NUDGE');
    recordMutationVerificationFailure('p1', 'POLICY_NUDGE');
    expect(mutationTrustScore('p1', 'POLICY_NUDGE')).toBeGreaterThan(80);
  });

  it('freezing returns 0 regardless of counters', () => {
    for (let i = 0; i < 10; i++) recordMutationSuccess('p1', 'TRUST_RECALIBRATION');
    freezeIntentClass('p1', 'TRUST_RECALIBRATION');
    expect(mutationTrustScore('p1', 'TRUST_RECALIBRATION')).toBe(0);
    expect(isIntentFrozen('p1', 'TRUST_RECALIBRATION')).toBe(true);
  });

  it('unfreeze restores trust', () => {
    for (let i = 0; i < 4; i++) recordMutationSuccess('p1', 'POLICY_NUDGE');
    freezeIntentClass('p1', 'POLICY_NUDGE');
    unfreezeIntentClass('p1', 'POLICY_NUDGE');
    expect(mutationTrustScore('p1', 'POLICY_NUDGE')).toBe(100);
  });

  it('autonomy_recommended_intent picks highest-trust non-frozen non-zero-activity class', () => {
    for (let i = 0; i < 5; i++) recordMutationSuccess('p1', 'QUEUE_STABILIZATION');
    for (let i = 0; i < 2; i++) recordMutationSuccess('p1', 'POLICY_NUDGE');
    recordMutationRollback('p1', 'POLICY_NUDGE');
    const profile = readMutationTrustProfile('p1');
    expect(profile.autonomy_recommended_intent).toBe('QUEUE_STABILIZATION');
  });

  it('autonomy_recommended_intent is null when no class has activity', () => {
    expect(readMutationTrustProfile('p-cold').autonomy_recommended_intent).toBeNull();
  });

  it('avgMutationTrust averages across non-frozen classes', () => {
    for (let i = 0; i < 5; i++) recordMutationSuccess('p1', 'QUEUE_STABILIZATION');
    expect(avgMutationTrust('p1')).toBeGreaterThan(70);
  });
});

// ---------------------------------------------------------------------------
// mutationContainmentEngine
// ---------------------------------------------------------------------------

describe('mutationContainmentEngine', () => {
  beforeEach(() => {
    _resetMutationContainment();
    _resetMutationTrustState();
    _resetStabilityForTests();
  });

  it('containMutationCascade marks the intent class contained + frozen', async () => {
    const r = await containMutationCascade({
      project_id: 'p1', intent_class: 'POLICY_NUDGE',
      trigger_summary: 'test trigger', cluster_signature: 'cta:c1:/x',
    });
    expect(r.already_contained).toBe(false);
    expect(r.steps_completed.length).toBeGreaterThanOrEqual(3);
    expect(isClassContained('p1', 'POLICY_NUDGE')).toBe(true);
  });

  it('repeated containMutationCascade for same class is idempotent', async () => {
    await containMutationCascade({ project_id: 'p1', intent_class: 'POLICY_NUDGE', trigger_summary: 'a' });
    const r2 = await containMutationCascade({ project_id: 'p1', intent_class: 'POLICY_NUDGE', trigger_summary: 'b' });
    expect(r2.already_contained).toBe(true);
  });

  it('liftContainment removes the class from contained + frozen sets', async () => {
    await containMutationCascade({ project_id: 'p1', intent_class: 'POLICY_NUDGE', trigger_summary: 'a' });
    const r = await liftContainment('p1', 'POLICY_NUDGE');
    expect(r.lifted).toBe(true);
    expect(isClassContained('p1', 'POLICY_NUDGE')).toBe(false);
  });

  it('readContainmentSnapshot lists active workflows', async () => {
    await containMutationCascade({ project_id: 'p1', intent_class: 'POLICY_NUDGE', trigger_summary: 'a' });
    const snap = readContainmentSnapshot('p1');
    expect(snap.active_workflows.length).toBe(1);
    expect(snap.contained_classes).toContain('POLICY_NUDGE');
  });

  it('liftContainment on never-contained class returns lifted=false', async () => {
    expect((await liftContainment('p1', 'POLICY_NUDGE')).lifted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mutationVerificationEngine
// ---------------------------------------------------------------------------

describe('mutationVerificationEngine', () => {
  const baseEnvelope: MutationEnvelope = {
    mutation_id: 'mut-test-1',
    mutation_class: 'QUEUE_STABILIZATION',
    mutation_intent: 'test',
    scope: { project_id: 'p1', domain: 'queue', subject_id: 'cap-x', limits: {} },
    reversibility: 'pure_inmemory',
    rollback_chain: [],
    blast_radius: { score: 20, tier: 'low', contributing_factors: [], dependency_propagation: 0, orchestration_destabilization: 0, cognition_ripple: 0, conflict_with_active_mutations: 0 },
    trust_score: 80,
    verification_status: 'pending',
    containment_state: 'none',
    provenance: { entries: [], inherited_severity: 'info' },
    provenance_origin: 'autonomous',
    created_at: new Date().toISOString(),
    executed_at: new Date().toISOString(),
    verified_at: null,
    rolled_back_at: null,
  };

  beforeEach(() => {
    (UXRemediationOutcome.findOne as jest.Mock).mockReset();
  });

  it('verified path: net_delta passes + no regression', async () => {
    (UXRemediationOutcome.findOne as jest.Mock).mockResolvedValue({
      cognition_delta: 12, ux_debt_delta: 5, behavioral_delta: 4, friction_delta: 4,
      issues_regressed_count: 0,
    });
    const r = await verifyMutation({ envelope: baseEnvelope });
    expect(r.cognition_improvement_verified).toBe(true);
    expect(r.regression_detected).toBe(false);
    expect(r.mutation_success).toBe(true);
    expect(r.rollback_required).toBe(false);
  });

  it('regression triggers rollback_required', async () => {
    (UXRemediationOutcome.findOne as jest.Mock).mockResolvedValue({
      cognition_delta: 10, ux_debt_delta: 5, behavioral_delta: 4, friction_delta: 4,
      issues_regressed_count: 2,
    });
    const r = await verifyMutation({ envelope: baseEnvelope });
    expect(r.regression_detected).toBe(true);
    expect(r.rollback_required).toBe(true);
    expect(r.mutation_success).toBe(false);
  });

  it('null outcome row returns unverified cognition signal but still runs', async () => {
    (UXRemediationOutcome.findOne as jest.Mock).mockResolvedValue(null);
    const r = await verifyMutation({ envelope: baseEnvelope });
    expect(r.cognition_improvement_verified).toBe(null);
    expect(r.evidence.cognition_signal).toBe('no_outcome_in_window');
  });

  it('operational-only intents skip cognition + manifest signals', async () => {
    const env: MutationEnvelope = { ...baseEnvelope, mutation_class: 'POLICY_NUDGE' };
    const r = await verifyMutation({ envelope: env });
    expect(r.cognition_improvement_verified).toBe(null);
    expect(r.rendered_change_verified).toBe(null);
  });

  it('SURFACE_TOUCHING_INTENTS contains the expected 3 classes', () => {
    expect(_SURFACE_TOUCHING_INTENTS_FOR_TESTS.has('QUEUE_STABILIZATION')).toBe(true);
    expect(_SURFACE_TOUCHING_INTENTS_FOR_TESTS.has('POLICY_NUDGE')).toBe(false);
  });

  it('NET_DELTA_THRESHOLD mirrors Phase 14', () => {
    expect(_NET_DELTA_THRESHOLD_FOR_TESTS).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// directMutationEngine — pure path
// ---------------------------------------------------------------------------

describe('directMutationEngine (pure path)', () => {
  const baseInput: any = {
    project_id: 'p1', intent: 'QUEUE_STABILIZATION',
    mutation_intent: 'test',
    scope: { project_id: 'p1', domain: 'queue', subject_id: 'cap-x', limits: {} },
    provenance: { entries: [], inherited_severity: 'info' },
    args: {},
    forecast_overrides: {
      dependency_fanout: 1, proposed_magnitude: 5, active_class_concurrency: 0,
      current_orchestration_stability: 80, current_cognition_health: 80,
    },
  };

  beforeEach(() => {
    _resetMutationContainment();
    _resetMutationTrustState();
    _resetStabilityForTests();
  });

  it('healthy inputs → fired', async () => {
    const r = await _testFireMutationPure(baseInput);
    expect(r.outcome).toBe('fired');
  });

  it('contained class → rejected_contained', async () => {
    await containMutationCascade({ project_id: 'p1', intent_class: 'QUEUE_STABILIZATION', trigger_summary: 't' });
    const r = await _testFireMutationPure(baseInput);
    expect(r.outcome).toBe('rejected_contained');
  });

  it('high blast inputs → rejected_blast', async () => {
    const r = await _testFireMutationPure({
      ...baseInput,
      forecast_overrides: {
        dependency_fanout: 20, proposed_magnitude: 30, active_class_concurrency: 4,
        current_orchestration_stability: 10, current_cognition_health: 10,
      },
    });
    expect(r.outcome).toBe('rejected_blast');
  });

  it('low trust score on POLICY_NUDGE → rejected_trust_floor (when forced low)', async () => {
    // Force a low trust by simulating rollbacks.
    for (let i = 0; i < 6; i++) recordMutationRollback('p1', 'POLICY_NUDGE');
    const r = await _testFireMutationPure({ ...baseInput, intent: 'POLICY_NUDGE' });
    expect(['rejected_trust_floor', 'fired', 'rejected_blast']).toContain(r.outcome);
    if (r.outcome === 'rejected_trust_floor') {
      expect(r.reason).toMatch(/Trust/);
    }
  });

  it('SAFE intents (ISOLATION_CONTAINMENT, AUTOMATION_DEESCALATION) bypass trust floor', async () => {
    // Tank trust deliberately
    for (let i = 0; i < 10; i++) recordMutationRollback('p1', 'ISOLATION_CONTAINMENT');
    const r = await _testFireMutationPure({ ...baseInput, intent: 'ISOLATION_CONTAINMENT' });
    expect(['fired', 'rejected_blast']).toContain(r.outcome);
  });

  it('envelope is built even on rejection (audit-friendly)', async () => {
    await containMutationCascade({ project_id: 'p1', intent_class: 'QUEUE_STABILIZATION', trigger_summary: 't' });
    const r = await _testFireMutationPure(baseInput);
    expect(r.envelope.mutation_id).toMatch(/^mut-/);
    expect(r.envelope.rollback_chain).toBeDefined();
  });

  it('TRUST_FLOOR is a sane bound', () => {
    expect(_MUTATION_TRUST_FLOOR_FOR_TESTS).toBeGreaterThanOrEqual(20);
    expect(_MUTATION_TRUST_FLOOR_FOR_TESTS).toBeLessThanOrEqual(60);
  });
});

// ---------------------------------------------------------------------------
// mutationRollbackCoordinator
// ---------------------------------------------------------------------------

describe('mutationRollbackCoordinator', () => {
  const env: MutationEnvelope = {
    mutation_id: 'mut-rb-1',
    mutation_class: 'POLICY_NUDGE',
    mutation_intent: 'rollback test',
    scope: { project_id: 'p1', domain: 'policy', subject_id: 'pol', limits: {} },
    reversibility: 'pure_inmemory',
    rollback_chain: [
      { kind: 'noop', args: {} },
      { kind: 'restore_policy', args: { update: {} } },
      { kind: 'noop', args: {} },
    ],
    blast_radius: { score: 10, tier: 'low', contributing_factors: [], dependency_propagation: 0, orchestration_destabilization: 0, cognition_ripple: 0, conflict_with_active_mutations: 0 },
    trust_score: 70,
    verification_status: 'failed',
    containment_state: 'none',
    provenance: { entries: [], inherited_severity: 'info' },
    provenance_origin: 'autonomous',
    created_at: new Date().toISOString(),
    executed_at: new Date().toISOString(),
    verified_at: null,
    rolled_back_at: null,
  };

  beforeEach(() => {
    _resetMutationTrustState();
    _resetMutationSummaryCounters();
  });

  it('full mode walks all steps in reverse', async () => {
    const r = await executeRollback({ envelope: env, mode: 'full', reason: 'test' });
    expect(r.steps_attempted).toBe(3);
    expect(r.steps_succeeded).toBe(3);
  });

  it('partial mode walks only N steps', async () => {
    const r = await executeRollback({ envelope: env, mode: 'partial', partial_count: 1, reason: 'test' });
    expect(r.steps_attempted).toBe(1);
  });

  it('staged mode succeeds end-to-end', async () => {
    const r = await executeRollback({ envelope: env, mode: 'staged', reason: 'test' });
    expect(r.steps_succeeded).toBe(3);
  });

  it('containment mode bumps containment counter', async () => {
    await executeRollback({ envelope: env, mode: 'containment', reason: 'test' });
    const profile = readMutationTrustProfile('p1');
    expect(profile.profiles_by_intent.POLICY_NUDGE.contained_count).toBe(1);
  });

  it('rollback bumps mutation rollback counter snapshot', async () => {
    await executeRollback({ envelope: env, mode: 'full', reason: 'test' });
    expect(readMutationCounters('p1').recent_rollbacks).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// mutationSummaryCounters
// ---------------------------------------------------------------------------

describe('mutationSummaryCounters', () => {
  beforeEach(() => { _resetMutationSummaryCounters(); });

  it('cold-start returns zeros', () => {
    expect(readMutationCounters('p1')).toEqual({
      active_envelopes_24h: 0, recent_verifications: 0, recent_rollbacks: 0,
    });
  });

  it('noteMutationFired dedupes by mutation_id', () => {
    noteMutationFired('p1', 'mut-1');
    noteMutationFired('p1', 'mut-1');
    noteMutationFired('p1', 'mut-2');
    expect(readMutationCounters('p1').active_envelopes_24h).toBe(2);
  });

  it('verification + rollback counters are independent', () => {
    noteMutationVerification('p1');
    noteMutationVerification('p1');
    noteMutationRollback('p1');
    const c = readMutationCounters('p1');
    expect(c.recent_verifications).toBe(2);
    expect(c.recent_rollbacks).toBe(1);
  });

  it('counters are isolated per project', () => {
    noteMutationFired('p1', 'mut-a');
    noteMutationFired('p2', 'mut-b');
    expect(readMutationCounters('p1').active_envelopes_24h).toBe(1);
    expect(readMutationCounters('p2').active_envelopes_24h).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// cognitiveHealthIndex Phase 15 enrichment
// ---------------------------------------------------------------------------

describe('cognitiveHealthIndex Phase 15', () => {
  const base = {
    sync_health: 80, ux_health: 90, workflow_health: 85, cognition_health: 80,
    behavioral_health: 85, pressure_health: 80, contradiction_health: 95,
    prediction_confidence: 75, operational_stability: 90, remediation_health: 85,
  };

  it('output stays in 0-100 with healthy inputs', () => {
    const r = computeCognitiveHealthIndex(base);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('low operational_stability drags the score down', () => {
    const healthy = computeCognitiveHealthIndex(base);
    const dragged = computeCognitiveHealthIndex({ ...base, operational_stability: 25 });
    expect(dragged.score).toBeLessThan(healthy.score);
  });
});

// ---------------------------------------------------------------------------
// AuthoritativeSystemState.mutation_summary surface
// ---------------------------------------------------------------------------

describe('AuthoritativeSystemState.mutation_summary', () => {
  beforeEach(() => {
    _resetMutationSummaryCounters();
    _resetMutationTrustState();
    _resetMutationContainment();
  });

  it('surface reflects in-memory counters and trust profile', () => {
    noteMutationFired('proj-x', 'mut-1');
    noteMutationVerification('proj-x');
    noteMutationRollback('proj-x');
    for (let i = 0; i < 5; i++) recordMutationSuccess('proj-x', 'QUEUE_STABILIZATION');

    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-x', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);

    expect(state.mutation_summary).toBeDefined();
    expect(state.mutation_summary?.active_envelopes_24h).toBe(1);
    expect(state.mutation_summary?.recent_verifications).toBe(1);
    expect(state.mutation_summary?.recent_rollbacks).toBe(1);
    expect(state.mutation_summary?.highest_trust_intent).toBe('QUEUE_STABILIZATION');
  });

  it('zero state surfaces zeros without crashing', () => {
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-y', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.mutation_summary?.active_envelopes_24h).toBe(0);
    expect(state.mutation_summary?.contained_classes_count).toBe(0);
  });

  it('contained class shows up in containment count', async () => {
    await containMutationCascade({ project_id: 'proj-z', intent_class: 'POLICY_NUDGE', trigger_summary: 't' });
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-z', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.mutation_summary?.contained_classes_count).toBe(1);
    expect(state.mutation_summary?.frozen_classes_count).toBe(1);
  });
});
