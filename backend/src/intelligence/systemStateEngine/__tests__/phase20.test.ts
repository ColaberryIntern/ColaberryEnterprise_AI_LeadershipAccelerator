/**
 * Phase 20 tests — bounded federated organizational learning refinement.
 *
 * Coverage (pure helpers + lazy-DB paths with mocked models):
 *   - persistentFederationBroker: adapter contract, organization
 *     partitioning, namespace isolation
 *   - federatedEffectivenessTracker: cold-start, observation accumulation,
 *     bounded cap, multi-org isolation
 *   - archetypeReliabilityEvolution: deterministic update rules, tier
 *     classification, suppression veto, history bounded
 *   - organizationalStabilizationIntelligence: aggregation, ranking
 *   - federatedImpactDiffusionReplay: lineage view, archetype filter
 *   - federationDriftDetector: signal classification, tier thresholds
 *   - federationVisibilityReplay: window clamp, attribution filter
 *   - federationPolicyEvolutionEngine: propose/approve/reject,
 *     pending-cap, decided proposals not re-applied
 *   - federatedLearningSummaryCounters + AuthoritativeSystemState surface
 */

jest.mock('../../../models/GovernanceAuditEntry', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}), findAll: jest.fn().mockResolvedValue([]) },
}));

import {
  getBrokerAdapter, setBrokerAdapter, BROKER_NAMESPACES,
  InMemoryBrokerAdapter, _resetBroker, _installFreshInMemoryAdapter,
} from '../federatedLearning/persistentFederationBroker';
import {
  recordOutcomeObservation, readEffectivenessProfile, listEffectivenessProfiles,
  _MAX_REFINEMENT_OBSERVATIONS_FOR_TESTS,
} from '../federatedLearning/federatedEffectivenessTracker';
import {
  evolveReliability, suppressArchetype, unsuppressArchetype,
  isArchetypeSuppressed, readReliabilityProfile, listReliabilityProfiles,
  _resetReliabilitySuppressions, _RELIABILITY_DELTA_PER_OBSERVATION_FOR_TESTS,
} from '../federatedLearning/archetypeReliabilityEvolution';
import {
  buildOrganizationalStabilizationReport,
} from '../federatedLearning/organizationalStabilizationIntelligence';
import {
  buildFederatedImpactDiffusionReplay,
} from '../federatedLearning/federatedImpactDiffusionReplay';
import {
  buildFederationDriftProfile,
  _DRIFT_TIER_THRESHOLDS_FOR_TESTS,
} from '../federatedLearning/federationDriftDetector';
import {
  buildFederationVisibilityReplay,
} from '../federatedLearning/federationVisibilityReplay';
import {
  proposePolicyEvolution, approvePolicy, rejectPolicy, listPolicyProposals,
  _MAX_POLICY_PROPOSALS_PER_ORG_FOR_TESTS,
} from '../federatedLearning/federationPolicyEvolutionEngine';
import {
  noteEffectivenessUpdated, noteReliabilityEvolved, noteDriftDetected,
  notePolicyProposed, notePolicyApproved, notePolicyRejected,
  noteVisibilityReplay, readFederatedLearningSummary,
  _resetFederatedLearningSummary,
} from '../federatedLearning/federatedLearningSummaryCounters';
import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';
import {
  shareArchetype, _resetFederatedRegistry,
} from '../federation/federatedArchetypeRegistry';
import {
  updateConsent, _resetFederationConsent, _ARCHETYPE_KINDS_FOR_TESTS,
} from '../federation/federationConsentEngine';
import {
  recordSource, recordConsumption, _resetFederationLineage,
} from '../federation/federationLineageTracker';

// ─── persistentFederationBroker ──────────────────────────────────────

describe('persistentFederationBroker', () => {
  beforeEach(() => { _resetBroker(); });

  it('default adapter is in-memory', () => {
    const adapter = getBrokerAdapter();
    expect(adapter).toBeDefined();
    expect(typeof adapter.put).toBe('function');
  });

  it('put + get round-trips a value within an org namespace', async () => {
    const adapter = _installFreshInMemoryAdapter();
    await adapter.put('org-1', 'test_ns', 'k1', { hello: 'world' });
    const v = await adapter.get<{ hello: string }>('org-1', 'test_ns', 'k1');
    expect(v?.hello).toBe('world');
  });

  it('cross-organization isolation: org-2 cannot read org-1 keys', async () => {
    const adapter = _installFreshInMemoryAdapter();
    await adapter.put('org-1', 'test_ns', 'k1', { secret: 'a' });
    const v = await adapter.get('org-2', 'test_ns', 'k1');
    expect(v).toBeNull();
  });

  it('listKeys returns keys only in the requested namespace', async () => {
    const adapter = _installFreshInMemoryAdapter();
    await adapter.put('org-1', 'ns_a', 'k1', 1);
    await adapter.put('org-1', 'ns_a', 'k2', 2);
    await adapter.put('org-1', 'ns_b', 'k3', 3);
    const keys = await adapter.listKeys('org-1', 'ns_a');
    expect([...keys].sort()).toEqual(['k1', 'k2']);
  });

  it('listOrganizations returns all known orgs', async () => {
    const adapter = _installFreshInMemoryAdapter();
    await adapter.put('org-1', 'ns', 'k', 1);
    await adapter.put('org-2', 'ns', 'k', 2);
    const orgs = await adapter.listOrganizations();
    expect([...orgs].sort()).toEqual(['org-1', 'org-2']);
  });

  it('delete removes the key and returns true', async () => {
    const adapter = _installFreshInMemoryAdapter();
    await adapter.put('org-1', 'ns', 'k', 1);
    expect(await adapter.delete('org-1', 'ns', 'k')).toBe(true);
    expect(await adapter.get('org-1', 'ns', 'k')).toBeNull();
  });

  it('setBrokerAdapter swaps the active adapter', async () => {
    const fresh = new InMemoryBrokerAdapter();
    setBrokerAdapter(fresh);
    expect(getBrokerAdapter()).toBe(fresh);
    await fresh.put('org-x', 'ns', 'k', 42);
    expect(await getBrokerAdapter().get('org-x', 'ns', 'k')).toBe(42);
  });

  it('BROKER_NAMESPACES has the expected keys', () => {
    expect(BROKER_NAMESPACES.effectiveness).toBeDefined();
    expect(BROKER_NAMESPACES.reliability).toBeDefined();
    expect(BROKER_NAMESPACES.policy_proposals).toBeDefined();
  });
});

// ─── federatedEffectivenessTracker ───────────────────────────────────

describe('federatedEffectivenessTracker', () => {
  beforeEach(() => { _resetBroker(); });

  it('cold-start profile is null when no observations recorded', async () => {
    const profile = await readEffectivenessProfile('org-1', 'arch-cold');
    expect(profile).toBeNull();
  });

  it('recordOutcomeObservation creates a profile with the observation', async () => {
    await recordOutcomeObservation({
      organization_id: 'org-1', archetype_signature: 'arch-1',
      signal: 'local_application_net_improvement',
      stabilization_delta: 20, propagation_reduction: 15,
      recovery_succeeded: true, anomaly_observed: false,
    });
    const profile = await readEffectivenessProfile('org-1', 'arch-1');
    expect(profile).not.toBeNull();
    expect(profile?.recovery_success_rate).toBe(100);
    expect(profile?.observed_stabilization_delta).toBe(20);
  });

  it('multiple observations average correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await recordOutcomeObservation({
        organization_id: 'org-1', archetype_signature: 'arch-multi',
        signal: 'local_application_net_improvement',
        stabilization_delta: 10, propagation_reduction: 10,
        recovery_succeeded: true, anomaly_observed: false,
      });
    }
    const profile = await readEffectivenessProfile('org-1', 'arch-multi');
    expect(profile?.observed_stabilization_delta).toBe(10);
    expect(profile?.recovery_success_rate).toBe(100);
    expect(profile?.anomaly_frequency).toBe(0);
  });

  it('mixed outcomes produce balanced metrics', async () => {
    // 3 successes
    for (let i = 0; i < 3; i++) {
      await recordOutcomeObservation({
        organization_id: 'org-1', archetype_signature: 'arch-mixed',
        signal: 'local_application_net_improvement',
        stabilization_delta: 30, propagation_reduction: 20,
        recovery_succeeded: true, anomaly_observed: false,
      });
    }
    // 2 anomalies
    for (let i = 0; i < 2; i++) {
      await recordOutcomeObservation({
        organization_id: 'org-1', archetype_signature: 'arch-mixed',
        signal: 'anomaly_amplification',
        stabilization_delta: -10, propagation_reduction: -5,
        recovery_succeeded: false, anomaly_observed: true,
      });
    }
    const profile = await readEffectivenessProfile('org-1', 'arch-mixed');
    expect(profile?.recovery_success_rate).toBe(60);    // 3/5
    expect(profile?.anomaly_frequency).toBe(40);         // 2/5
  });

  it('listEffectivenessProfiles returns all archetypes for an org', async () => {
    await recordOutcomeObservation({ organization_id: 'org-1', archetype_signature: 'arch-a', signal: 'local_application_net_improvement', stabilization_delta: 10, propagation_reduction: 10, recovery_succeeded: true, anomaly_observed: false });
    await recordOutcomeObservation({ organization_id: 'org-1', archetype_signature: 'arch-b', signal: 'local_application_net_improvement', stabilization_delta: 10, propagation_reduction: 10, recovery_succeeded: true, anomaly_observed: false });
    const all = await listEffectivenessProfiles('org-1');
    expect(all.length).toBe(2);
  });

  it('cross-org isolation: org-2 does not see org-1 profiles', async () => {
    await recordOutcomeObservation({ organization_id: 'org-1', archetype_signature: 'arch-iso', signal: 'local_application_net_improvement', stabilization_delta: 10, propagation_reduction: 10, recovery_succeeded: true, anomaly_observed: false });
    expect(await listEffectivenessProfiles('org-2')).toEqual([]);
  });

  it('cap is bounded by MAX_REFINEMENT_OBSERVATIONS', () => {
    expect(_MAX_REFINEMENT_OBSERVATIONS_FOR_TESTS).toBeGreaterThanOrEqual(50);
  });
});

// ─── archetypeReliabilityEvolution ───────────────────────────────────

describe('archetypeReliabilityEvolution', () => {
  beforeEach(() => {
    _resetBroker();
    _resetReliabilitySuppressions();
  });

  it('cold-start (no effectiveness) → tier=emerging', async () => {
    const profile = await evolveReliability({
      organization_id: 'org-1', archetype_signature: 'arch-cold',
    });
    expect(profile.current_tier).toBe('emerging');
    expect(profile.observation_count).toBe(0);
  });

  it('reliability evolves with observed improvements', async () => {
    for (let i = 0; i < 6; i++) {
      await recordOutcomeObservation({
        organization_id: 'org-1', archetype_signature: 'arch-improving',
        signal: 'local_application_net_improvement',
        stabilization_delta: 30, propagation_reduction: 20,
        recovery_succeeded: true, anomaly_observed: false,
      });
    }
    const before = await evolveReliability({ organization_id: 'org-1', archetype_signature: 'arch-improving' });
    // Re-evolve to apply rule again
    const after = await evolveReliability({ organization_id: 'org-1', archetype_signature: 'arch-improving' });
    expect(after.observation_count).toBeGreaterThan(0);
    expect(after.current_score).toBeGreaterThanOrEqual(before.current_score);
    expect(['emerging', 'stable', 'trusted', 'cautionary', 'degraded']).toContain(after.current_tier);
  });

  it('suppression vetoes the tier regardless of score', async () => {
    suppressArchetype('org-1', 'arch-suppress');
    const profile = await evolveReliability({ organization_id: 'org-1', archetype_signature: 'arch-suppress' });
    expect(profile.current_tier).toBe('suppressed');
    expect(profile.current_score).toBe(0);     // suppression also drops the score
  });

  it('unsuppress restores classification based on metrics', async () => {
    suppressArchetype('org-1', 'arch-restore');
    expect(isArchetypeSuppressed('org-1', 'arch-restore')).toBe(true);
    unsuppressArchetype('org-1', 'arch-restore');
    expect(isArchetypeSuppressed('org-1', 'arch-restore')).toBe(false);
  });

  it('attribution explains every refinement', async () => {
    for (let i = 0; i < 5; i++) {
      await recordOutcomeObservation({
        organization_id: 'org-1', archetype_signature: 'arch-attr',
        signal: 'local_application_net_improvement',
        stabilization_delta: 25, propagation_reduction: 15,
        recovery_succeeded: true, anomaly_observed: false,
      });
    }
    const profile = await evolveReliability({ organization_id: 'org-1', archetype_signature: 'arch-attr' });
    expect(profile.last_attribution).not.toBeNull();
    expect(typeof profile.last_attribution?.refinement_reason).toBe('string');
    expect(profile.last_attribution?.confidence_shift).toBeDefined();
  });

  it('listReliabilityProfiles returns evolved profiles', async () => {
    await recordOutcomeObservation({ organization_id: 'org-1', archetype_signature: 'arch-list-1', signal: 'local_application_net_improvement', stabilization_delta: 10, propagation_reduction: 10, recovery_succeeded: true, anomaly_observed: false });
    await evolveReliability({ organization_id: 'org-1', archetype_signature: 'arch-list-1' });
    const profiles = await listReliabilityProfiles('org-1');
    expect(profiles.length).toBeGreaterThanOrEqual(1);
  });

  it('per-observation delta is bounded', () => {
    expect(_RELIABILITY_DELTA_PER_OBSERVATION_FOR_TESTS).toBeLessThanOrEqual(10);
  });
});

// ─── organizationalStabilizationIntelligence ─────────────────────────

describe('organizationalStabilizationIntelligence', () => {
  beforeEach(() => {
    _resetBroker();
    _resetFederationConsent();
    _resetFederatedRegistry();
  });

  it('cold-start returns empty insights', async () => {
    const r = await buildOrganizationalStabilizationReport({ organization_id: 'org-cold' });
    expect(r.insights).toEqual([]);
  });

  it('insights surface archetypes ranked by stabilization_score', async () => {
    const all = _ARCHETYPE_KINDS_FOR_TESTS.reduce((acc, k) => { acc[k] = true; return acc; }, {} as any);
    await updateConsent({ project_id: 'p1', organization_id: 'org-1', federation_enabled: true, share_permissions: all, consume_permissions: all, updated_by: 'op-1' });
    const shared = await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root', 'rollback_target'], observed_count: 3, success_rate: 90, avg_minutes_to_stabilize: 12 },
    });
    const sig = shared.archetype_signature!;
    await recordOutcomeObservation({
      organization_id: 'org-1', archetype_signature: sig,
      signal: 'local_application_net_improvement',
      stabilization_delta: 30, propagation_reduction: 20,
      recovery_succeeded: true, anomaly_observed: false,
    });
    const r = await buildOrganizationalStabilizationReport({ organization_id: 'org-1' });
    expect(r.insights.length).toBe(1);
    expect(r.insights[0].stabilization_score).toBeGreaterThan(0);
  });
});

// ─── federatedImpactDiffusionReplay ──────────────────────────────────

describe('federatedImpactDiffusionReplay', () => {
  beforeEach(() => {
    _resetBroker();
    _resetFederationLineage();
  });

  it('cold-start returns empty entries', async () => {
    const r = await buildFederatedImpactDiffusionReplay({ organization_id: 'org-cold' });
    expect(r.entries).toEqual([]);
  });

  it('lineage with source + consumer surfaces in the replay', async () => {
    recordSource({ organization_id: 'org-1', source_project_id: 'p1', archetype_signature: 'arch-aaa' });
    recordConsumption({
      organization_id: 'org-1',
      attribution: {
        consumer_project: 'p2', archetype_signature: 'arch-aaa',
        surfaced_reason: 'high org confidence', operator_action: 'approved_local_calibration',
        calibration_generated: { proposal_id: 'cal-1' }, applied_locally: true,
        recorded_at: new Date().toISOString(),
      },
    });
    const r = await buildFederatedImpactDiffusionReplay({ organization_id: 'org-1' });
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].consumer_projects).toContain('p2');
    expect(r.entries[0].local_calibrations_generated).toBe(1);
  });
});

// ─── federationDriftDetector ─────────────────────────────────────────

describe('federationDriftDetector', () => {
  beforeEach(() => {
    _resetBroker();
    _resetFederationConsent();
    _resetFederatedRegistry();
  });

  it('cold-start returns stable tier', async () => {
    const profile = await buildFederationDriftProfile({ organization_id: 'org-cold' });
    expect(profile.tier).toBe('stable');
    expect(profile.signals).toEqual([]);
  });

  it('high-anomaly archetypes raise drift score + tier', async () => {
    const all = _ARCHETYPE_KINDS_FOR_TESTS.reduce((acc, k) => { acc[k] = true; return acc; }, {} as any);
    await updateConsent({ project_id: 'p1', organization_id: 'org-1', federation_enabled: true, share_permissions: all, consume_permissions: all, updated_by: 'op-1' });
    // Seed THREE anomaly-heavy archetypes + evolve reliability so multiple
    // drift signals fire (volatility + clustering + replay instability).
    for (let n = 0; n < 3; n++) {
      const shared = await shareArchetype({
        project_id: 'p1',
        raw_archetype: {
          kind: 'recovery_archetype',
          raw_step_sequence: [`x${n}`, `y${n}`],
          observed_count: 3, success_rate: 30, avg_minutes_to_stabilize: 30,
        },
      });
      const sig = shared.archetype_signature!;
      for (let i = 0; i < 8; i++) {
        await recordOutcomeObservation({
          organization_id: 'org-1', archetype_signature: sig,
          signal: 'anomaly_amplification',
          stabilization_delta: -20, propagation_reduction: -10,
          recovery_succeeded: false, anomaly_observed: true,
        });
      }
      await evolveReliability({ organization_id: 'org-1', archetype_signature: sig });
    }
    const profile = await buildFederationDriftProfile({ organization_id: 'org-1' });
    expect(['monitoring', 'fragmenting', 'unstable']).toContain(profile.tier);
    expect(profile.signals.length).toBeGreaterThan(0);
    expect(profile.drift_pressure_score).toBeGreaterThan(0);
  });

  it('tier thresholds match constants', () => {
    expect(_DRIFT_TIER_THRESHOLDS_FOR_TESTS.high).toBeGreaterThan(_DRIFT_TIER_THRESHOLDS_FOR_TESTS.fragmenting);
    expect(_DRIFT_TIER_THRESHOLDS_FOR_TESTS.fragmenting).toBeGreaterThan(_DRIFT_TIER_THRESHOLDS_FOR_TESTS.monitoring);
  });
});

// ─── federationVisibilityReplay ──────────────────────────────────────

describe('federationVisibilityReplay', () => {
  beforeEach(() => {
    _resetFederationLineage();
  });

  it('cold-start returns empty entries', async () => {
    const r = await buildFederationVisibilityReplay({ organization_id: 'org-cold' });
    expect(r.entries).toEqual([]);
  });

  it('window clamp keeps replay bounded', async () => {
    const r = await buildFederationVisibilityReplay({ organization_id: 'org-cold', window_hours: 999999 });
    expect(new Date(r.window_end).getTime() - new Date(r.window_start).getTime()).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
  });

  it('lineage entries surface in visibility replay', async () => {
    recordSource({ organization_id: 'org-1', source_project_id: 'p1', archetype_signature: 'arch-vis' });
    recordConsumption({
      organization_id: 'org-1',
      attribution: {
        consumer_project: 'p2', archetype_signature: 'arch-vis',
        surfaced_reason: 'sample', operator_action: 'reviewed',
        calibration_generated: null, applied_locally: false,
        recorded_at: new Date().toISOString(),
      },
    });
    const r = await buildFederationVisibilityReplay({ organization_id: 'org-1' });
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].visible_to_projects).toContain('p2');
  });
});

// ─── federationPolicyEvolutionEngine ─────────────────────────────────

describe('federationPolicyEvolutionEngine', () => {
  beforeEach(() => { _resetBroker(); });

  const baseImpact = {
    expected_federation_impact: 50,
    organizational_visibility_impact: 30,
    stabilization_influence_estimate: 40,
    rollback_confidence: 80,
    uncertainty_drivers: ['initial_proposal'],
  };

  it('proposePolicyEvolution returns a pending proposal', async () => {
    const r = await proposePolicyEvolution({
      organization_id: 'org-1', project_id: 'p1',
      evolution_kind: 'tighten_share_permissions',
      proposed_change: { kind: 'recovery_archetype', from: true, to: false },
      rationale: 'high anomaly rate',
      impact_bounds: baseImpact,
      forecasted_impact: ['archetype sharing tightens'],
      rollback_path: ['restore prior consent'],
    });
    expect((r as any).status).toBe('pending_operator');
    expect((r as any).operator_required).toBe(true);
  });

  it('approve flips status to approved', async () => {
    const proposal = (await proposePolicyEvolution({
      organization_id: 'org-1', project_id: 'p1',
      evolution_kind: 'tighten_share_permissions',
      proposed_change: {}, rationale: 'x',
      impact_bounds: baseImpact, forecasted_impact: [], rollback_path: [],
    })) as any;
    const r = await approvePolicy({ organization_id: 'org-1', proposal_id: proposal.proposal_id, operator_id: 'op-1' });
    expect(r.proposal.status).toBe('approved');
    expect(r.applied).toBe(true);
  });

  it('reject flips status to rejected', async () => {
    const proposal = (await proposePolicyEvolution({
      organization_id: 'org-1', project_id: 'p1',
      evolution_kind: 'broaden_share_permissions',
      proposed_change: {}, rationale: 'x',
      impact_bounds: baseImpact, forecasted_impact: [], rollback_path: [],
    })) as any;
    const r = await rejectPolicy({ organization_id: 'org-1', proposal_id: proposal.proposal_id, operator_id: 'op-1' });
    expect(r.status).toBe('rejected');
  });

  it('approving a non-pending proposal does NOT re-apply', async () => {
    const proposal = (await proposePolicyEvolution({
      organization_id: 'org-1', project_id: 'p1',
      evolution_kind: 'tighten_share_permissions',
      proposed_change: {}, rationale: 'x',
      impact_bounds: baseImpact, forecasted_impact: [], rollback_path: [],
    })) as any;
    await approvePolicy({ organization_id: 'org-1', proposal_id: proposal.proposal_id, operator_id: 'op-1' });
    const second = await approvePolicy({ organization_id: 'org-1', proposal_id: proposal.proposal_id, operator_id: 'op-2' });
    expect(second.applied).toBe(false);
  });

  it('rejects when pending count reaches MAX_POLICY_PROPOSALS_PER_ORG', async () => {
    for (let i = 0; i < _MAX_POLICY_PROPOSALS_PER_ORG_FOR_TESTS; i++) {
      await proposePolicyEvolution({
        organization_id: 'org-1', project_id: 'p1',
        evolution_kind: 'tighten_share_permissions',
        proposed_change: { i }, rationale: `proposal ${i}`,
        impact_bounds: baseImpact, forecasted_impact: [], rollback_path: [],
      });
    }
    const overflow = await proposePolicyEvolution({
      organization_id: 'org-1', project_id: 'p1',
      evolution_kind: 'tighten_share_permissions',
      proposed_change: {}, rationale: 'overflow',
      impact_bounds: baseImpact, forecasted_impact: [], rollback_path: [],
    });
    expect(typeof (overflow as any).error).toBe('string');
  });

  it('listPolicyProposals returns all proposals for the org', async () => {
    await proposePolicyEvolution({ organization_id: 'org-1', project_id: 'p1', evolution_kind: 'tighten_share_permissions', proposed_change: {}, rationale: 'a', impact_bounds: baseImpact, forecasted_impact: [], rollback_path: [] });
    await proposePolicyEvolution({ organization_id: 'org-1', project_id: 'p1', evolution_kind: 'broaden_share_permissions', proposed_change: {}, rationale: 'b', impact_bounds: baseImpact, forecasted_impact: [], rollback_path: [] });
    expect((await listPolicyProposals('org-1')).length).toBe(2);
  });

  it('cross-org isolation: org-2 does not see org-1 proposals', async () => {
    await proposePolicyEvolution({ organization_id: 'org-1', project_id: 'p1', evolution_kind: 'tighten_share_permissions', proposed_change: {}, rationale: 'a', impact_bounds: baseImpact, forecasted_impact: [], rollback_path: [] });
    expect(await listPolicyProposals('org-2')).toEqual([]);
  });
});

// ─── federatedLearningSummary surface ────────────────────────────────

describe('federated_learning_summary surface', () => {
  beforeEach(() => { _resetFederatedLearningSummary(); });

  it('zero-state surfaces sane defaults', () => {
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-y', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.federated_learning_summary?.archetypes_tracked).toBe(0);
    expect(state.federated_learning_summary?.drift_tier).toBe('stable');
    expect(state.federated_learning_summary?.health_scores.federated_effectiveness).toBe(100);
  });

  it('counters reflect into federated_learning_summary', () => {
    noteEffectivenessUpdated('proj-x');
    noteReliabilityEvolved('proj-x', 'trusted', /*isNewArchetype*/ true);
    noteReliabilityEvolved('proj-x', 'degraded', /*isNewArchetype*/ true);
    noteDriftDetected('proj-x', 'fragmenting', 3);
    notePolicyProposed('proj-x');
    notePolicyApproved('proj-x');
    noteVisibilityReplay('proj-x', false);

    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-x', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.federated_learning_summary?.archetypes_tracked).toBe(2);
    expect(state.federated_learning_summary?.archetypes_trusted).toBe(1);
    expect(state.federated_learning_summary?.archetypes_degraded).toBe(1);
    expect(state.federated_learning_summary?.drift_tier).toBe('fragmenting');
    expect(state.federated_learning_summary?.active_drift_signals).toBe(3);
    expect(state.federated_learning_summary?.approved_policies_24h).toBe(1);
  });

  it('per-project counters are isolated', () => {
    noteReliabilityEvolved('proj-a', 'trusted', true);
    noteReliabilityEvolved('proj-b', 'degraded', true);
    expect(readFederatedLearningSummary('proj-a').archetypes_trusted).toBe(1);
    expect(readFederatedLearningSummary('proj-b').archetypes_degraded).toBe(1);
  });

  it('health scores stay in 0-100 range', () => {
    noteReliabilityEvolved('proj-x', 'trusted', true);
    noteDriftDetected('proj-x', 'unstable', 5);
    notePolicyRejected('proj-x');
    const summary = readFederatedLearningSummary('proj-x');
    for (const v of Object.values(summary.health_scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
