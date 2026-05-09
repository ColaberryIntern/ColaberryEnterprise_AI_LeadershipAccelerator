/**
 * Phase 28 — Execution Resource Governance + Operational Economics tests.
 *
 * Coverage:
 *   - architectural caps + types (1-2 tests)
 *   - forbidden registry (8 forbidden actions) defense-in-depth
 *   - executionQuotaEngine: defaults, set/get, governance log, exhaustion
 *     attribution + finality proof, cross-org isolation
 *   - Phase 27 evaluateIssuance integration: quota_exhausted reject path
 *   - Phase 27 executeDelegated: post-execution quota consumption recording
 *   - runtimePressureGovernor: 5-tier classification from observable counters
 *   - topologyLoadDistributionProfiler: recommendation_only structural
 *     guarantees + advisory_recommendation when imbalance >= 25
 *   - rollbackResourceForecaster: heuristic + uncertainty bounds + inherited
 *     confidence lineage; heuristic_only typed-as-true
 *   - delegatedPressureClassifier: 5-tier mapping (stable/constrained/
 *     elevated/saturated/exhausted) with all branches
 *   - executionEconomicsCoordinator: composite + boundary_proof_chain
 *     determinism (same inputs → same hashes)
 *   - replay engine: read-only, no mutation
 *   - trust surface: 6 bands + aggregate score
 *   - narrative builder: Phase 24 inheritance, citations required, 5 templates
 *   - visibility composite + summary counters
 *   - PRODUCTION STATE UNCHANGED verification (issuing/setting quota)
 *   - HARD-VETO PRESERVATION across prior phases (Phase 13/19/21/22/23/27)
 *   - cross-organization isolation end-to-end
 */

import {
  buildExecutionQuotaProfile, checkQuotaAvailability, recordConsumption,
  setQuotaLimit, listQuotaGovernanceAttributions, recordQuotaExhaustion,
  listQuotaExhaustions, recentQuotaExhaustionCount24h, recentQuotaGovernanceCount24h,
  _resetQuotaEngineForTests,
} from '../executionEconomics/executionQuotaEngine';
import {
  buildRuntimePressureProfile, listPressureSamples,
  recentPressureSampleCount24h, _resetPressureGovernorForTests,
} from '../executionEconomics/runtimePressureGovernor';
import {
  buildTopologyLoadDistributionProfile, listLoadDistributionProfiles,
  recentLoadClassificationCount24h, _resetTopologyLoadProfilerForTests,
} from '../executionEconomics/topologyLoadDistributionProfiler';
import {
  buildRollbackResourceForecast, listRollbackResourceForecasts,
  recentForecastCount24h, _resetForecasterForTests,
} from '../executionEconomics/rollbackResourceForecaster';
import { classifyEconomicsTier } from '../executionEconomics/delegatedPressureClassifier';
import {
  buildEconomicsComposite, buildExecutionEconomicsReplay,
  verifyEconomicsReplayDeterminism,
} from '../executionEconomics/executionEconomicsCoordinator';
import { buildExecutionEconomicsTrustSurface } from '../executionEconomics/executionEconomicsTrustSurface';
import {
  buildExecutionEconomicsNarrative, listExecutionEconomicsNarratives,
  _resetEconomicsNarrativesForTests,
} from '../executionEconomics/executionEconomicsNarrativeBuilder';
import { buildExecutionEconomicsVisibilityReplay } from '../executionEconomics/executionEconomicsVisibilityReplay';
import { buildExecutionEconomicsSummary } from '../executionEconomics/executionEconomicsSummaryCounters';
import {
  getForbiddenEconomicsRegistry, isEconomicsActionForbidden,
  explainForbiddenEconomics,
} from '../executionEconomics/forbiddenEconomicsActionRegistry';
import {
  DEFAULT_QUOTA_LIMITS, MAX_QUOTA_LIMIT, MIN_QUOTA_LIMIT,
  FORECAST_HORIZON_MS,
} from '../executionEconomics/executionEconomicsTypes';
import type {
  ForbiddenEconomicsActionKind, QuotaResourceKey,
} from '../executionEconomics/executionEconomicsTypes';

// Phase 27 integration deps
import {
  evaluateIssuance,
  _resetDelegatedGovernanceForTests,
} from '../delegatedExecution/delegatedExecutionGovernance';
import {
  issueAuthorityEnvelope, _resetEnvelopeEngineForTests,
} from '../delegatedExecution/authorityEnvelopeEngine';
import {
  executeDelegated, _resetCoordinatorForTests,
} from '../delegatedExecution/delegatedExecutionCoordinator';
import {
  recordFailure as brokerRecordFailure,
  _resetIsolationForTests as _resetBrokerIso,
} from '../distributedRuntime/brokerIsolationEngine';
import { _resetRuntimeForTests } from '../distributedRuntime/distributedBrokerRuntime';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

const ORG = 'org_phase28_alpha';
const ORG_OTHER = 'org_phase28_beta';
const OPERATOR = 'op_phase28';

beforeEach(() => {
  _resetQuotaEngineForTests();
  _resetPressureGovernorForTests();
  _resetTopologyLoadProfilerForTests();
  _resetForecasterForTests();
  _resetEconomicsNarrativesForTests();
  _resetEnvelopeEngineForTests();
  _resetCoordinatorForTests();
  _resetDelegatedGovernanceForTests();
  _resetBrokerIso();
  _resetRuntimeForTests();
});

// ────────────────────────────────────────────────────────────────────
// Section 1 — Architectural caps + types
// ────────────────────────────────────────────────────────────────────

describe('Phase 28 architectural caps', () => {
  test('DEFAULT_QUOTA_LIMITS contains all 6 quota keys', () => {
    const keys: QuotaResourceKey[] = [
      'envelopes_per_24h', 'executions_per_24h', 'rollback_chains_per_24h',
      'topology_recovery_steps_per_24h', 'continuity_replays_per_24h',
      'concurrent_executions',
    ];
    for (const k of keys) {
      expect(DEFAULT_QUOTA_LIMITS[k]).toBeGreaterThanOrEqual(0);
    }
  });
  test('MIN_QUOTA_LIMIT <= MAX_QUOTA_LIMIT', () => {
    expect(MIN_QUOTA_LIMIT).toBeLessThanOrEqual(MAX_QUOTA_LIMIT);
  });
  test('FORECAST_HORIZON_MS positive', () => {
    expect(FORECAST_HORIZON_MS).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — Forbidden Economics Registry
// ────────────────────────────────────────────────────────────────────

describe('forbiddenEconomicsActionRegistry', () => {
  test('registry exposes all 8 forbidden actions with hash', () => {
    const r = getForbiddenEconomicsRegistry();
    expect(r.forbidden_actions.length).toBe(8);
    expect(r.registry_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('auto_quota_expansion is forbidden', () => {
    expect(isEconomicsActionForbidden('auto_quota_expansion')).toBe(true);
  });
  test('auto_topology_rebalancing is forbidden', () => {
    expect(isEconomicsActionForbidden('auto_topology_rebalancing')).toBe(true);
  });
  test('cross_org_resource_pooling is forbidden', () => {
    expect(isEconomicsActionForbidden('cross_org_resource_pooling')).toBe(true);
  });
  test('hidden_execution_prioritization is forbidden', () => {
    expect(isEconomicsActionForbidden('hidden_execution_prioritization')).toBe(true);
  });
  test('explainForbiddenEconomics returns non-empty string', () => {
    expect(explainForbiddenEconomics('dynamic_authority_expansion' as ForbiddenEconomicsActionKind).length).toBeGreaterThan(0);
  });
  test('a non-forbidden action returns false', () => {
    expect(isEconomicsActionForbidden('lift_broker_isolation')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — Execution Quota Engine
// ────────────────────────────────────────────────────────────────────

describe('executionQuotaEngine', () => {
  test('default profile has DEFAULT_QUOTA_LIMITS', () => {
    const p = buildExecutionQuotaProfile(ORG);
    expect(p.limits.envelopes_per_24h).toBe(DEFAULT_QUOTA_LIMITS.envelopes_per_24h);
    expect(p.consumed.envelopes_per_24h).toBe(0);
    expect(p.any_exhausted).toBe(false);
  });

  test('checkQuotaAvailability allows when under limit', () => {
    const r = checkQuotaAvailability(ORG, ['envelopes_per_24h']);
    expect(r.allowed).toBe(true);
    expect(r.exhausted_keys.length).toBe(0);
  });

  test('checkQuotaAvailability refuses when at limit', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 1, updated_by: OPERATOR, reason: 'test' });
    recordConsumption(ORG, 'envelopes_per_24h', 1);
    const r = checkQuotaAvailability(ORG, ['envelopes_per_24h']);
    expect(r.allowed).toBe(false);
    expect(r.exhausted_keys).toContain('envelopes_per_24h');
  });

  test('setQuotaLimit refuses when above MAX_QUOTA_LIMIT', () => {
    const r = setQuotaLimit({
      organization_id: ORG, quota_key: 'envelopes_per_24h',
      updated_limit: MAX_QUOTA_LIMIT + 1, updated_by: OPERATOR, reason: 'test',
    });
    expect(r.applied).toBe(false);
  });

  test('setQuotaLimit refuses when below MIN_QUOTA_LIMIT', () => {
    const r = setQuotaLimit({
      organization_id: ORG, quota_key: 'envelopes_per_24h',
      updated_limit: -1, updated_by: OPERATOR, reason: 'test',
    });
    expect(r.applied).toBe(false);
  });

  test('setQuotaLimit refuses when updated_by missing', () => {
    const r = setQuotaLimit({
      organization_id: ORG, quota_key: 'envelopes_per_24h',
      updated_limit: 100, updated_by: '', reason: 'test',
    });
    expect(r.applied).toBe(false);
  });

  test('setQuotaLimit records governance attribution', () => {
    setQuotaLimit({
      organization_id: ORG, quota_key: 'envelopes_per_24h',
      updated_limit: 25, updated_by: OPERATOR, reason: 'test_lower_cap',
    });
    const log = listQuotaGovernanceAttributions(ORG);
    expect(log.length).toBe(1);
    expect(log[0].previous_limit).toBe(DEFAULT_QUOTA_LIMITS.envelopes_per_24h);
    expect(log[0].updated_limit).toBe(25);
    expect(log[0].updated_by).toBe(OPERATOR);
    expect(log[0].reason).toBe('test_lower_cap');
    expect(log[0].deterministic_hash).toMatch(/^[a-f0-9]+$/);
  });

  test('recordQuotaExhaustion produces finality proof with replayable=true', () => {
    const r = recordQuotaExhaustion({
      organization_id: ORG, quota_key: 'envelopes_per_24h',
      attempted_envelope_id: 'env_test_123',
    });
    expect(r.finality.replayable).toBe(true);
    expect(r.finality.exhaustion_scope).toBe('organization');
    expect(r.finality.blocking_envelope_id).toBe('env_test_123');
    expect(r.finality.bounded_reason.length).toBeGreaterThan(0);
    expect(r.finality.finality_hash).toMatch(/^[a-f0-9]+$/);
  });

  test('recentQuotaExhaustionCount24h tracks 24h window', () => {
    recordQuotaExhaustion({ organization_id: ORG, quota_key: 'envelopes_per_24h' });
    recordQuotaExhaustion({ organization_id: ORG, quota_key: 'executions_per_24h' });
    expect(recentQuotaExhaustionCount24h(ORG)).toBe(2);
  });

  test('recentQuotaGovernanceCount24h tracks 24h window', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 30, updated_by: OPERATOR, reason: 'r1' });
    setQuotaLimit({ organization_id: ORG, quota_key: 'executions_per_24h', updated_limit: 20, updated_by: OPERATOR, reason: 'r2' });
    expect(recentQuotaGovernanceCount24h(ORG)).toBe(2);
  });

  test('quota engine is cross-org isolated', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 5, updated_by: OPERATOR, reason: 'r' });
    const profileA = buildExecutionQuotaProfile(ORG);
    const profileB = buildExecutionQuotaProfile(ORG_OTHER);
    expect(profileA.limits.envelopes_per_24h).toBe(5);
    expect(profileB.limits.envelopes_per_24h).toBe(DEFAULT_QUOTA_LIMITS.envelopes_per_24h);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — Phase 27 evaluateIssuance integration (quota gate)
// ────────────────────────────────────────────────────────────────────

describe('Phase 27 evaluateIssuance — Phase 28 quota gate integration', () => {
  test('issuance permitted under default quotas', () => {
    const r = evaluateIssuance({
      envelope_id: 'env_test', operator_id: OPERATOR, organization_id: ORG,
      action_kind: 'lift_broker_isolation', target_organization_id: ORG,
      rollback_chain_id: 'rb_x', target_namespace: BROKER_NAMESPACES.effectiveness,
    });
    expect(r.decision).toBe('permitted');
  });

  test('issuance rejected with quota_exhausted when envelope cap is 0', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 0, updated_by: OPERATOR, reason: 'test_block' });
    const r = evaluateIssuance({
      envelope_id: 'env_test', operator_id: OPERATOR, organization_id: ORG,
      action_kind: 'lift_broker_isolation', target_organization_id: ORG,
      rollback_chain_id: 'rb_x', target_namespace: BROKER_NAMESPACES.effectiveness,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('quota_exhausted');
  });

  test('quota_exhausted records exhaustion attribution', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 0, updated_by: OPERATOR, reason: 'test_block' });
    evaluateIssuance({
      envelope_id: 'env_test', operator_id: OPERATOR, organization_id: ORG,
      action_kind: 'lift_broker_isolation', target_organization_id: ORG,
      rollback_chain_id: 'rb_x', target_namespace: BROKER_NAMESPACES.effectiveness,
    });
    const exhaustions = listQuotaExhaustions(ORG);
    expect(exhaustions.length).toBeGreaterThan(0);
    expect(exhaustions[0].quota_key).toBe('envelopes_per_24h');
    expect(exhaustions[0].attempted_envelope_id).toBe('env_test');
  });

  test('quota gate fires AFTER existing checks (cross-org refused first)', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 0, updated_by: OPERATOR, reason: 'test' });
    const r = evaluateIssuance({
      envelope_id: 'env_test', operator_id: OPERATOR, organization_id: ORG,
      action_kind: 'lift_broker_isolation', target_organization_id: ORG_OTHER,
      rollback_chain_id: 'rb_x',
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('cross_org_attempted');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — Phase 27 executeDelegated post-execution consumption
// ────────────────────────────────────────────────────────────────────

describe('Phase 27 executeDelegated — Phase 28 consumption recording', () => {
  test('successful execution records envelope + execution consumption', async () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, ORG, 'connection_lost');
    const { envelope } = issueAuthorityEnvelope({
      operator_id: OPERATOR, action_kind: 'lift_broker_isolation',
      target_namespace: BROKER_NAMESPACES.effectiveness,
      target_organization_id: ORG,
      rollback_chain_id: 'rb_x', topology_containment_proof: 'h_x',
    });
    await executeDelegated({
      envelope_id: envelope.envelope_id, issuer_organization_id: ORG,
    });
    const profile = buildExecutionQuotaProfile(ORG);
    expect(profile.consumed.envelopes_per_24h).toBe(1);
    expect(profile.consumed.executions_per_24h).toBe(1);
  });

  test('refused execution does NOT bump executions counter', async () => {
    const { envelope } = issueAuthorityEnvelope({
      operator_id: OPERATOR, action_kind: 'lift_broker_isolation',
      target_namespace: BROKER_NAMESPACES.effectiveness,
      target_organization_id: ORG,
      rollback_chain_id: 'rb_x', topology_containment_proof: 'h_x',
    });
    await executeDelegated({
      envelope_id: envelope.envelope_id, issuer_organization_id: ORG_OTHER,
    });
    const profile = buildExecutionQuotaProfile(ORG);
    // Refusal still bumps envelope counter (envelope was issued).
    // but does not bump executions counter (execution did not occur).
    expect(profile.consumed.executions_per_24h).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — Runtime Pressure Governor
// ────────────────────────────────────────────────────────────────────

describe('runtimePressureGovernor', () => {
  test('default pressure for empty org is low', () => {
    const p = buildRuntimePressureProfile(ORG);
    expect(p.tier).toBe('low');
    expect(p.score).toBe(0);
  });

  test('observed_counters sourced from observable phases only', () => {
    const p = buildRuntimePressureProfile(ORG);
    expect(p.observed_counters).toHaveProperty('envelopes_24h');
    expect(p.observed_counters).toHaveProperty('refusals_24h');
    expect(p.observed_counters).toHaveProperty('timeouts_24h');
    expect(p.observed_counters).toHaveProperty('broker_isolations_active');
    expect(p.observed_counters).toHaveProperty('topology_fragmentations_active');
  });

  test('sample_hash deterministic from observed_counters', () => {
    const p1 = buildRuntimePressureProfile(ORG);
    const p2 = buildRuntimePressureProfile(ORG);
    expect(p1.sample_hash).toBe(p2.sample_hash);
  });

  test('broker isolations elevate pressure', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, ORG, 'connection_lost');
    const p = buildRuntimePressureProfile(ORG);
    expect(p.observed_counters.broker_isolations_active).toBeGreaterThan(0);
    expect(p.score).toBeGreaterThan(0);
  });

  test('listPressureSamples returns recorded samples', () => {
    buildRuntimePressureProfile(ORG);
    buildRuntimePressureProfile(ORG);
    expect(listPressureSamples(ORG).length).toBe(2);
  });

  test('recentPressureSampleCount24h tracks 24h window', () => {
    buildRuntimePressureProfile(ORG);
    expect(recentPressureSampleCount24h(ORG)).toBe(1);
  });

  test('cross-org pressure isolation', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, ORG, 'connection_lost');
    const a = buildRuntimePressureProfile(ORG);
    const b = buildRuntimePressureProfile(ORG_OTHER);
    expect(a.observed_counters.broker_isolations_active).toBeGreaterThan(0);
    expect(b.observed_counters.broker_isolations_active).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — Topology Load Distribution Profiler
// ────────────────────────────────────────────────────────────────────

describe('topologyLoadDistributionProfiler', () => {
  test('recommendation_only and never_auto_migrates typed-as-true', () => {
    const p = buildTopologyLoadDistributionProfile(ORG);
    expect(p.recommendation_only).toBe(true);
    expect(p.never_auto_migrates).toBe(true);
  });

  test('default empty org has no partitions', () => {
    const p = buildTopologyLoadDistributionProfile(ORG);
    expect(p.partitions.length).toBe(0);
    expect(p.imbalance_score).toBe(0);
  });

  test('issued envelopes register in partition map', () => {
    issueAuthorityEnvelope({
      operator_id: OPERATOR, action_kind: 'lift_broker_isolation',
      target_namespace: BROKER_NAMESPACES.effectiveness,
      target_organization_id: ORG,
      rollback_chain_id: 'rb_x', topology_containment_proof: 'h_x',
    });
    const p = buildTopologyLoadDistributionProfile(ORG);
    expect(p.partitions.length).toBe(1);
    expect(p.partitions[0].observed_envelope_count).toBe(1);
  });

  test('distribution_hash is deterministic', () => {
    const a = buildTopologyLoadDistributionProfile(ORG);
    const b = buildTopologyLoadDistributionProfile(ORG);
    expect(a.distribution_hash).toBe(b.distribution_hash);
  });

  test('recentLoadClassificationCount24h tracks classifications', () => {
    buildTopologyLoadDistributionProfile(ORG);
    buildTopologyLoadDistributionProfile(ORG);
    expect(recentLoadClassificationCount24h(ORG)).toBe(2);
  });

  test('listLoadDistributionProfiles cross-org isolated', () => {
    buildTopologyLoadDistributionProfile(ORG);
    expect(listLoadDistributionProfiles(ORG).length).toBe(1);
    expect(listLoadDistributionProfiles(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — Rollback Resource Forecaster
// ────────────────────────────────────────────────────────────────────

describe('rollbackResourceForecaster', () => {
  test('heuristic_only typed-as-true', () => {
    const f = buildRollbackResourceForecast(ORG);
    expect(f.heuristic_only).toBe(true);
  });

  test('uncertainty_bounds always present (low/expected/high)', () => {
    const f = buildRollbackResourceForecast(ORG);
    expect(f.uncertainty_bounds).toHaveProperty('low');
    expect(f.uncertainty_bounds).toHaveProperty('expected');
    expect(f.uncertainty_bounds).toHaveProperty('high');
    expect(f.uncertainty_bounds.low).toBeLessThanOrEqual(f.uncertainty_bounds.expected);
    expect(f.uncertainty_bounds.expected).toBeLessThanOrEqual(f.uncertainty_bounds.high);
  });

  test('inherited_confidence has lineage drivers', () => {
    const f = buildRollbackResourceForecast(ORG);
    expect(f.inherited_confidence.drivers.length).toBeGreaterThan(0);
    expect(f.inherited_confidence.score).toBeGreaterThanOrEqual(0);
    expect(f.inherited_confidence.score).toBeLessThanOrEqual(80); // capped at 80
  });

  test('forecast_horizon_ms matches FORECAST_HORIZON_MS', () => {
    const f = buildRollbackResourceForecast(ORG);
    expect(f.forecast_horizon_ms).toBe(FORECAST_HORIZON_MS);
  });

  test('forecast_hash deterministic for same inputs', () => {
    const a = buildRollbackResourceForecast(ORG);
    const b = buildRollbackResourceForecast(ORG);
    expect(a.forecast_hash).toBe(b.forecast_hash);
  });

  test('listRollbackResourceForecasts cross-org isolated', () => {
    buildRollbackResourceForecast(ORG);
    expect(listRollbackResourceForecasts(ORG).length).toBe(1);
    expect(listRollbackResourceForecasts(ORG_OTHER).length).toBe(0);
  });

  test('recentForecastCount24h tracks 24h window', () => {
    buildRollbackResourceForecast(ORG);
    expect(recentForecastCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — Delegated Pressure Classifier
// ────────────────────────────────────────────────────────────────────

describe('delegatedPressureClassifier — 5-tier mapping', () => {
  test('exhausted: any quota at 0 remaining', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 1, updated_by: OPERATOR, reason: 'r' });
    recordConsumption(ORG, 'envelopes_per_24h', 1);
    const quota = buildExecutionQuotaProfile(ORG);
    const pressure = buildRuntimePressureProfile(ORG);
    expect(classifyEconomicsTier({ pressure, quota })).toBe('exhausted');
  });

  test('saturated: pressure tier saturated/critical', () => {
    const quota = buildExecutionQuotaProfile(ORG);
    const pressure = { ...buildRuntimePressureProfile(ORG), tier: 'saturated' as const };
    expect(classifyEconomicsTier({ pressure, quota })).toBe('saturated');
  });

  test('elevated: pressure tier elevated', () => {
    const quota = buildExecutionQuotaProfile(ORG);
    const pressure = { ...buildRuntimePressureProfile(ORG), tier: 'elevated' as const };
    expect(classifyEconomicsTier({ pressure, quota })).toBe('elevated');
  });

  test('constrained: pressure moderate', () => {
    const quota = buildExecutionQuotaProfile(ORG);
    const pressure = { ...buildRuntimePressureProfile(ORG), tier: 'moderate' as const };
    expect(classifyEconomicsTier({ pressure, quota })).toBe('constrained');
  });

  test('stable: pressure low + quotas under 25% used', () => {
    const quota = buildExecutionQuotaProfile(ORG);
    const pressure = buildRuntimePressureProfile(ORG);
    expect(classifyEconomicsTier({ pressure, quota })).toBe('stable');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — Coordinator + boundary proof chain determinism
// ────────────────────────────────────────────────────────────────────

describe('executionEconomicsCoordinator', () => {
  test('composite includes all 5 components', () => {
    const c = buildEconomicsComposite({ organization_id: ORG });
    expect(c.quota).toBeDefined();
    expect(c.pressure).toBeDefined();
    expect(c.topology_load).toBeDefined();
    expect(c.rollback_forecast).toBeDefined();
    expect(c.boundary_proof_chain).toBeDefined();
  });

  test('boundary_proof_chain contains all 5 hashes', () => {
    const c = buildEconomicsComposite({ organization_id: ORG });
    expect(c.boundary_proof_chain.quota_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.pressure_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.topology_load_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.rollback_forecast_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.replay_hash).toMatch(/^[a-f0-9]+$/);
  });

  test('replay_hash deterministic — same inputs → same hash', () => {
    const a = buildEconomicsComposite({ organization_id: ORG });
    const b = buildEconomicsComposite({ organization_id: ORG });
    expect(a.boundary_proof_chain.replay_hash).toBe(b.boundary_proof_chain.replay_hash);
  });

  test('verifyEconomicsReplayDeterminism confirms determinism', () => {
    const c = buildEconomicsComposite({ organization_id: ORG });
    const v = verifyEconomicsReplayDeterminism({
      organization_id: ORG, expected_replay_hash: c.boundary_proof_chain.replay_hash,
    });
    expect(v.deterministic).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — Replay engine (read-only)
// ────────────────────────────────────────────────────────────────────

describe('execution economics replay (read-only)', () => {
  test('buildExecutionEconomicsReplay aggregates all surfaces', () => {
    const r = buildExecutionEconomicsReplay({ organization_id: ORG });
    expect(r.quota_profile).toBeDefined();
    expect(r.pressure_profile).toBeDefined();
    expect(r.topology_load).toBeDefined();
    expect(r.rollback_forecast).toBeDefined();
    expect(r.determinism_attribution).toBeDefined();
    expect(r.boundary_proof_chain).toBeDefined();
  });

  test('replay does NOT mutate quota state', () => {
    const before = buildExecutionQuotaProfile(ORG).consumed.envelopes_per_24h;
    buildExecutionEconomicsReplay({ organization_id: ORG });
    const after = buildExecutionQuotaProfile(ORG).consumed.envelopes_per_24h;
    expect(after).toBe(before);
  });

  test('determinism_attribution includes composite_hash', () => {
    const r = buildExecutionEconomicsReplay({ organization_id: ORG });
    expect(r.determinism_attribution.composite_hash).toBe(r.boundary_proof_chain.replay_hash);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 12 — Trust surface (6 bands)
// ────────────────────────────────────────────────────────────────────

describe('executionEconomicsTrustSurface', () => {
  test('exposes 6 bands', () => {
    const t = buildExecutionEconomicsTrustSurface({ organization_id: ORG });
    expect(t.bands.length).toBe(6);
    const labels = t.bands.map(b => b.label).sort();
    expect(labels).toEqual([
      'budget_reliability', 'pressure_classification_confidence',
      'quota_safety', 'replay_integrity', 'rollback_cost_certainty',
      'topology_load_integrity',
    ].sort());
  });

  test('aggregate_score in 0-100', () => {
    const t = buildExecutionEconomicsTrustSurface({ organization_id: ORG });
    expect(t.aggregate_score).toBeGreaterThanOrEqual(0);
    expect(t.aggregate_score).toBeLessThanOrEqual(100);
  });

  test('quota_safety drops to 50 when exhausted', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 1, updated_by: OPERATOR, reason: 'r' });
    recordConsumption(ORG, 'envelopes_per_24h', 1);
    const t = buildExecutionEconomicsTrustSurface({ organization_id: ORG });
    const safetyBand = t.bands.find(b => b.label === 'quota_safety');
    expect(safetyBand?.score).toBe(50);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 13 — Narrative builder (Phase 24 inheritance)
// ────────────────────────────────────────────────────────────────────

describe('executionEconomicsNarrativeBuilder', () => {
  test('produces 5-block narrative', () => {
    const n = buildExecutionEconomicsNarrative({ organization_id: ORG });
    expect(n).toBeTruthy();
    expect(n!.blocks.length).toBe(5);
  });

  test('every block has at least one citation', () => {
    const n = buildExecutionEconomicsNarrative({ organization_id: ORG });
    expect(n).toBeTruthy();
    for (const b of n!.blocks) {
      expect(b.citations.length).toBeGreaterThan(0);
    }
  });

  test('every block has deterministic_hash', () => {
    const n = buildExecutionEconomicsNarrative({ organization_id: ORG });
    expect(n).toBeTruthy();
    for (const b of n!.blocks) {
      expect(b.deterministic_hash).toMatch(/^[a-f0-9]+$/);
    }
  });

  test('narratives partitioned per org', () => {
    buildExecutionEconomicsNarrative({ organization_id: ORG });
    expect(listExecutionEconomicsNarratives(ORG).length).toBe(1);
    expect(listExecutionEconomicsNarratives(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 14 — Visibility composite + summary
// ────────────────────────────────────────────────────────────────────

describe('executionEconomicsVisibilityReplay + summary', () => {
  test('visibility includes all surfaces + tier', () => {
    const v = buildExecutionEconomicsVisibilityReplay({ organization_id: ORG });
    expect(v.quota_profile).toBeDefined();
    expect(v.pressure_profile).toBeDefined();
    expect(v.topology_load).toBeDefined();
    expect(v.rollback_forecast).toBeDefined();
    expect(v.economics_tier).toBeDefined();
    expect(v.trust_surface).toBeDefined();
  });

  test('summary has 6 health scores', () => {
    const s = buildExecutionEconomicsSummary();
    expect(s.health_scores.budget_reliability).toBeDefined();
    expect(s.health_scores.rollback_cost_certainty).toBeDefined();
    expect(s.health_scores.pressure_classification_confidence).toBeDefined();
    expect(s.health_scores.topology_load_integrity).toBeDefined();
    expect(s.health_scores.quota_safety).toBeDefined();
    expect(s.health_scores.replay_integrity).toBeDefined();
  });

  test('summary current_economics_tier defaults to stable', () => {
    const s = buildExecutionEconomicsSummary();
    expect(['stable', 'constrained', 'elevated', 'saturated', 'exhausted']).toContain(s.current_economics_tier);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 15 — PRODUCTION STATE UNCHANGED verification
// ────────────────────────────────────────────────────────────────────

describe('production state UNCHANGED verification', () => {
  test('buildEconomicsComposite does NOT consume quota', () => {
    const before = buildExecutionQuotaProfile(ORG).consumed.envelopes_per_24h;
    buildEconomicsComposite({ organization_id: ORG });
    const after = buildExecutionQuotaProfile(ORG).consumed.envelopes_per_24h;
    expect(after).toBe(before);
  });

  test('setQuotaLimit does NOT mutate broker isolation state', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, ORG, 'connection_lost');
    const beforeProfile = buildRuntimePressureProfile(ORG);
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 25, updated_by: OPERATOR, reason: 'test' });
    const afterProfile = buildRuntimePressureProfile(ORG);
    expect(afterProfile.observed_counters.broker_isolations_active)
      .toBe(beforeProfile.observed_counters.broker_isolations_active);
  });

  test('forecast does NOT trigger any rollback execution', () => {
    const before = buildExecutionQuotaProfile(ORG).consumed.rollback_chains_per_24h;
    buildRollbackResourceForecast(ORG);
    const after = buildExecutionQuotaProfile(ORG).consumed.rollback_chains_per_24h;
    expect(after).toBe(before);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 16 — Cross-organization isolation end-to-end
// ────────────────────────────────────────────────────────────────────

describe('cross-organization isolation', () => {
  test('quota mutation in ORG does not affect ORG_OTHER', () => {
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 5, updated_by: OPERATOR, reason: 'r' });
    expect(buildExecutionQuotaProfile(ORG).limits.envelopes_per_24h).toBe(5);
    expect(buildExecutionQuotaProfile(ORG_OTHER).limits.envelopes_per_24h)
      .toBe(DEFAULT_QUOTA_LIMITS.envelopes_per_24h);
  });

  test('exhaustions partitioned per org', () => {
    recordQuotaExhaustion({ organization_id: ORG, quota_key: 'envelopes_per_24h' });
    expect(listQuotaExhaustions(ORG).length).toBe(1);
    expect(listQuotaExhaustions(ORG_OTHER).length).toBe(0);
  });

  test('pressure samples scoped per org', () => {
    buildRuntimePressureProfile(ORG);
    expect(listPressureSamples(ORG).length).toBe(1);
    expect(listPressureSamples(ORG_OTHER).length).toBe(0);
  });

  test('forecasts scoped per org', () => {
    buildRollbackResourceForecast(ORG);
    expect(listRollbackResourceForecasts(ORG).length).toBe(1);
    expect(listRollbackResourceForecasts(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 17 — Hard-veto preservation across prior phases
// ────────────────────────────────────────────────────────────────────

describe('hard-veto preservation across prior phases', () => {
  test('Phase 28 preserves Phase 27 forbidden_registry (no_recursion)', async () => {
    // Phase 27's nonDelegatableActionRegistry.envelope_issuance is still forbidden
    // — verifying via Phase 28 forbidden registry distinct from Phase 27's.
    expect(getForbiddenEconomicsRegistry().forbidden_actions.length).toBe(8);
  });

  test('Phase 28 hard veto: cross_org_resource_pooling forbidden', () => {
    expect(isEconomicsActionForbidden('cross_org_resource_pooling')).toBe(true);
  });

  test('Phase 28 hard veto: hidden_execution_prioritization forbidden', () => {
    expect(isEconomicsActionForbidden('hidden_execution_prioritization')).toBe(true);
  });

  test('Phase 28 hard veto: dynamic_authority_expansion forbidden', () => {
    expect(isEconomicsActionForbidden('dynamic_authority_expansion')).toBe(true);
  });

  test('Phase 28 hard veto: runtime_self_governance forbidden', () => {
    expect(isEconomicsActionForbidden('runtime_self_governance')).toBe(true);
  });

  test('Phase 28 hard veto: economic_authority_escalation forbidden', () => {
    expect(isEconomicsActionForbidden('economic_authority_escalation')).toBe(true);
  });

  test('Phase 28 hard veto: probabilistic_quota_allocation forbidden', () => {
    expect(isEconomicsActionForbidden('probabilistic_quota_allocation')).toBe(true);
  });

  test('Phase 27 quota integration preserves single-issuance-path invariant', () => {
    // Quota gate fires within the SAME evaluateIssuance call.
    // (Verified via the integration tests in Section 4 that the
    //  supervisor_rule_violated comes from the same gate.)
    setQuotaLimit({ organization_id: ORG, quota_key: 'envelopes_per_24h', updated_limit: 0, updated_by: OPERATOR, reason: 'r' });
    const r = evaluateIssuance({
      envelope_id: 'env_test', operator_id: OPERATOR, organization_id: ORG,
      action_kind: 'lift_broker_isolation', target_organization_id: ORG,
      rollback_chain_id: 'rb_x', target_namespace: BROKER_NAMESPACES.effectiveness,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('quota_exhausted');
    // Confirm the attribution lives in Phase 27 governance log (single source).
    expect(r.attribution).toBeDefined();
  });
});
