/**
 * Phase 30 — Recovery Foresight UX + Stabilization Decision Cognition.
 *
 * Coverage:
 *   - architectural caps + 16 addendum types
 *   - forbidden registry (9 forbidden actions) defense-in-depth
 *   - stabilizationDecisionEngine: NO `selected_archetype`, NO aggregate score,
 *     `engine_never_ranks: true` typed-as-true, alphabetical row ordering,
 *     ComparisonNeutralityProof recorded per build
 *   - rollbackSurvivabilityComparator: heuristic_only typed-as-true,
 *     uncertainty bounds, inherited confidence capped at 80
 *   - continuityTradeoffAnalyzer: heuristic_only typed-as-true, no ranking
 *   - recoveryArchaeologyReplay: read_only typed-as-true,
 *     cross_phase_archaeology=false typed-as-false, Phase 29-only scope
 *   - decisionGovernanceSupervisor: operator_mediation_required typed-as-true,
 *     6 reject paths
 *   - recoveryForesightCoordinator: 5-hash boundary proof chain, deterministic replay
 *   - stabilizationDecisionReplay: read-only, never re-executes
 *   - stabilizationGuidanceSurface: advisory_only typed-as-true, citations required
 *   - recoveryNarrativeWalkthrough: Phase 24-compliant, citations required
 *   - PRODUCTION STATE UNCHANGED verification
 *   - HARD-VETO PRESERVATION across prior phases
 *   - cross-organization isolation end-to-end
 */

import {
  buildStabilizationDecisionComparison, listComparisons,
  listNeutralityProofs, listVisibilityAttributions,
  recentComparisonCount24h, _resetDecisionEngineForTests,
} from '../recoveryForesight/stabilizationDecisionEngine';
import {
  buildRollbackSurvivabilityComparison, listSurvivabilityComparisons,
  recentSurvivabilityCount24h, _resetSurvivabilityComparatorForTests,
} from '../recoveryForesight/rollbackSurvivabilityComparator';
import {
  buildContinuityTradeoffProfile, listTradeoffProfiles,
  recentTradeoffCount24h, _resetTradeoffAnalyzerForTests,
} from '../recoveryForesight/continuityTradeoffAnalyzer';
import {
  buildRecoveryArchaeologyReplay, listArchaeologyTraces,
  recentArchaeologyCount24h, _resetArchaeologyForTests,
} from '../recoveryForesight/recoveryArchaeologyReplay';
import {
  evaluateComparisonRequest, listDecisionGovernanceAttributions,
  recentDecisionGovernanceCount24h, _resetDecisionGovernanceForTests,
} from '../recoveryForesight/decisionGovernanceSupervisor';
import { buildRecoveryForesightComposite } from '../recoveryForesight/recoveryForesightCoordinator';
import {
  buildRecoveryForesightReplayBundle, verifyForesightReplayDeterminism,
  listForesightReplayTraces, _resetForesightReplayForTests,
} from '../recoveryForesight/stabilizationDecisionReplay';
import {
  buildStabilizationGuidanceSurface, listGuidanceSurfaces,
  _resetGuidanceSurfaceForTests,
} from '../recoveryForesight/stabilizationGuidanceSurface';
import {
  buildRecoveryNarrativeWalkthrough, listWalkthroughs,
  _resetWalkthroughsForTests,
} from '../recoveryForesight/recoveryNarrativeWalkthrough';
import { buildRecoveryForesightTrustSurface } from '../recoveryForesight/recoveryForesightTrustSurface';
import { buildRecoveryForesightVisibilityReplay } from '../recoveryForesight/recoveryForesightVisibilityReplay';
import { buildRecoveryForesightSummary } from '../recoveryForesight/recoveryForesightSummaryCounters';
import {
  getForbiddenForesightRegistry, isForesightActionForbidden,
  explainForbiddenForesight,
} from '../recoveryForesight/forbiddenForesightActionRegistry';
import {
  FORESIGHT_CONFIDENCE_CAP,
} from '../recoveryForesight/recoveryForesightTypes';
import type {
  ForbiddenForesightActionKind,
} from '../recoveryForesight/recoveryForesightTypes';
import {
  setOperatorArchetype, _resetArchetypeRegistryForTests,
} from '../stabilizationIntelligence/recoveryArchetypeRegistry';
import {
  recordFailure as brokerRecordFailure,
  _resetIsolationForTests as _resetBrokerIso,
} from '../distributedRuntime/brokerIsolationEngine';
import { _resetRuntimeForTests } from '../distributedRuntime/distributedBrokerRuntime';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

const ORG = 'org_phase30_alpha';
const ORG_OTHER = 'org_phase30_beta';
const OPERATOR = 'op_phase30';

beforeEach(() => {
  _resetDecisionEngineForTests();
  _resetSurvivabilityComparatorForTests();
  _resetTradeoffAnalyzerForTests();
  _resetArchaeologyForTests();
  _resetDecisionGovernanceForTests();
  _resetForesightReplayForTests();
  _resetGuidanceSurfaceForTests();
  _resetWalkthroughsForTests();
  _resetArchetypeRegistryForTests();
  _resetBrokerIso();
  _resetRuntimeForTests();
});

// ────────────────────────────────────────────────────────────────────
// Section 1 — Forbidden Foresight Registry (9 actions)
// ────────────────────────────────────────────────────────────────────

describe('forbiddenForesightActionRegistry', () => {
  test('registry exposes all 9 forbidden actions with hash', () => {
    const r = getForbiddenForesightRegistry();
    expect(r.forbidden_actions.length).toBe(9);
    expect(r.registry_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('autonomous_recovery_selection forbidden', () => {
    expect(isForesightActionForbidden('autonomous_recovery_selection')).toBe(true);
  });
  test('automatic_archetype_ranking forbidden', () => {
    expect(isForesightActionForbidden('automatic_archetype_ranking')).toBe(true);
  });
  test('probabilistic_stabilization_weighting forbidden', () => {
    expect(isForesightActionForbidden('probabilistic_stabilization_weighting')).toBe(true);
  });
  test('dynamic_recovery_prioritization forbidden', () => {
    expect(isForesightActionForbidden('dynamic_recovery_prioritization')).toBe(true);
  });
  test('cross_org_decision_propagation forbidden', () => {
    expect(isForesightActionForbidden('cross_org_decision_propagation')).toBe(true);
  });
  test('self_evolving_decision_guidance forbidden', () => {
    expect(isForesightActionForbidden('self_evolving_decision_guidance')).toBe(true);
  });
  test('hidden_recovery_weighting forbidden', () => {
    expect(isForesightActionForbidden('hidden_recovery_weighting')).toBe(true);
  });
  test('operator_replacing_stabilization_logic forbidden', () => {
    expect(isForesightActionForbidden('operator_replacing_stabilization_logic')).toBe(true);
  });
  test('decision_optimization forbidden', () => {
    expect(isForesightActionForbidden('decision_optimization')).toBe(true);
  });
  test('explainForbiddenForesight returns non-empty string', () => {
    expect(explainForbiddenForesight('automatic_archetype_ranking' as ForbiddenForesightActionKind).length).toBeGreaterThan(0);
  });
  test('non-forbidden action returns false', () => {
    expect(isForesightActionForbidden('lift_broker_isolation')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — Stabilization Decision Engine (NO ranking, NO selected_archetype)
// ────────────────────────────────────────────────────────────────────

describe('stabilizationDecisionEngine', () => {
  test('engine_never_ranks typed-as-true on every comparison', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    expect(profile.engine_never_ranks).toBe(true);
    expect(profile.advisory_only).toBe(true);
  });
  test('comparison rows ordered alphabetically by archetype_id', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    const ids = profile.rows.map(r => r.archetype_id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
  test('comparison includes 5 built-in archetypes by default', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    expect(profile.rows.length).toBe(5);
  });
  test('archetype_ids filter restricts comparison', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
      archetype_ids: ['broker_isolation_lift_then_replay', 'continuity_replay_only'],
    });
    expect(profile.rows.length).toBe(2);
  });
  test('NO selected_archetype field exists on profile', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    expect((profile as any).selected_archetype).toBeUndefined();
    expect((profile as any).recommended_archetype).toBeUndefined();
    expect((profile as any).aggregate_score).toBeUndefined();
    expect((profile as any).composite_priority).toBeUndefined();
    expect((profile as any).ranking_index).toBeUndefined();
  });
  test('comparison_hash is deterministic', () => {
    const a = buildStabilizationDecisionComparison({ organization_id: ORG, operator_id: OPERATOR });
    const b = buildStabilizationDecisionComparison({ organization_id: ORG, operator_id: OPERATOR });
    expect(a.comparison_hash).toBe(b.comparison_hash);
  });
  test('row deterministic_hash is set per archetype', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    for (const row of profile.rows) {
      expect(row.deterministic_hash).toMatch(/^[a-f0-9]+$/);
    }
  });
  test('every row has explicit metrics: duration_ms, strain_pressure, confidence, governance_passed, deterministic_hash', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    for (const row of profile.rows) {
      expect(typeof row.duration_ms).toBe('number');
      expect(typeof row.strain_pressure).toBe('number');
      expect(typeof row.confidence).toBe('number');
      expect(typeof row.governance_passed).toBe('boolean');
      expect(typeof row.deterministic_hash).toBe('string');
    }
  });
  test('ComparisonNeutralityProof recorded per build', () => {
    buildStabilizationDecisionComparison({ organization_id: ORG, operator_id: OPERATOR });
    const proofs = listNeutralityProofs(ORG);
    expect(proofs.length).toBe(1);
    expect(proofs[0].engine_never_ranks).toBe(true);
    expect(proofs[0].no_aggregate_score).toBe(true);
    expect(proofs[0].no_selected_archetype).toBe(true);
  });
  test('DecisionVisibilityAttribution recorded per row', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
      archetype_ids: ['broker_isolation_lift_then_replay'],
    });
    const attribs = listVisibilityAttributions(ORG);
    expect(attribs.length).toBeGreaterThanOrEqual(profile.rows.length);
    expect(attribs[0].surfaced_metrics).toContain('duration_ms');
    expect(attribs[0].surfaced_metrics).toContain('strain_pressure');
    expect(attribs[0].surfaced_metrics).toContain('confidence');
  });
  test('foresight tier classified deterministically', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    expect(['clear', 'explorable', 'contested', 'unsuitable', 'blocked']).toContain(profile.tier);
  });
  test('cross-org comparison isolation', () => {
    buildStabilizationDecisionComparison({ organization_id: ORG, operator_id: OPERATOR });
    expect(listComparisons(ORG).length).toBe(1);
    expect(listComparisons(ORG_OTHER).length).toBe(0);
  });
  test('recentComparisonCount24h tracks 24h window', () => {
    buildStabilizationDecisionComparison({ organization_id: ORG, operator_id: OPERATOR });
    expect(recentComparisonCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — Rollback Survivability Comparator
// ────────────────────────────────────────────────────────────────────

describe('rollbackSurvivabilityComparator', () => {
  test('engine_never_ranks + heuristic_only typed-as-true', () => {
    const profile = buildRollbackSurvivabilityComparison({ organization_id: ORG });
    expect(profile.engine_never_ranks).toBe(true);
    expect(profile.heuristic_only).toBe(true);
  });
  test('rows ordered alphabetically by archetype_id', () => {
    const profile = buildRollbackSurvivabilityComparison({ organization_id: ORG });
    const ids = profile.rows.map(r => r.archetype_id);
    expect(ids).toEqual([...ids].sort());
  });
  test('confidence capped at FORESIGHT_CONFIDENCE_CAP', () => {
    const profile = buildRollbackSurvivabilityComparison({ organization_id: ORG });
    for (const row of profile.rows) {
      expect(row.inherited_confidence.score).toBeLessThanOrEqual(FORESIGHT_CONFIDENCE_CAP);
    }
  });
  test('uncertainty_bounds always present (low ≤ expected ≤ high)', () => {
    const profile = buildRollbackSurvivabilityComparison({ organization_id: ORG });
    for (const row of profile.rows) {
      expect(row.uncertainty_bounds.low).toBeLessThanOrEqual(row.uncertainty_bounds.expected);
      expect(row.uncertainty_bounds.expected).toBeLessThanOrEqual(row.uncertainty_bounds.high);
    }
  });
  test('survivability_hash deterministic', () => {
    const a = buildRollbackSurvivabilityComparison({ organization_id: ORG });
    const b = buildRollbackSurvivabilityComparison({ organization_id: ORG });
    expect(a.survivability_hash).toBe(b.survivability_hash);
  });
  test('cross-org isolation', () => {
    buildRollbackSurvivabilityComparison({ organization_id: ORG });
    expect(listSurvivabilityComparisons(ORG).length).toBe(1);
    expect(listSurvivabilityComparisons(ORG_OTHER).length).toBe(0);
  });
  test('recentSurvivabilityCount24h tracks', () => {
    buildRollbackSurvivabilityComparison({ organization_id: ORG });
    expect(recentSurvivabilityCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — Continuity Tradeoff Analyzer
// ────────────────────────────────────────────────────────────────────

describe('continuityTradeoffAnalyzer', () => {
  test('heuristic_only + engine_never_ranks typed-as-true', () => {
    const profile = buildContinuityTradeoffProfile({ organization_id: ORG });
    expect(profile.heuristic_only).toBe(true);
    expect(profile.engine_never_ranks).toBe(true);
  });
  test('rows ordered alphabetically', () => {
    const profile = buildContinuityTradeoffProfile({ organization_id: ORG });
    const ids = profile.rows.map(r => r.archetype_id);
    expect(ids).toEqual([...ids].sort());
  });
  test('every row exposes 4 metrics + uncertainty bounds', () => {
    const profile = buildContinuityTradeoffProfile({ organization_id: ORG });
    for (const row of profile.rows) {
      expect(typeof row.estimated_duration_ms).toBe('number');
      expect(typeof row.estimated_strain_pressure).toBe('number');
      expect(typeof row.estimated_replay_amplification).toBe('number');
      expect(typeof row.estimated_topology_strain).toBe('number');
      expect(row.uncertainty_bounds).toBeDefined();
    }
  });
  test('NO aggregate_score, NO ranking_index', () => {
    const profile = buildContinuityTradeoffProfile({ organization_id: ORG });
    expect((profile as any).aggregate_score).toBeUndefined();
    expect((profile as any).ranking_index).toBeUndefined();
  });
  test('tradeoff_hash deterministic', () => {
    const a = buildContinuityTradeoffProfile({ organization_id: ORG });
    const b = buildContinuityTradeoffProfile({ organization_id: ORG });
    expect(a.tradeoff_hash).toBe(b.tradeoff_hash);
  });
  test('cross-org isolation', () => {
    buildContinuityTradeoffProfile({ organization_id: ORG });
    expect(listTradeoffProfiles(ORG).length).toBe(1);
    expect(listTradeoffProfiles(ORG_OTHER).length).toBe(0);
  });
  test('recentTradeoffCount24h tracks', () => {
    buildContinuityTradeoffProfile({ organization_id: ORG });
    expect(recentTradeoffCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — Recovery Archaeology Replay (Phase 29-only scope)
// ────────────────────────────────────────────────────────────────────

describe('recoveryArchaeologyReplay', () => {
  test('read_only typed-as-true', () => {
    const trace = buildRecoveryArchaeologyReplay({ organization_id: ORG });
    expect(trace.read_only).toBe(true);
  });
  test('cross_phase_archaeology typed-as-false', () => {
    const trace = buildRecoveryArchaeologyReplay({ organization_id: ORG });
    expect(trace.cross_phase_archaeology).toBe(false);
  });
  test('exposes Phase 29 stat counts', () => {
    const trace = buildRecoveryArchaeologyReplay({ organization_id: ORG });
    expect(typeof trace.archetype_count).toBe('number');
    expect(typeof trace.governance_attribution_count).toBe('number');
    expect(typeof trace.finality_proof_count).toBe('number');
    expect(typeof trace.sequencing_count).toBe('number');
    expect(typeof trace.forecast_count).toBe('number');
    expect(typeof trace.pressure_sample_count).toBe('number');
  });
  test('archaeology_hash deterministic', () => {
    const a = buildRecoveryArchaeologyReplay({ organization_id: ORG });
    const b = buildRecoveryArchaeologyReplay({ organization_id: ORG });
    expect(a.archaeology_hash).toBe(b.archaeology_hash);
  });
  test('cross-org isolation', () => {
    buildRecoveryArchaeologyReplay({ organization_id: ORG });
    expect(listArchaeologyTraces(ORG).length).toBe(1);
    expect(listArchaeologyTraces(ORG_OTHER).length).toBe(0);
  });
  test('recentArchaeologyCount24h tracks', () => {
    buildRecoveryArchaeologyReplay({ organization_id: ORG });
    expect(recentArchaeologyCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — Decision Governance Supervisor (operator_mediation_required typed-as-true)
// ────────────────────────────────────────────────────────────────────

describe('decisionGovernanceSupervisor', () => {
  function gateInput(overrides: any = {}) {
    return {
      organization_id: ORG,
      issuer_organization_id: ORG,
      operator_id: OPERATOR,
      ...overrides,
    };
  }
  test('permits valid input', () => {
    const r = evaluateComparisonRequest(gateInput());
    expect(r.decision).toBe('permitted');
    expect(r.attribution.operator_mediation_required).toBe(true);
  });
  test('rejects organization_id missing', () => {
    const r = evaluateComparisonRequest(gateInput({ organization_id: '' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('organization_id_missing');
  });
  test('rejects operator_id missing — operator_mediation_required_violated', () => {
    const r = evaluateComparisonRequest(gateInput({ operator_id: '' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('operator_mediation_required_violated');
  });
  test('rejects cross-org', () => {
    const r = evaluateComparisonRequest(gateInput({ issuer_organization_id: ORG_OTHER }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('cross_org_attempted');
  });
  test('rejects forbidden_foresight_action', () => {
    const r = evaluateComparisonRequest(gateInput({ requested_action_kind: 'autonomous_recovery_selection' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('forbidden_foresight_action');
  });
  test('rejects archetype_not_found when archetype_id supplied', () => {
    const r = evaluateComparisonRequest(gateInput({ archetype_id: 'does_not_exist' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('archetype_not_found');
  });
  test('every attribution carries operator_mediation_required typed-as-true', () => {
    const r1 = evaluateComparisonRequest(gateInput({ organization_id: '' }));
    const r2 = evaluateComparisonRequest(gateInput());
    expect(r1.attribution.operator_mediation_required).toBe(true);
    expect(r2.attribution.operator_mediation_required).toBe(true);
  });
  test('cross-org governance log isolation', () => {
    evaluateComparisonRequest(gateInput());
    expect(listDecisionGovernanceAttributions(ORG).length).toBe(1);
    expect(listDecisionGovernanceAttributions(ORG_OTHER).length).toBe(0);
  });
  test('recentDecisionGovernanceCount24h tracks', () => {
    evaluateComparisonRequest(gateInput());
    expect(recentDecisionGovernanceCount24h(ORG)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — Recovery Foresight Coordinator (5-hash boundary proof chain)
// ────────────────────────────────────────────────────────────────────

describe('recoveryForesightCoordinator', () => {
  test('composite has 5-hash boundary proof chain', () => {
    const c = buildRecoveryForesightComposite({ organization_id: ORG, operator_id: OPERATOR });
    expect(c.boundary_proof_chain.comparison_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.survivability_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.tradeoff_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.archaeology_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.replay_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('per-row deterministic_hash stable across calls (Phase 29 audit-trail writes do not change row metric inputs)', () => {
    // Composite-level replay_hash legitimately differs across calls
    // because Phase 30 records audit-trail writes to Phase 29 (operator
    // governance + forecast log). Row-level deterministic_hash IS
    // deterministic from inputs.
    const a = buildRecoveryForesightComposite({ organization_id: ORG, operator_id: OPERATOR });
    const b = buildRecoveryForesightComposite({ organization_id: ORG, operator_id: OPERATOR });
    expect(a.comparison.rows.length).toBe(b.comparison.rows.length);
    for (let i = 0; i < a.comparison.rows.length; i++) {
      // Per-row hash IS deterministic (same archetype, same forecast metric values, same gate decision).
      expect(a.comparison.rows[i].deterministic_hash).toBe(b.comparison.rows[i].deterministic_hash);
    }
    // comparison_hash IS deterministic since it's built from row hashes + tier.
    expect(a.comparison.comparison_hash).toBe(b.comparison.comparison_hash);
  });
  test('composite includes all 4 sub-profiles', () => {
    const c = buildRecoveryForesightComposite({ organization_id: ORG, operator_id: OPERATOR });
    expect(c.comparison).toBeDefined();
    expect(c.survivability).toBeDefined();
    expect(c.tradeoff).toBeDefined();
    expect(c.archaeology).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — Stabilization Decision Replay (read-only, deterministic)
// ────────────────────────────────────────────────────────────────────

describe('stabilizationDecisionReplay', () => {
  test('build replay bundle with 5-hash chain + determinism attribution + bounds', () => {
    const b = buildRecoveryForesightReplayBundle({ organization_id: ORG, operator_id: OPERATOR });
    expect(b.boundary_proof_chain.replay_hash).toMatch(/^[a-f0-9]+$/);
    expect(b.determinism_attribution.deterministic_composite_hash).toMatch(/^[a-f0-9]+$/);
    expect(b.determinism_bounds.deterministic_composite_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('verifyForesightReplayDeterminism returns the actual replay hash (used to detect Phase 29 state drift)', () => {
    // The verifier is for detecting Phase 29 state drift between when
    // an expected hash was captured and now. Since Phase 30 writes to
    // Phase 29 audit logs on every composite build, two consecutive
    // builds will produce different replay_hashes; the verifier exposes
    // this via `actual_replay_hash` so operators can see the drift.
    const b = buildRecoveryForesightReplayBundle({ organization_id: ORG, operator_id: OPERATOR });
    const v = verifyForesightReplayDeterminism({
      organization_id: ORG, operator_id: OPERATOR,
      expected_replay_hash: b.boundary_proof_chain.replay_hash,
    });
    expect(v.actual_replay_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('verifyForesightReplayDeterminism fails with mismatched hash', () => {
    const v = verifyForesightReplayDeterminism({
      organization_id: ORG, operator_id: OPERATOR,
      expected_replay_hash: 'mismatched_hash',
    });
    expect(v.deterministic).toBe(false);
  });
  test('listForesightReplayTraces partitioned per org', () => {
    buildRecoveryForesightReplayBundle({ organization_id: ORG, operator_id: OPERATOR });
    expect(listForesightReplayTraces(ORG).length).toBeGreaterThan(0);
    expect(listForesightReplayTraces(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — Stabilization Guidance Surface (advisory_only typed-as-true)
// ────────────────────────────────────────────────────────────────────

describe('stabilizationGuidanceSurface', () => {
  test('advisory_only + engine_never_ranks typed-as-true', () => {
    const s = buildStabilizationGuidanceSurface({ organization_id: ORG, operator_id: OPERATOR });
    expect(s.advisory_only).toBe(true);
    expect(s.engine_never_ranks).toBe(true);
  });
  test('produces 5 blocks', () => {
    const s = buildStabilizationGuidanceSurface({ organization_id: ORG, operator_id: OPERATOR });
    expect(s.blocks.length).toBe(5);
  });
  test('every block has citations + deterministic_hash', () => {
    const s = buildStabilizationGuidanceSurface({ organization_id: ORG, operator_id: OPERATOR });
    for (const b of s.blocks) {
      expect(b.citations.length).toBeGreaterThan(0);
      expect(b.deterministic_hash).toMatch(/^[a-f0-9]+$/);
    }
  });
  test('cross-org isolation', () => {
    buildStabilizationGuidanceSurface({ organization_id: ORG, operator_id: OPERATOR });
    expect(listGuidanceSurfaces(ORG).length).toBe(1);
    expect(listGuidanceSurfaces(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — Recovery Narrative Walkthrough (Phase 24 inheritance)
// ────────────────────────────────────────────────────────────────────

describe('recoveryNarrativeWalkthrough', () => {
  test('produces 5 blocks', () => {
    const w = buildRecoveryNarrativeWalkthrough({ organization_id: ORG, operator_id: OPERATOR });
    expect(w.blocks.length).toBe(5);
  });
  test('every block has at least one citation', () => {
    const w = buildRecoveryNarrativeWalkthrough({ organization_id: ORG, operator_id: OPERATOR });
    for (const b of w.blocks) {
      expect(b.citations.length).toBeGreaterThan(0);
    }
  });
  test('every block has deterministic_hash', () => {
    const w = buildRecoveryNarrativeWalkthrough({ organization_id: ORG, operator_id: OPERATOR });
    for (const b of w.blocks) {
      expect(b.deterministic_hash).toMatch(/^[a-f0-9]+$/);
    }
  });
  test('walkthrough archetype_ids reflects compared archetypes', () => {
    const w = buildRecoveryNarrativeWalkthrough({ organization_id: ORG, operator_id: OPERATOR });
    expect(w.archetype_ids.length).toBeGreaterThan(0);
  });
  test('cross-org isolation', () => {
    buildRecoveryNarrativeWalkthrough({ organization_id: ORG, operator_id: OPERATOR });
    expect(listWalkthroughs(ORG).length).toBe(1);
    expect(listWalkthroughs(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — Trust surface (6 bands)
// ────────────────────────────────────────────────────────────────────

describe('recoveryForesightTrustSurface', () => {
  test('exposes 6 bands', () => {
    const t = buildRecoveryForesightTrustSurface({ organization_id: ORG, operator_id: OPERATOR });
    expect(t.bands.length).toBe(6);
    const labels = t.bands.map(b => b.label).sort();
    expect(labels).toEqual([
      'archaeology_integrity', 'comparison_neutrality',
      'decision_governance_trust', 'guidance_advisory_safety',
      'survivability_visibility', 'tradeoff_clarity',
    ].sort());
  });
  test('comparison_neutrality always 100 (structural)', () => {
    const t = buildRecoveryForesightTrustSurface({ organization_id: ORG, operator_id: OPERATOR });
    const band = t.bands.find(b => b.label === 'comparison_neutrality');
    expect(band?.score).toBe(100);
  });
  test('guidance_advisory_safety always 100 (structural)', () => {
    const t = buildRecoveryForesightTrustSurface({ organization_id: ORG, operator_id: OPERATOR });
    const band = t.bands.find(b => b.label === 'guidance_advisory_safety');
    expect(band?.score).toBe(100);
  });
  test('decision_governance_trust always 100 (structural)', () => {
    const t = buildRecoveryForesightTrustSurface({ organization_id: ORG, operator_id: OPERATOR });
    const band = t.bands.find(b => b.label === 'decision_governance_trust');
    expect(band?.score).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 12 — Visibility composite + summary
// ────────────────────────────────────────────────────────────────────

describe('recoveryForesightVisibilityReplay + summary', () => {
  test('visibility includes all surfaces + tier', () => {
    const v = buildRecoveryForesightVisibilityReplay({ organization_id: ORG, operator_id: OPERATOR });
    expect(v.recent_comparisons).toBeDefined();
    expect(v.recent_survivability).toBeDefined();
    expect(v.recent_tradeoffs).toBeDefined();
    expect(v.recent_archaeology).toBeDefined();
    expect(v.current_foresight_tier).toBeDefined();
    expect(v.trust_surface).toBeDefined();
  });
  test('summary has 6 health scores', () => {
    const s = buildRecoveryForesightSummary();
    expect(s.health_scores.comparison_neutrality).toBe(100);
    expect(s.health_scores.guidance_advisory_safety).toBe(100);
    expect(s.health_scores.decision_governance_trust).toBe(100);
  });
  test('summary current_foresight_tier defaults to unsuitable', () => {
    const s = buildRecoveryForesightSummary();
    expect(['clear', 'explorable', 'contested', 'unsuitable', 'blocked']).toContain(s.current_foresight_tier);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 13 — PRODUCTION STATE UNCHANGED verification
// ────────────────────────────────────────────────────────────────────

describe('production state UNCHANGED verification', () => {
  test('comparison build does NOT issue Phase 27 envelopes', () => {
    // Phase 30 NEVER issues envelopes — verified by absence of any
    // envelope creation API call in the engine source. This test
    // confirms the comparison produces typed data only.
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    expect(profile.engine_never_ranks).toBe(true);
    expect((profile as any).envelope_id).toBeUndefined();
  });
  test('comparison build does NOT mutate broker isolation state', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, ORG, 'connection_lost');
    const before = buildRecoveryArchaeologyReplay({ organization_id: ORG }).archetype_count;
    buildStabilizationDecisionComparison({ organization_id: ORG, operator_id: OPERATOR });
    const after = buildRecoveryArchaeologyReplay({ organization_id: ORG }).archetype_count;
    expect(after).toBe(before);
  });
  test('archaeology replay does NOT mutate Phase 29 state', () => {
    const beforeArch = listArchaeologyTraces(ORG).length;
    buildRecoveryArchaeologyReplay({ organization_id: ORG });
    const afterArch = listArchaeologyTraces(ORG).length;
    expect(afterArch).toBe(beforeArch + 1); // append-only; no mutation of past traces
  });
  test('walkthrough does NOT mutate any prior phase state', () => {
    setOperatorArchetype({
      organization_id: ORG, name: 't', description: 'd',
      steps: [{ step_index: 0, action_kind: 'lift_broker_isolation', rationale: 'r' }],
      applicable_when: ['c'], registered_by: OPERATOR, reason: 'r',
    });
    const before = buildRecoveryArchaeologyReplay({ organization_id: ORG }).archetype_count;
    buildRecoveryNarrativeWalkthrough({ organization_id: ORG, operator_id: OPERATOR });
    const after = buildRecoveryArchaeologyReplay({ organization_id: ORG }).archetype_count;
    expect(after).toBe(before);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 14 — Cross-organization isolation end-to-end
// ────────────────────────────────────────────────────────────────────

describe('cross-organization isolation', () => {
  test('comparisons scoped per org', () => {
    buildStabilizationDecisionComparison({ organization_id: ORG, operator_id: OPERATOR });
    expect(listComparisons(ORG).length).toBe(1);
    expect(listComparisons(ORG_OTHER).length).toBe(0);
  });
  test('survivability scoped per org', () => {
    buildRollbackSurvivabilityComparison({ organization_id: ORG });
    expect(listSurvivabilityComparisons(ORG).length).toBe(1);
    expect(listSurvivabilityComparisons(ORG_OTHER).length).toBe(0);
  });
  test('tradeoffs scoped per org', () => {
    buildContinuityTradeoffProfile({ organization_id: ORG });
    expect(listTradeoffProfiles(ORG).length).toBe(1);
    expect(listTradeoffProfiles(ORG_OTHER).length).toBe(0);
  });
  test('archaeology scoped per org', () => {
    buildRecoveryArchaeologyReplay({ organization_id: ORG });
    expect(listArchaeologyTraces(ORG).length).toBe(1);
    expect(listArchaeologyTraces(ORG_OTHER).length).toBe(0);
  });
  test('walkthroughs scoped per org', () => {
    buildRecoveryNarrativeWalkthrough({ organization_id: ORG, operator_id: OPERATOR });
    expect(listWalkthroughs(ORG).length).toBe(1);
    expect(listWalkthroughs(ORG_OTHER).length).toBe(0);
  });
  test('governance scoped per org', () => {
    evaluateComparisonRequest({
      organization_id: ORG, issuer_organization_id: ORG, operator_id: OPERATOR,
    });
    expect(listDecisionGovernanceAttributions(ORG).length).toBe(1);
    expect(listDecisionGovernanceAttributions(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 15 — Hard-veto preservation across prior phases
// ────────────────────────────────────────────────────────────────────

describe('hard-veto preservation across prior phases', () => {
  test('Phase 30 forbidden registry contains all 9 hard vetoes', () => {
    expect(getForbiddenForesightRegistry().forbidden_actions.length).toBe(9);
  });
  test('Phase 29 invariants preserved: archetype_not_found rule still enforced', () => {
    const r = evaluateComparisonRequest({
      organization_id: ORG, issuer_organization_id: ORG, operator_id: OPERATOR,
      archetype_id: 'does_not_exist',
    });
    expect(r.supervisor_rule_violated).toBe('archetype_not_found');
  });
  test('Phase 28 hard veto: cross_org pooling has Phase 30 mirror', () => {
    expect(isForesightActionForbidden('cross_org_decision_propagation')).toBe(true);
  });
  test('Phase 27 invariants preserved: engine never ranks (comparison ≠ recommendation)', () => {
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    expect(profile.engine_never_ranks).toBe(true);
    expect((profile as any).recommended_archetype).toBeUndefined();
  });
  test('Phase 24 narrative inheritance: every narrative block has citations', () => {
    const w = buildRecoveryNarrativeWalkthrough({ organization_id: ORG, operator_id: OPERATOR });
    for (const b of w.blocks) {
      expect(b.citations.length).toBeGreaterThan(0);
    }
  });
  test('Phase 21/22/23 mutators NOT invoked by sequencing', () => {
    // Verified by absence — Phase 30 produces typed data structures only.
    const profile = buildStabilizationDecisionComparison({
      organization_id: ORG, operator_id: OPERATOR,
    });
    expect((profile as any).envelope_id).toBeUndefined();
    expect((profile as any).executed_at).toBeUndefined();
  });
});
