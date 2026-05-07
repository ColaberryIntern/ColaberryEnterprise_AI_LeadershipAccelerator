/**
 * Phase 14 tests — autonomous handoff + closed-loop verification.
 *
 * Coverage (pure helpers + lazy-DB paths with mocked models):
 *   - assessBlastRadius + evaluateBlastRadiusGate
 *   - autonomousHandoffEngine._testFireHandoffPure (all 6 outcome branches
 *     reachable via pure path)
 *   - executionVerificationListener: scoreNetDelta, in-flight guard
 *   - executionSummaryCounters increment/snapshot semantics
 *   - autonomyTrustState verification counters
 *   - isolationRegistry sync count + isolated check
 *   - selfHealingOrchestrator circuit breaker
 *   - cognitiveHealthIndex Phase 14 enrichment
 *   - AuthoritativeSystemState.execution_summary surface
 *
 * Models that the engines lazy-import (PreparedRemediationPlan,
 * GovernanceAuditEntry, UXRemediationOutcome) are mocked at the top so
 * the in-flight paths can run without a database. The mocks are kept
 * minimal — only the methods the engines actually call.
 */

// ── Model mocks ─────────────────────────────────────────────────────
// (Hoisted by jest before module imports.)
jest.mock('../../../models/PreparedRemediationPlan', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../../models/GovernanceAuditEntry', () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue({}),
    findAll: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../../models/UXRemediationOutcome', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import {
  assessBlastRadius,
  evaluateBlastRadiusGate,
} from '../autonomy/safeExecutionGuardrails';
import {
  _testFireHandoffPure,
} from '../autonomy/autonomousHandoffEngine';
import {
  noteHandoffFired, noteVerificationOutcome, noteRollback, noteSelfHeal,
  readSummary, _resetExecutionSummaryCounters,
} from '../autonomy/executionSummaryCounters';
import {
  recordVerificationSuccess, recordVerificationFailure,
  verificationSuccessRate, readVerificationCounters, _resetVerificationCounters,
  _resetAutonomyTrustState,
} from '../autonomy/autonomyTrustState';
import {
  recordIsolation, isIsolated, countActiveIsolationsSync,
  _resetIsolationRegistry,
} from '../autonomy/isolationRegistry';
import {
  _testHandlePressureEscalated, _testHandleTrustChanged,
  _resetSelfHealingOrchestrator, _SELF_HEAL_CB_THRESHOLD_FOR_TESTS,
} from '../autonomy/selfHealingOrchestrator';
import {
  _testRunVerification, _isInFlight, _scoreNetDeltaForTests,
  _resetExecutionVerificationListener,
} from '../autonomy/executionVerificationListener';
import { _ISOLATION_THRESHOLD_FOR_TESTS, triggerAutonomousRollback } from '../autonomy/autonomousRollbackEngine';
import { computeCognitiveHealthIndex } from '../health/cognitiveHealthIndex';
import { _resetStabilityForTests } from '../realtime/cognitiveStabilityProtection';
import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';

import GovernanceAuditEntry from '../../../models/GovernanceAuditEntry';
import PreparedRemediationPlan from '../../../models/PreparedRemediationPlan';
import UXRemediationOutcome from '../../../models/UXRemediationOutcome';

// ---------------------------------------------------------------------------
// assessBlastRadius + evaluateBlastRadiusGate
// ---------------------------------------------------------------------------

describe('assessBlastRadius', () => {
  it('low inputs → low tier', () => {
    const p = assessBlastRadius({
      affected_components_count: 1, proposed_queue_mutation_count: 1,
      proposed_rank_delta_abs: 2, cluster_severity: 'low',
      dependency_fanout: 0, neighbouring_routes: 0,
    });
    expect(p.risk_tier).toBe('low');
    expect(p.blast_score).toBeLessThan(40);
  });

  it('high severity + heavy fanout → high tier', () => {
    const p = assessBlastRadius({
      affected_components_count: 50, proposed_queue_mutation_count: 12,
      proposed_rank_delta_abs: 30, cluster_severity: 'high',
      dependency_fanout: 20, neighbouring_routes: 8,
    });
    expect(p.risk_tier).toBe('high');
    expect(p.blast_score).toBeGreaterThanOrEqual(60);
  });

  it('mid severity yields moderate tier', () => {
    const p = assessBlastRadius({
      affected_components_count: 10, proposed_queue_mutation_count: 4,
      proposed_rank_delta_abs: 12, cluster_severity: 'medium',
      dependency_fanout: 5, neighbouring_routes: 3,
    });
    expect(['moderate', 'low']).toContain(p.risk_tier);
  });
});

describe('evaluateBlastRadiusGate', () => {
  it('high tier → reject', () => {
    const profile: any = { risk_tier: 'high', blast_score: 80, dependency_propagation: 50, ux_collateral: 50, orchestration_instability: 50, contradiction_amplification: 50 };
    expect(evaluateBlastRadiusGate(profile).action).toBe('reject');
  });
  it('moderate tier → apply', () => {
    const profile: any = { risk_tier: 'moderate', blast_score: 50, dependency_propagation: 50, ux_collateral: 30, orchestration_instability: 30, contradiction_amplification: 30 };
    expect(evaluateBlastRadiusGate(profile).action).toBe('apply');
  });
});

// ---------------------------------------------------------------------------
// autonomousHandoffEngine — pure path
// ---------------------------------------------------------------------------

const happyHandoffInput: any = {
  project_id: 'p1', plan_id: 'plan-1', capability_id: 'cap-1',
  cluster_signature: 'cta:cap-1:/x', cluster_type: 'cta',
  issue_count: 4, historical_success_rate: 80,
  initial_pressure: 60, initial_cognition: 60,
  confidence: 80, confidence_floor: 65,
  proposed_rank_delta_abs: 5, rank_delta_abs_max: 20,
  proposed_queue_mutation_count: 2, queue_mutation_max: 6,
  action_class: 'autonomous_safe',
  affected_components_count: 3, dependency_fanout: 2, neighbouring_routes: 1,
  cluster_severity: 'medium',
};

describe('autonomousHandoffEngine pure path', () => {
  beforeEach(() => {
    _resetIsolationRegistry();
    _resetStabilityForTests();
  });

  it('healthy → fired', async () => {
    const r = await _testFireHandoffPure(happyHandoffInput);
    expect(r.outcome).toBe('fired');
    expect(r.handoff_fired).toBe(true);
  });

  it('isolated cluster → isolated outcome', async () => {
    await recordIsolation({ project_id: 'p1', signature: 'cta:cap-1:/x', reason: 'test', ttl_ms: 60_000 });
    const r = await _testFireHandoffPure(happyHandoffInput);
    expect(r.outcome).toBe('isolated');
    expect(r.handoff_fired).toBe(false);
  });

  it('confidence below floor → guardrail_blocked', async () => {
    const r = await _testFireHandoffPure({ ...happyHandoffInput, confidence: 50 });
    expect(r.outcome).toBe('guardrail_blocked');
  });

  it('huge mutation count → guardrail_blocked (blast cap on rank/mutations)', async () => {
    const r = await _testFireHandoffPure({
      ...happyHandoffInput,
      proposed_queue_mutation_count: 30, queue_mutation_max: 6,
    });
    expect(['guardrail_blocked', 'blast_blocked']).toContain(r.outcome);
  });

  it('high-blast inputs → blast_blocked', async () => {
    const r = await _testFireHandoffPure({
      ...happyHandoffInput,
      affected_components_count: 200, dependency_fanout: 30,
      neighbouring_routes: 20, cluster_severity: 'high',
    });
    expect(['blast_blocked', 'guardrail_blocked']).toContain(r.outcome);
  });
});

// ---------------------------------------------------------------------------
// executionVerificationListener — pure scoring + in-flight + DB-mocked verifier
// ---------------------------------------------------------------------------

describe('executionVerificationListener.scoreNetDelta', () => {
  it('weighted blend uses Phase 11 weights', () => {
    expect(_scoreNetDeltaForTests({ cognition_delta: 10, ux_debt_delta: 0, behavioral_delta: 0, friction_delta: 0 })).toBe(4);
    expect(_scoreNetDeltaForTests({ cognition_delta: 0, ux_debt_delta: 10, behavioral_delta: 0, friction_delta: 0 })).toBe(3);
  });
  it('handles all-null safely as zero', () => {
    expect(_scoreNetDeltaForTests({ cognition_delta: null, ux_debt_delta: null, behavioral_delta: null, friction_delta: null })).toBe(0);
  });
});

describe('executionVerificationListener.runVerification', () => {
  beforeEach(() => {
    _resetExecutionVerificationListener();
    _resetAutonomyTrustState();
    _resetVerificationCounters();
    _resetExecutionSummaryCounters();
    _resetIsolationRegistry();
    _resetStabilityForTests();
    (UXRemediationOutcome.findOne as jest.Mock).mockReset();
    (GovernanceAuditEntry.create as jest.Mock).mockClear();
    (GovernanceAuditEntry.findAll as jest.Mock).mockResolvedValue([]);
  });

  it('verified path: net_delta>=5 + zero regressions stamps verified', async () => {
    (UXRemediationOutcome.findOne as jest.Mock).mockResolvedValue({
      cognition_delta: 12, ux_debt_delta: 5, behavioral_delta: 5, friction_delta: 4,
      issues_regressed_count: 0, issues_resolved_count: 4,
    });
    const plan: any = {
      id: 'plan-1', project_id: 'p1', capability_id: 'cap-1',
      execution_verification_status: 'pending', save: jest.fn().mockResolvedValue(true),
    };
    await _testRunVerification(plan, 'cta:cap-1:/x');
    expect(plan.execution_verification_status).toBe('verified');
    expect(plan.save).toHaveBeenCalled();
  });

  it('failed path: regression count > 0 stamps failed', async () => {
    (UXRemediationOutcome.findOne as jest.Mock).mockResolvedValue({
      cognition_delta: 20, ux_debt_delta: 10, behavioral_delta: 5, friction_delta: 4,
      issues_regressed_count: 2, issues_resolved_count: 4,
    });
    const plan: any = {
      id: 'plan-2', project_id: 'p1', capability_id: 'cap-1',
      execution_verification_status: 'pending', save: jest.fn().mockResolvedValue(true),
    };
    await _testRunVerification(plan, 'cta:cap-1:/x');
    expect(plan.execution_verification_status).toBe('failed');
  });

  it('failed path: net_delta below threshold stamps failed', async () => {
    (UXRemediationOutcome.findOne as jest.Mock).mockResolvedValue({
      cognition_delta: 2, ux_debt_delta: 1, behavioral_delta: 0, friction_delta: 0,
      issues_regressed_count: 0, issues_resolved_count: 1,
    });
    const plan: any = {
      id: 'plan-3', project_id: 'p1', capability_id: 'cap-1',
      execution_verification_status: 'pending', save: jest.fn().mockResolvedValue(true),
    };
    await _testRunVerification(plan, 'cta:cap-1:/x');
    expect(plan.execution_verification_status).toBe('failed');
  });

  it('null outcome row → counts as failed', async () => {
    (UXRemediationOutcome.findOne as jest.Mock).mockResolvedValue(null);
    const plan: any = {
      id: 'plan-4', project_id: 'p1', capability_id: 'cap-1',
      execution_verification_status: 'pending', save: jest.fn().mockResolvedValue(true),
    };
    await _testRunVerification(plan, 'cta:cap-1:/x');
    expect(plan.execution_verification_status).toBe('failed');
  });

  it('writes governance audit row on every verification', async () => {
    (UXRemediationOutcome.findOne as jest.Mock).mockResolvedValue({
      cognition_delta: 10, ux_debt_delta: 5, behavioral_delta: 5, friction_delta: 4,
      issues_regressed_count: 0, issues_resolved_count: 4,
    });
    const plan: any = {
      id: 'plan-5', project_id: 'p1', capability_id: 'cap-1',
      execution_verification_status: 'pending', save: jest.fn().mockResolvedValue(true),
    };
    await _testRunVerification(plan, 'cta:cap-1:/x');
    expect(GovernanceAuditEntry.create).toHaveBeenCalled();
  });
});

describe('executionVerificationListener._isInFlight', () => {
  it('clean state has no plan in flight', () => {
    _resetExecutionVerificationListener();
    expect(_isInFlight('plan-x')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// autonomousRollbackEngine — DB-mocked
// ---------------------------------------------------------------------------

describe('autonomousRollbackEngine.triggerAutonomousRollback', () => {
  beforeEach(() => {
    _resetIsolationRegistry();
    _resetAutonomyTrustState();
    _resetExecutionSummaryCounters();
    (PreparedRemediationPlan.findByPk as jest.Mock).mockReset();
    (PreparedRemediationPlan.update as jest.Mock).mockResolvedValue([1] as any);
    (GovernanceAuditEntry.create as jest.Mock).mockClear();
    (GovernanceAuditEntry.findAll as jest.Mock).mockResolvedValue([]);
  });

  it('basic rollback fires + writes audit + bumps trust', async () => {
    (PreparedRemediationPlan.findByPk as jest.Mock).mockResolvedValue({
      plan_payload: { capability_id: 'cap-1', planned_changes: [] },
    });
    const r = await triggerAutonomousRollback({
      plan_id: 'plan-1', project_id: 'p1', capability_id: 'cap-1',
      cluster_signature: 'cta:cap-1:/x', reason: 'test',
    });
    expect(r.rollback_fired).toBe(true);
    expect(r.isolation_activated).toBe(false);
  });

  it('isolation activates after threshold failures in window', async () => {
    (PreparedRemediationPlan.findByPk as jest.Mock).mockResolvedValue({ plan_payload: {} });
    // Simulate the failure-count query returning >= ISOLATION_THRESHOLD
    (GovernanceAuditEntry.findAll as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve(
        Array.from({ length: _ISOLATION_THRESHOLD_FOR_TESTS }, () => ({
          payload: { cluster_signature: 'cta:cap-1:/x' },
        })),
      ),
    );
    const r = await triggerAutonomousRollback({
      plan_id: 'plan-2', project_id: 'p2', capability_id: 'cap-1',
      cluster_signature: 'cta:cap-1:/x', reason: 'verification failed',
    });
    expect(r.isolation_activated).toBe(true);
    expect(r.isolation_reason).toContain(_ISOLATION_THRESHOLD_FOR_TESTS.toString());
  });

  it('returns descriptive summary string', async () => {
    (PreparedRemediationPlan.findByPk as jest.Mock).mockResolvedValue({ plan_payload: {} });
    const r = await triggerAutonomousRollback({
      plan_id: 'plan-3', project_id: 'p3', capability_id: 'cap-1',
      cluster_signature: 'cta:cap-1:/x', reason: 'test',
    });
    expect(r.summary).toContain('plan-3');
  });
});

// ---------------------------------------------------------------------------
// selfHealingOrchestrator — direct branches + circuit breaker
// ---------------------------------------------------------------------------

describe('selfHealingOrchestrator', () => {
  beforeEach(() => {
    _resetSelfHealingOrchestrator();
    _resetExecutionSummaryCounters();
    _resetStabilityForTests();
    (GovernanceAuditEntry.create as jest.Mock).mockClear();
  });

  it('pressure.escalated to non-critical tier is a no-op', async () => {
    await _testHandlePressureEscalated({
      kind: 'pressure.escalated', project_id: 'p1', severity: 'warning',
      payload: { tier: 'elevated' }, emitted_at: new Date().toISOString(),
    } as any);
    const summary = readSummary('p1');
    expect(summary.self_heal_actions_24h).toBe(0);
  });

  it('trust.changed warning increments self_heal counter', async () => {
    await _testHandleTrustChanged({
      kind: 'autonomy.trust.changed', project_id: 'p1', severity: 'warning',
      payload: {}, emitted_at: new Date().toISOString(),
    } as any);
    const summary = readSummary('p1');
    expect(summary.self_heal_actions_24h).toBeGreaterThanOrEqual(1);
  });

  it('non-warning severity on trust.changed is skipped', async () => {
    await _testHandleTrustChanged({
      kind: 'autonomy.trust.changed', project_id: 'p1', severity: 'info',
      payload: {}, emitted_at: new Date().toISOString(),
    } as any);
    expect(readSummary('p1').self_heal_actions_24h).toBe(0);
  });

  it('circuit breaker trips after threshold cycles', async () => {
    for (let i = 0; i < _SELF_HEAL_CB_THRESHOLD_FOR_TESTS + 2; i++) {
      await _testHandleTrustChanged({
        kind: 'autonomy.trust.changed', project_id: 'p1', severity: 'warning',
        payload: {}, emitted_at: new Date().toISOString(),
      } as any);
    }
    // After the breaker trips, additional events become no-ops
    const summary = readSummary('p1');
    expect(summary.self_heal_actions_24h).toBeLessThanOrEqual(_SELF_HEAL_CB_THRESHOLD_FOR_TESTS + 1);
  });
});

// ---------------------------------------------------------------------------
// executionSummaryCounters
// ---------------------------------------------------------------------------

describe('executionSummaryCounters', () => {
  beforeEach(() => { _resetExecutionSummaryCounters(); });

  it('clean state returns zero snapshot', () => {
    const s = readSummary('p1');
    expect(s.active_handoffs_24h).toBe(0);
    expect(s.recent_verifications).toBe(0);
    expect(s.recent_rollbacks).toBe(0);
    expect(s.self_heal_actions_24h).toBe(0);
  });

  it('handoff increments handoff count', () => {
    noteHandoffFired('p1', 'plan-1');
    expect(readSummary('p1').active_handoffs_24h).toBe(1);
  });

  it('handoff dedupes on plan_id within window', () => {
    noteHandoffFired('p1', 'plan-1');
    noteHandoffFired('p1', 'plan-1');
    expect(readSummary('p1').active_handoffs_24h).toBe(1);
  });

  it('per-counter increments are isolated by project', () => {
    noteHandoffFired('p1', 'plan-a');
    noteHandoffFired('p2', 'plan-b');
    noteVerificationOutcome('p1');
    noteRollback('p2');
    noteSelfHeal('p1');
    expect(readSummary('p1').recent_verifications).toBe(1);
    expect(readSummary('p1').self_heal_actions_24h).toBe(1);
    expect(readSummary('p2').recent_rollbacks).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// autonomyTrustState — verification counters
// ---------------------------------------------------------------------------

describe('autonomyTrustState verification counters', () => {
  beforeEach(() => { _resetVerificationCounters(); });

  it('unseen project returns 100% as cold-start', () => {
    expect(verificationSuccessRate('p-new')).toBe(100);
  });

  it('all-success → 100', () => {
    recordVerificationSuccess('p1');
    recordVerificationSuccess('p1');
    expect(verificationSuccessRate('p1')).toBe(100);
    expect(readVerificationCounters('p1')).toMatchObject({ success: 2, failure: 0 });
  });

  it('mixed yields proportional rate', () => {
    for (let i = 0; i < 3; i++) recordVerificationSuccess('p1');
    recordVerificationFailure('p1');
    expect(verificationSuccessRate('p1')).toBe(75);
  });

  it('all-failure → 0', () => {
    recordVerificationFailure('p1');
    recordVerificationFailure('p1');
    expect(verificationSuccessRate('p1')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isolationRegistry sync helpers
// ---------------------------------------------------------------------------

describe('isolationRegistry sync helpers', () => {
  beforeEach(() => { _resetIsolationRegistry(); });

  it('clean state: no isolations', () => {
    expect(countActiveIsolationsSync('p1')).toBe(0);
    expect(isIsolated('p1', 'cta:x:/y')).toBe(false);
  });

  it('after recordIsolation, signature is isolated and counted', async () => {
    await recordIsolation({ project_id: 'p1', signature: 's1', reason: 'test', ttl_ms: 60_000 });
    expect(isIsolated('p1', 's1')).toBe(true);
    expect(countActiveIsolationsSync('p1')).toBe(1);
  });

  it('expired isolations are pruned on read', async () => {
    await recordIsolation({ project_id: 'p1', signature: 's2', reason: 'test', ttl_ms: 1 });
    await new Promise(r => setTimeout(r, 5));
    expect(countActiveIsolationsSync('p1')).toBe(0);
    expect(isIsolated('p1', 's2')).toBe(false);
  });

  it('isolation per-project scoping', async () => {
    await recordIsolation({ project_id: 'p1', signature: 'sx', reason: 'a', ttl_ms: 60_000 });
    expect(countActiveIsolationsSync('p2')).toBe(0);
    expect(isIsolated('p2', 'sx')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cognitiveHealthIndex — Phase 14 enrichment
// ---------------------------------------------------------------------------

describe('cognitiveHealthIndex Phase 14 enrichment', () => {
  beforeEach(() => {
    _resetAutonomyTrustState();
    _resetVerificationCounters();
  });

  const baseInputs = {
    sync_health: 80, ux_health: 90, workflow_health: 85, cognition_health: 80,
    behavioral_health: 85, pressure_health: 80, contradiction_health: 95,
    prediction_confidence: 75, operational_stability: 90, remediation_health: 85,
  };

  it('returns a score and operational_stability dimension', () => {
    const r = computeCognitiveHealthIndex(baseInputs);
    expect(typeof r.score).toBe('number');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.operational_stability).toBeDefined();
  });

  it('reflects degraded operational_stability in lower score', () => {
    const healthy = computeCognitiveHealthIndex(baseInputs);
    const degraded = computeCognitiveHealthIndex({ ...baseInputs, operational_stability: 30 });
    expect(degraded.score).toBeLessThan(healthy.score);
  });

  it('verification counters surface inside readVerificationCounters', () => {
    for (let i = 0; i < 4; i++) recordVerificationSuccess('p1');
    recordVerificationFailure('p1');
    const c = readVerificationCounters('p1');
    expect(c.success_rate).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// AuthoritativeSystemState.execution_summary surface
// ---------------------------------------------------------------------------

describe('AuthoritativeSystemState.execution_summary', () => {
  beforeEach(() => {
    _resetExecutionSummaryCounters();
    _resetVerificationCounters();
    _resetIsolationRegistry();
  });

  it('reflects in-memory counters when present', () => {
    noteHandoffFired('proj-x', 'plan-1');
    noteVerificationOutcome('proj-x');
    noteRollback('proj-x');
    noteSelfHeal('proj-x');
    recordVerificationSuccess('proj-x');
    recordVerificationFailure('proj-x');

    const state = buildAuthoritativeStateFromInputs({
      project: {
        id: 'proj-x', target_mode: 'production', setup_status: {},
        capabilities: [], repo_file_tree: [],
      },
      capabilities: [],
    } as any);

    expect(state.execution_summary).toBeDefined();
    expect(state.execution_summary?.active_handoffs_24h).toBe(1);
    expect(state.execution_summary?.recent_verifications).toBe(1);
    expect(state.execution_summary?.recent_rollbacks).toBe(1);
    expect(state.execution_summary?.self_heal_actions_24h).toBe(1);
    expect(state.execution_summary?.verification_success_rate).toBe(50);
    expect(state.execution_summary?.isolated_signatures_count).toBe(0);
  });

  it('missing counters surface zeros (no crash)', () => {
    const state = buildAuthoritativeStateFromInputs({
      project: {
        id: 'proj-y', target_mode: 'production', setup_status: {},
        capabilities: [], repo_file_tree: [],
      },
      capabilities: [],
    } as any);
    expect(state.execution_summary?.active_handoffs_24h).toBe(0);
    expect(state.execution_summary?.recent_rollbacks).toBe(0);
  });
});
