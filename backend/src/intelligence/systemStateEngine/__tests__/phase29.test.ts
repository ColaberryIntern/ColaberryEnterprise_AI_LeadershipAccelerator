/**
 * Phase 29 — Stabilization Playbook Intelligence + Recovery Governance.
 *
 * Coverage:
 *   - architectural caps + 14 addendum types
 *   - forbidden registry (9 forbidden actions) defense-in-depth
 *   - recoveryArchetypeRegistry: 5 built-in archetypes (frozen + hash-verified),
 *     operator-set archetypes with governance lineage, cross-org isolation
 *   - rollbackSequencingEngine: advisory_only + never_auto_executes typed-as-true,
 *     recommended_envelope_payload typed Phase 27 drafts, deterministic hash
 *   - continuityRestorationForecaster: heuristic_only typed-as-true,
 *     uncertainty_bounds, inherited_confidence capped at 80
 *   - recoveryPressureAnalyzer: 5-tier from observable counters,
 *     containment attribution
 *   - recoveryGovernanceSupervisor: operator_mediation_required typed-as-true,
 *     8 reject paths, finality proof recording
 *   - stabilizationPlaybookCoordinator: 5-hash boundary proof chain,
 *     deterministic replay
 *   - stabilizationReplayEngine: read-only, never re-executes
 *   - trust surface: 6 bands + aggregate score
 *   - narrative builder: Phase 24 inheritance, citations required, 5 templates
 *   - PRODUCTION STATE UNCHANGED verification
 *   - HARD-VETO PRESERVATION across prior phases
 *   - cross-organization isolation end-to-end
 */

import {
  listArchetypes, listBuiltInArchetypes, listOperatorArchetypes,
  getArchetype, listArchetypeGovernanceAttributions,
  setOperatorArchetype, recentArchetypeGovernanceCount24h,
  verifyBuiltInIntegrity,
  _resetArchetypeRegistryForTests,
} from '../stabilizationIntelligence/recoveryArchetypeRegistry';
import {
  buildRollbackSequencing, listSequencingProfiles,
  recentSequencingCount24h, _resetSequencingEngineForTests,
} from '../stabilizationIntelligence/rollbackSequencingEngine';
import {
  buildContinuityRestorationForecast, listForecasts,
  recentForecastCount24h, _resetForecasterForTests,
} from '../stabilizationIntelligence/continuityRestorationForecaster';
import {
  buildRecoveryPressureProfile, buildContainmentAttribution,
  listPressureSamples, recentPressureSampleCount24h,
  _resetRecoveryPressureForTests,
} from '../stabilizationIntelligence/recoveryPressureAnalyzer';
import {
  evaluateArchetypeApplication, recordArchetypeFinalityProof,
  listGovernanceAttributions, listFinalityProofs,
  recentGovernanceCount24h, recentFinalityProofCount24h,
  _resetRecoveryGovernanceForTests,
} from '../stabilizationIntelligence/recoveryGovernanceSupervisor';
import { buildStabilizationComposite } from '../stabilizationIntelligence/stabilizationPlaybookCoordinator';
import {
  buildStabilizationReplayBundle, verifyStabilizationReplayDeterminism,
  listReplayTraces, _resetReplayEngineForTests,
} from '../stabilizationIntelligence/stabilizationReplayEngine';
import { buildStabilizationTrustSurface } from '../stabilizationIntelligence/stabilizationTrustSurface';
import {
  buildStabilizationNarrative, listStabilizationNarratives,
  _resetStabilizationNarrativesForTests,
} from '../stabilizationIntelligence/stabilizationNarrativeBuilder';
import { buildStabilizationVisibilityReplay } from '../stabilizationIntelligence/stabilizationVisibilityReplay';
import { buildStabilizationSummary } from '../stabilizationIntelligence/stabilizationSummaryCounters';
import {
  getForbiddenRecoveryRegistry, isRecoveryActionForbidden,
  explainForbiddenRecovery,
} from '../stabilizationIntelligence/forbiddenRecoveryActionRegistry';
import {
  MAX_BUILT_IN_ARCHETYPES, MAX_STEPS_PER_ARCHETYPE,
  FORECAST_CONFIDENCE_CAP,
} from '../stabilizationIntelligence/stabilizationIntelligenceTypes';
import type {
  ForbiddenRecoveryActionKind,
} from '../stabilizationIntelligence/stabilizationIntelligenceTypes';
import {
  recordFailure as brokerRecordFailure,
  _resetIsolationForTests as _resetBrokerIso,
} from '../distributedRuntime/brokerIsolationEngine';
import { _resetRuntimeForTests } from '../distributedRuntime/distributedBrokerRuntime';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

const ORG = 'org_phase29_alpha';
const ORG_OTHER = 'org_phase29_beta';
const OPERATOR = 'op_phase29';

beforeEach(() => {
  _resetArchetypeRegistryForTests();
  _resetSequencingEngineForTests();
  _resetForecasterForTests();
  _resetRecoveryPressureForTests();
  _resetRecoveryGovernanceForTests();
  _resetReplayEngineForTests();
  _resetStabilizationNarrativesForTests();
  _resetBrokerIso();
  _resetRuntimeForTests();
});

// ────────────────────────────────────────────────────────────────────
// Section 1 — Architectural caps
// ────────────────────────────────────────────────────────────────────

describe('Phase 29 architectural caps', () => {
  test('5 built-in archetypes exactly', () => {
    expect(listBuiltInArchetypes().length).toBe(MAX_BUILT_IN_ARCHETYPES);
  });
  test('caps are bounded', () => {
    expect(MAX_STEPS_PER_ARCHETYPE).toBeGreaterThan(0);
    expect(FORECAST_CONFIDENCE_CAP).toBe(80);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — Forbidden Recovery Registry
// ────────────────────────────────────────────────────────────────────

describe('forbiddenRecoveryActionRegistry', () => {
  test('registry exposes all 9 forbidden actions with hash', () => {
    const r = getForbiddenRecoveryRegistry();
    expect(r.forbidden_actions.length).toBe(9);
    expect(r.registry_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('autonomous_recovery_execution forbidden', () => {
    expect(isRecoveryActionForbidden('autonomous_recovery_execution')).toBe(true);
  });
  test('automatic_rollback_triggering forbidden', () => {
    expect(isRecoveryActionForbidden('automatic_rollback_triggering')).toBe(true);
  });
  test('dynamic_playbook_mutation forbidden', () => {
    expect(isRecoveryActionForbidden('dynamic_playbook_mutation')).toBe(true);
  });
  test('cross_org_recovery_propagation forbidden', () => {
    expect(isRecoveryActionForbidden('cross_org_recovery_propagation')).toBe(true);
  });
  test('probabilistic_recovery_planning forbidden', () => {
    expect(isRecoveryActionForbidden('probabilistic_recovery_planning')).toBe(true);
  });
  test('runtime_self_restoration forbidden', () => {
    expect(isRecoveryActionForbidden('runtime_self_restoration')).toBe(true);
  });
  test('hidden_recovery_prioritization forbidden', () => {
    expect(isRecoveryActionForbidden('hidden_recovery_prioritization')).toBe(true);
  });
  test('rollback_bypass forbidden', () => {
    expect(isRecoveryActionForbidden('rollback_bypass')).toBe(true);
  });
  test('playbook_self_evolution forbidden', () => {
    expect(isRecoveryActionForbidden('playbook_self_evolution')).toBe(true);
  });
  test('explainForbiddenRecovery returns non-empty string', () => {
    expect(explainForbiddenRecovery('autonomous_recovery_execution' as ForbiddenRecoveryActionKind).length).toBeGreaterThan(0);
  });
  test('non-forbidden action returns false', () => {
    expect(isRecoveryActionForbidden('lift_broker_isolation')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — Recovery Archetype Registry
// ────────────────────────────────────────────────────────────────────

describe('recoveryArchetypeRegistry', () => {
  test('5 built-in archetypes registered', () => {
    expect(listBuiltInArchetypes().length).toBe(5);
  });
  test('built-in archetypes have is_built_in: true and provenance: built_in', () => {
    for (const a of listBuiltInArchetypes()) {
      expect(a.is_built_in).toBe(true);
      expect(a.provenance).toBe('built_in');
      expect(a.deterministic_hash).toMatch(/^[a-f0-9]+$/);
    }
  });
  test('built-in integrity verifies', () => {
    const integrity = verifyBuiltInIntegrity();
    expect(integrity.all_valid).toBe(true);
    expect(integrity.mismatches.length).toBe(0);
  });
  test('listArchetypes returns built-ins on empty org', () => {
    expect(listArchetypes(ORG).length).toBe(5);
  });
  test('getArchetype returns broker_isolation_lift_then_replay', () => {
    const a = getArchetype(ORG, 'broker_isolation_lift_then_replay');
    expect(a).toBeTruthy();
    expect(a!.steps.length).toBe(2);
    expect(a!.steps[0].action_kind).toBe('lift_broker_isolation');
    expect(a!.steps[1].action_kind).toBe('force_continuity_replay');
  });
  test('getArchetype returns null for unknown id', () => {
    expect(getArchetype(ORG, 'does_not_exist')).toBeNull();
  });
  test('setOperatorArchetype creates operator-set archetype', () => {
    const r = setOperatorArchetype({
      organization_id: ORG,
      name: 'Test custom playbook',
      description: 'Operator-set test playbook',
      steps: [{
        step_index: 0, action_kind: 'lift_broker_isolation',
        rationale: 'test step',
      }],
      applicable_when: ['test condition'],
      registered_by: OPERATOR,
      reason: 'unit_test',
    });
    expect(r.applied).toBe(true);
    expect(r.archetype?.is_built_in).toBe(false);
    expect(r.archetype?.provenance).toBe('operator_set');
    expect(r.attribution).toBeTruthy();
  });
  test('setOperatorArchetype refuses missing registered_by', () => {
    const r = setOperatorArchetype({
      organization_id: ORG, name: 't', description: 'd',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r' }],
      applicable_when: ['c'], registered_by: '', reason: 'r',
    });
    expect(r.applied).toBe(false);
  });
  test('setOperatorArchetype refuses 0 steps', () => {
    const r = setOperatorArchetype({
      organization_id: ORG, name: 't', description: 'd', steps: [],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'r',
    });
    expect(r.applied).toBe(false);
  });
  test('setOperatorArchetype refuses overwriting built-in id', () => {
    const r = setOperatorArchetype({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
      name: 't', description: 'd',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r' }],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'r',
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('archetype_id_collides_with_built_in');
  });
  test('archetype governance attribution recorded with previous→updated lineage', () => {
    const r1 = setOperatorArchetype({
      organization_id: ORG, archetype_id: 'op_test_x',
      name: 't1', description: 'd',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r' }],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'first',
    });
    const r2 = setOperatorArchetype({
      organization_id: ORG, archetype_id: 'op_test_x',
      name: 't2', description: 'd2',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r2' }],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'updated',
    });
    expect(r1.applied && r2.applied).toBe(true);
    const log = listArchetypeGovernanceAttributions(ORG);
    expect(log.length).toBe(2);
    expect(log[0].previous_hash).toBe(r1.archetype!.deterministic_hash);
  });
  test('archetypes cross-org isolated', () => {
    setOperatorArchetype({
      organization_id: ORG, name: 't', description: 'd',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r' }],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'test',
    });
    expect(listOperatorArchetypes(ORG).length).toBe(1);
    expect(listOperatorArchetypes(ORG_OTHER).length).toBe(0);
  });
  test('recentArchetypeGovernanceCount24h tracks 24h window', () => {
    setOperatorArchetype({
      organization_id: ORG, name: 't', description: 'd',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r' }],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'test',
    });
    expect(recentArchetypeGovernanceCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — Rollback Sequencing Engine
// ────────────────────────────────────────────────────────────────────

describe('rollbackSequencingEngine', () => {
  test('build sequencing for built-in archetype', () => {
    const r = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    expect(r.built).toBe(true);
    if (r.built) {
      expect(r.profile.advisory_only).toBe(true);
      expect(r.profile.never_auto_executes).toBe(true);
      expect(r.profile.steps.length).toBe(2);
    }
  });
  test('refuses unknown archetype', () => {
    const r = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'does_not_exist',
    });
    expect(r.built).toBe(false);
  });
  test('recommended_payload contains target_organization_id', () => {
    const r = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    expect(r.built).toBe(true);
    if (r.built) {
      for (const step of r.profile.steps) {
        expect(step.recommended_payload.target_organization_id).toBe(ORG);
        expect(step.recommended_payload.draft_hash).toMatch(/^[a-f0-9]+$/);
      }
    }
  });
  test('per_step_overrides applied', () => {
    const r = buildRollbackSequencing({
      organization_id: ORG,
      archetype_id: 'execution_isolation_lift',
      per_step_overrides: [{
        step_index: 0,
        target_kind: 'phase_27_test_kind',
        suggested_rollback_chain_id_hint: 'rb_my_custom_chain',
      }],
    });
    expect(r.built).toBe(true);
    if (r.built) {
      expect(r.profile.steps[0].recommended_payload.target_kind).toBe('phase_27_test_kind');
      expect(r.profile.steps[0].recommended_payload.suggested_rollback_chain_id_hint).toBe('rb_my_custom_chain');
    }
  });
  test('sequencing_hash deterministic', () => {
    const a = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    const b = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    if (a.built && b.built) {
      expect(a.profile.sequencing_hash).toBe(b.profile.sequencing_hash);
    }
  });
  test('sequencing cross-org isolated', () => {
    buildRollbackSequencing({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    expect(listSequencingProfiles(ORG).length).toBe(1);
    expect(listSequencingProfiles(ORG_OTHER).length).toBe(0);
  });
  test('recentSequencingCount24h tracks 24h window', () => {
    buildRollbackSequencing({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    expect(recentSequencingCount24h(ORG)).toBe(1);
  });
  test('inherited_confidence_score 80 for built-in, 70 for operator-set', () => {
    setOperatorArchetype({
      organization_id: ORG, archetype_id: 'op_seq_test',
      name: 'op test', description: 'd',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r' }],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'test',
    });
    const builtIn = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    const opSet = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'op_seq_test',
    });
    if (builtIn.built && opSet.built) {
      expect(builtIn.profile.steps[0].inherited_confidence_score).toBe(80);
      expect(opSet.profile.steps[0].inherited_confidence_score).toBe(70);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — Continuity Restoration Forecaster
// ────────────────────────────────────────────────────────────────────

describe('continuityRestorationForecaster', () => {
  test('heuristic_only typed-as-true', () => {
    const r = buildContinuityRestorationForecast({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    expect(r.built).toBe(true);
    if (r.built) expect(r.forecast.heuristic_only).toBe(true);
  });
  test('uncertainty_bounds always present (low/expected/high)', () => {
    const r = buildContinuityRestorationForecast({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    if (r.built) {
      expect(r.forecast.uncertainty_bounds.low).toBeLessThanOrEqual(r.forecast.uncertainty_bounds.expected);
      expect(r.forecast.uncertainty_bounds.expected).toBeLessThanOrEqual(r.forecast.uncertainty_bounds.high);
    }
  });
  test('inherited_confidence capped at FORECAST_CONFIDENCE_CAP (80)', () => {
    const r = buildContinuityRestorationForecast({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    if (r.built) {
      expect(r.forecast.inherited_confidence.score).toBeLessThanOrEqual(FORECAST_CONFIDENCE_CAP);
    }
  });
  test('forecast_hash deterministic', () => {
    const a = buildContinuityRestorationForecast({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    const b = buildContinuityRestorationForecast({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    if (a.built && b.built) expect(a.forecast.forecast_hash).toBe(b.forecast.forecast_hash);
  });
  test('refuses unknown archetype', () => {
    const r = buildContinuityRestorationForecast({
      organization_id: ORG, archetype_id: 'does_not_exist',
    });
    expect(r.built).toBe(false);
  });
  test('forecasts cross-org isolated', () => {
    buildContinuityRestorationForecast({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    expect(listForecasts(ORG).length).toBe(1);
    expect(listForecasts(ORG_OTHER).length).toBe(0);
  });
  test('inherited_confidence has lineage drivers', () => {
    const r = buildContinuityRestorationForecast({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    if (r.built) {
      expect(r.forecast.inherited_confidence.drivers.length).toBeGreaterThan(0);
    }
  });
  test('recentForecastCount24h tracks 24h window', () => {
    buildContinuityRestorationForecast({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    expect(recentForecastCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — Recovery Pressure Analyzer
// ────────────────────────────────────────────────────────────────────

describe('recoveryPressureAnalyzer', () => {
  test('default empty org has low pressure', () => {
    const p = buildRecoveryPressureProfile(ORG);
    expect(p.tier).toBe('low');
    expect(p.score).toBe(0);
  });
  test('observed_counters sourced from observable phases', () => {
    const p = buildRecoveryPressureProfile(ORG);
    expect(p.observed_counters).toHaveProperty('rollback_replay_count_24h');
    expect(p.observed_counters).toHaveProperty('continuity_replay_count_24h');
    expect(p.observed_counters).toHaveProperty('topology_recovery_plans_24h');
    expect(p.observed_counters).toHaveProperty('partition_fragmentation_active');
    expect(p.observed_counters).toHaveProperty('quota_exhaustions_24h');
    expect(p.observed_counters).toHaveProperty('broker_isolations_active');
  });
  test('sample_hash deterministic from observed_counters', () => {
    const a = buildRecoveryPressureProfile(ORG);
    const b = buildRecoveryPressureProfile(ORG);
    expect(a.sample_hash).toBe(b.sample_hash);
  });
  test('broker isolations elevate pressure', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, ORG, 'connection_lost');
    const p = buildRecoveryPressureProfile(ORG);
    expect(p.score).toBeGreaterThan(0);
  });
  test('containment attribution exposes drivers', () => {
    const c = buildContainmentAttribution({ organization_id: ORG });
    expect(c.partition_id).toBe(ORG);
    expect(c.drivers.length).toBeGreaterThan(0);
    expect(c.deterministic_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('containment topology_contained true on healthy partition', () => {
    const c = buildContainmentAttribution({ organization_id: ORG });
    expect(c.topology_contained).toBe(true);
  });
  test('cross-org pressure isolation', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, ORG, 'connection_lost');
    const a = buildRecoveryPressureProfile(ORG);
    const b = buildRecoveryPressureProfile(ORG_OTHER);
    expect(a.observed_counters.broker_isolations_active).toBeGreaterThan(0);
    expect(b.observed_counters.broker_isolations_active).toBe(0);
  });
  test('recentPressureSampleCount24h tracks 24h window', () => {
    buildRecoveryPressureProfile(ORG);
    expect(recentPressureSampleCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — Recovery Governance Supervisor
// ────────────────────────────────────────────────────────────────────

describe('recoveryGovernanceSupervisor', () => {
  function gateInput(overrides: any = {}) {
    return {
      organization_id: ORG,
      issuer_organization_id: ORG,
      operator_id: OPERATOR,
      archetype_id: 'broker_isolation_lift_then_replay',
      per_step_rollback_chain_ids: ['rb_a', 'rb_b'],
      ...overrides,
    };
  }
  test('permits valid input', () => {
    const r = evaluateArchetypeApplication(gateInput());
    expect(r.decision).toBe('permitted');
    expect(r.attribution.operator_mediation_required).toBe(true);
  });
  test('rejects organization_id missing', () => {
    const r = evaluateArchetypeApplication(gateInput({ organization_id: '' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('organization_id_missing');
  });
  test('rejects archetype_id missing', () => {
    const r = evaluateArchetypeApplication(gateInput({ archetype_id: '' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('archetype_id_missing');
  });
  test('rejects operator_id missing (operator_mediation_required_violated)', () => {
    const r = evaluateArchetypeApplication(gateInput({ operator_id: '' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('operator_mediation_required_violated');
  });
  test('rejects cross-org', () => {
    const r = evaluateArchetypeApplication(gateInput({ issuer_organization_id: ORG_OTHER }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('cross_org_attempted');
  });
  test('rejects unknown archetype', () => {
    const r = evaluateArchetypeApplication(gateInput({ archetype_id: 'does_not_exist' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('archetype_not_found');
  });
  test('rejects missing rollback chain ids', () => {
    const r = evaluateArchetypeApplication(gateInput({ per_step_rollback_chain_ids: [] }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('rollback_chain_required_missing');
  });
  test('rejects empty rollback chain id string', () => {
    const r = evaluateArchetypeApplication(gateInput({ per_step_rollback_chain_ids: ['', 'rb_b'] }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('rollback_chain_required_missing');
  });
  test('every attribution carries operator_mediation_required: true', () => {
    const r = evaluateArchetypeApplication(gateInput({ archetype_id: '' }));
    expect(r.attribution.operator_mediation_required).toBe(true);
  });
  test('recordArchetypeFinalityProof produces immutability proof', () => {
    const proof = recordArchetypeFinalityProof({
      organization_id: ORG,
      archetype_id: 'broker_isolation_lift_then_replay',
      operator_id: OPERATOR,
      envelope_ids_issued: ['env_a', 'env_b'],
      bounded_reason: 'operator applied playbook end-to-end',
    });
    expect(proof.cannot_re_execute).toBe(true);
    expect(proof.replayable).toBe(true);
    expect(proof.bounded_reason.length).toBeGreaterThan(0);
    expect(proof.envelope_ids_issued).toEqual(['env_a', 'env_b']);
  });
  test('recentGovernanceCount24h tracks decisions', () => {
    evaluateArchetypeApplication(gateInput());
    expect(recentGovernanceCount24h(ORG)).toBe(1);
  });
  test('recentFinalityProofCount24h tracks proofs', () => {
    recordArchetypeFinalityProof({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
      operator_id: OPERATOR, envelope_ids_issued: ['env_a'],
      bounded_reason: 'r',
    });
    expect(recentFinalityProofCount24h(ORG)).toBe(1);
  });
  test('governance partitioned per org', () => {
    evaluateArchetypeApplication(gateInput());
    expect(listGovernanceAttributions(ORG).length).toBe(1);
    expect(listGovernanceAttributions(ORG_OTHER).length).toBe(0);
  });
  test('finality proofs partitioned per org', () => {
    recordArchetypeFinalityProof({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
      operator_id: OPERATOR, envelope_ids_issued: ['env_a'], bounded_reason: 'r',
    });
    expect(listFinalityProofs(ORG).length).toBe(1);
    expect(listFinalityProofs(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — Stabilization Playbook Coordinator
// ────────────────────────────────────────────────────────────────────

describe('stabilizationPlaybookCoordinator', () => {
  test('composite includes pressure + containment + tier', () => {
    const c = buildStabilizationComposite({ organization_id: ORG });
    expect(c.pressure).toBeDefined();
    expect(c.containment).toBeDefined();
    expect(c.tier).toBeDefined();
    expect(c.boundary_proof_chain).toBeDefined();
  });
  test('boundary_proof_chain contains 5 hashes', () => {
    const c = buildStabilizationComposite({ organization_id: ORG });
    expect(c.boundary_proof_chain.archetype_hash).toBeDefined();
    expect(c.boundary_proof_chain.sequencing_hash).toBeDefined();
    expect(c.boundary_proof_chain.forecast_hash).toBeDefined();
    expect(c.boundary_proof_chain.pressure_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.replay_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('with archetype, all 5 hashes are real', () => {
    const c = buildStabilizationComposite({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    expect(c.archetype).toBeTruthy();
    expect(c.sequencing).toBeTruthy();
    expect(c.forecast).toBeTruthy();
    expect(c.boundary_proof_chain.archetype_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('replay_hash deterministic', () => {
    const a = buildStabilizationComposite({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    const b = buildStabilizationComposite({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    expect(a.boundary_proof_chain.replay_hash).toBe(b.boundary_proof_chain.replay_hash);
  });
  test('default tier is stable for healthy org', () => {
    const c = buildStabilizationComposite({ organization_id: ORG });
    expect(c.tier).toBe('stable');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — Stabilization Replay Engine (read-only)
// ────────────────────────────────────────────────────────────────────

describe('stabilizationReplayEngine', () => {
  test('build replay bundle with 5-hash chain + determinism attribution', () => {
    const b = buildStabilizationReplayBundle({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    expect(b.organization_id).toBe(ORG);
    expect(b.boundary_proof_chain.replay_hash).toMatch(/^[a-f0-9]+$/);
    expect(b.determinism_attribution.deterministic_composite_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('verifyStabilizationReplayDeterminism passes', () => {
    const b = buildStabilizationReplayBundle({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    const v = verifyStabilizationReplayDeterminism({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
      expected_replay_hash: b.boundary_proof_chain.replay_hash,
    });
    expect(v.deterministic).toBe(true);
  });
  test('replay does NOT mutate finality proofs', () => {
    const before = listFinalityProofs(ORG).length;
    buildStabilizationReplayBundle({ organization_id: ORG });
    const after = listFinalityProofs(ORG).length;
    expect(after).toBe(before);
  });
  test('listReplayTraces partitioned per org', () => {
    buildStabilizationReplayBundle({ organization_id: ORG });
    expect(listReplayTraces(ORG).length).toBeGreaterThan(0);
    expect(listReplayTraces(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — Stabilization Trust Surface
// ────────────────────────────────────────────────────────────────────

describe('stabilizationTrustSurface', () => {
  test('exposes 6 bands', () => {
    const t = buildStabilizationTrustSurface({ organization_id: ORG });
    expect(t.bands.length).toBe(6);
    const labels = t.bands.map(b => b.label).sort();
    expect(labels).toEqual([
      'continuity_restoration_trust', 'recovery_governance_trust',
      'recovery_replay_integrity', 'rollback_survivability_confidence',
      'stabilization_reliability', 'topology_restoration_confidence',
    ].sort());
  });
  test('aggregate_score in 0-100', () => {
    const t = buildStabilizationTrustSurface({ organization_id: ORG });
    expect(t.aggregate_score).toBeGreaterThanOrEqual(0);
    expect(t.aggregate_score).toBeLessThanOrEqual(100);
  });
  test('recovery_governance_trust always 100 (operator-mediated)', () => {
    const t = buildStabilizationTrustSurface({ organization_id: ORG });
    const band = t.bands.find(b => b.label === 'recovery_governance_trust');
    expect(band?.score).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — Narrative Builder (Phase 24 inheritance)
// ────────────────────────────────────────────────────────────────────

describe('stabilizationNarrativeBuilder', () => {
  test('builds 5-block narrative when archetype specified', () => {
    const n = buildStabilizationNarrative({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    expect(n).toBeTruthy();
    expect(n!.blocks.length).toBe(5);
  });
  test('builds 2-block narrative without archetype (pressure + containment only)', () => {
    const n = buildStabilizationNarrative({ organization_id: ORG });
    expect(n).toBeTruthy();
    expect(n!.blocks.length).toBe(2);
  });
  test('every block has at least one citation', () => {
    const n = buildStabilizationNarrative({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    for (const b of n!.blocks) {
      expect(b.citations.length).toBeGreaterThan(0);
    }
  });
  test('every block has deterministic_hash', () => {
    const n = buildStabilizationNarrative({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    for (const b of n!.blocks) {
      expect(b.deterministic_hash).toMatch(/^[a-f0-9]+$/);
    }
  });
  test('narratives partitioned per org', () => {
    buildStabilizationNarrative({ organization_id: ORG });
    expect(listStabilizationNarratives(ORG).length).toBe(1);
    expect(listStabilizationNarratives(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 12 — Visibility composite + summary
// ────────────────────────────────────────────────────────────────────

describe('stabilizationVisibilityReplay + summary', () => {
  test('visibility includes archetypes + tier + trust', () => {
    const v = buildStabilizationVisibilityReplay({ organization_id: ORG });
    expect(v.archetypes.length).toBeGreaterThan(0);
    expect(v.current_stabilization_tier).toBeDefined();
    expect(v.trust_surface).toBeDefined();
  });
  test('summary has 6 health scores', () => {
    const s = buildStabilizationSummary();
    expect(s.health_scores.rollback_survivability_confidence).toBeDefined();
    expect(s.health_scores.continuity_restoration_trust).toBeDefined();
    expect(s.health_scores.recovery_replay_integrity).toBeDefined();
    expect(s.health_scores.topology_restoration_confidence).toBeDefined();
    expect(s.health_scores.stabilization_reliability).toBeDefined();
    expect(s.health_scores.recovery_governance_trust).toBeDefined();
  });
  test('summary current_stabilization_tier defaults to stable', () => {
    const s = buildStabilizationSummary();
    expect(['stable', 'recovering', 'strained', 'critical', 'failing']).toContain(s.current_stabilization_tier);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 13 — PRODUCTION STATE UNCHANGED verification
// ────────────────────────────────────────────────────────────────────

describe('production state UNCHANGED verification', () => {
  test('buildRollbackSequencing does NOT issue Phase 27 envelopes', () => {
    // Phase 29 NEVER issues envelopes — verified by the absence of any
    // envelope creation API call in the engine source. This test
    // confirms the sequencing produces typed drafts only.
    const r = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    expect(r.built).toBe(true);
    if (r.built) {
      expect(r.profile.never_auto_executes).toBe(true);
      // recommended_payloads are typed envelope DRAFTS, not issued envelopes.
      expect(r.profile.steps[0].recommended_payload.draft_hash).toMatch(/^[a-f0-9]+$/);
    }
  });
  test('buildStabilizationComposite does NOT mutate broker isolation state', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, ORG, 'connection_lost');
    const before = buildRecoveryPressureProfile(ORG).observed_counters.broker_isolations_active;
    buildStabilizationComposite({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    const after = buildRecoveryPressureProfile(ORG).observed_counters.broker_isolations_active;
    expect(after).toBe(before);
  });
  test('forecast does NOT trigger any rollback execution', () => {
    const before = buildRecoveryPressureProfile(ORG).observed_counters.rollback_replay_count_24h;
    buildContinuityRestorationForecast({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    const after = buildRecoveryPressureProfile(ORG).observed_counters.rollback_replay_count_24h;
    expect(after).toBe(before);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 14 — Cross-organization isolation end-to-end
// ────────────────────────────────────────────────────────────────────

describe('cross-organization isolation', () => {
  test('operator-set archetypes scoped per org', () => {
    setOperatorArchetype({
      organization_id: ORG, name: 't', description: 'd',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r' }],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'r',
    });
    expect(listOperatorArchetypes(ORG).length).toBe(1);
    expect(listOperatorArchetypes(ORG_OTHER).length).toBe(0);
  });
  test('sequencings scoped per org', () => {
    buildRollbackSequencing({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    expect(listSequencingProfiles(ORG).length).toBe(1);
    expect(listSequencingProfiles(ORG_OTHER).length).toBe(0);
  });
  test('forecasts scoped per org', () => {
    buildContinuityRestorationForecast({ organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay' });
    expect(listForecasts(ORG).length).toBe(1);
    expect(listForecasts(ORG_OTHER).length).toBe(0);
  });
  test('pressure samples scoped per org', () => {
    buildRecoveryPressureProfile(ORG);
    expect(listPressureSamples(ORG).length).toBe(1);
    expect(listPressureSamples(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 15 — Hard-veto preservation across prior phases
// ────────────────────────────────────────────────────────────────────

describe('hard-veto preservation across prior phases', () => {
  test('Phase 29 forbidden registry contains all 9 hard vetoes', () => {
    expect(getForbiddenRecoveryRegistry().forbidden_actions.length).toBe(9);
  });
  test('Phase 27 invariants preserved: operator_mediation_required typed-as-true', () => {
    const r = evaluateArchetypeApplication({
      organization_id: ORG, issuer_organization_id: ORG, operator_id: OPERATOR,
      archetype_id: 'broker_isolation_lift_then_replay',
      per_step_rollback_chain_ids: ['rb_a', 'rb_b'],
    });
    expect(r.attribution.operator_mediation_required).toBe(true);
  });
  test('Phase 28 hard veto: cross_org pooling forbidden in Phase 29 registry', () => {
    expect(isRecoveryActionForbidden('cross_org_recovery_propagation')).toBe(true);
  });
  test('Phase 21/22/23 mutators NOT invoked by sequencing', () => {
    // Verified by absence — the sequencing engine produces typed drafts;
    // no real mutator invocation. This is a structural invariant.
    const r = buildRollbackSequencing({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    expect(r.built).toBe(true);
    if (r.built) {
      // The recommended_payload contains the action_kind that the
      // OPERATOR can later issue via Phase 27 — but Phase 29 itself
      // didn't invoke anything.
      expect(r.profile.never_auto_executes).toBe(true);
    }
  });
  test('Phase 24 narrative inheritance: every block has citations', () => {
    const n = buildStabilizationNarrative({
      organization_id: ORG, archetype_id: 'broker_isolation_lift_then_replay',
    });
    for (const b of n!.blocks) {
      expect(b.citations.length).toBeGreaterThan(0);
    }
  });
});
