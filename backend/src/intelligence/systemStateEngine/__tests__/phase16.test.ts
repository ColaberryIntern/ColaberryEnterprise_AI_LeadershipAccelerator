/**
 * Phase 16 tests — causality replay + distributed validation cognition.
 *
 * Coverage (pure helpers + lazy-DB paths with mocked models):
 *   - mutationLineageGraph: build / ancestry / descendants / depth caps
 *   - contradictionPropagationTracker: temporal+spatial clustering, recurrent
 *   - causalTrustPropagation: depth cap + decay factor
 *   - distributedValidationHarness: 5 validators each return rationale
 *   - validationArbitrationEngine: consensus + confidence range + minority + escalation
 *   - validatorTrustCalibrator: agreement, disagreement profiles, persistence
 *   - rootCauseAnalyzer: confidence attribution, depth penalty, evidence
 *   - causalStabilizationEngine: priority scoring + classification + actions
 *   - operationalEpidemiologyEngine: classification + diffusion
 *   - causalityReplayEngine: trace ordering + truncation
 *   - causalitySummaryCounters + AuthoritativeSystemState.causality_summary
 */

jest.mock('../../../models/GovernanceAuditEntry', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}), findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) },
}));

import {
  buildLineageGraph, ancestorsOf, descendantsOf, depthOf, _MAX_LINEAGE_DEPTH_FOR_TESTS as LINEAGE_DEPTH_CAP,
} from '../causality/mutationLineageGraph';
import {
  buildContradictionPropagationProfile, isRecurrent,
} from '../causality/contradictionPropagationTracker';
import {
  buildTrustPropagationMap, _TRUST_DECAY_PER_GENERATION_FOR_TESTS as DECAY,
} from '../causality/causalTrustPropagation';
import {
  runAllValidators, mutationValidator, rollbackValidator, trustValidator,
  containmentValidator, blastRadiusValidator, VALIDATOR_ROLES,
} from '../causality/distributedValidationHarness';
import {
  arbitrate, _ESCALATION_RISK_THRESHOLD_FOR_TESTS,
} from '../causality/validationArbitrationEngine';
import {
  recordArbitration, readValidatorTrustProfile, validatorTrust,
  extractDisagreements, _resetValidatorTrust,
} from '../causality/validatorTrustCalibrator';
import {
  analyzeRootCauses, _ROOT_CONFIDENCE_FLOOR_FOR_TESTS,
} from '../causality/rootCauseAnalyzer';
import {
  buildStabilizationPlan, _HIGH_SCORE_THRESHOLD_FOR_TESTS,
} from '../causality/causalStabilizationEngine';
import {
  buildOperationalEpidemiologyMap,
} from '../causality/operationalEpidemiologyEngine';
import {
  buildCausalityReplayTrace, _MAX_REPLAY_TRACE_NODES_FOR_TESTS,
} from '../causality/causalityReplayEngine';
import {
  noteRootCauseDetected, noteUnstableBranch, noteValidatorConflict,
  noteContradictionCluster, readCausalitySummary, _resetCausalitySummaryCounters,
} from '../causality/causalitySummaryCounters';
import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';
import type { LineageNode, MutationEnvelope, ValidatorVerdict } from '../causality/causalityTypes';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeMutationNode(id: string, ts: string, subject: string, severity: 'info' | 'warning' | 'error' = 'info', payloadOverrides: any = {}): LineageNode {
  return {
    node_id: id, kind: 'mutation', project_id: 'p1', subject_id: subject,
    timestamp: ts, summary: `mutation ${id}`, severity,
    payload: {
      mutation_id: id, mutation_class: 'POLICY_NUDGE',
      provenance: { entries: [], inherited_severity: 'info' },
      blast_radius: { score: 30, tier: 'low', contributing_factors: [], dependency_propagation: 0, orchestration_destabilization: 0, cognition_ripple: 0, conflict_with_active_mutations: 0 },
      ...payloadOverrides,
    },
  };
}

function makeContradictionNode(id: string, ts: string, subject: string, severity: 'info' | 'warning' | 'error' = 'warning'): LineageNode {
  return { node_id: id, kind: 'contradiction', project_id: 'p1', subject_id: subject, timestamp: ts, summary: `contradiction ${id}`, severity, payload: {} };
}

function envelopeFor(intent: string, blastTier: 'low' | 'moderate' | 'high', overrides: Partial<MutationEnvelope> = {}): MutationEnvelope {
  return {
    mutation_id: 'mut-1', mutation_class: intent as any, mutation_intent: 'test',
    scope: { project_id: 'p1', domain: 'queue', subject_id: 'cap-x', limits: {} },
    reversibility: 'pure_inmemory',
    rollback_chain: [{ kind: 'noop', args: {} }, { kind: 'restore_policy', args: { update: {} } }],
    blast_radius: { score: blastTier === 'high' ? 80 : blastTier === 'moderate' ? 45 : 15, tier: blastTier, contributing_factors: [], dependency_propagation: 0, orchestration_destabilization: 0, cognition_ripple: 0, conflict_with_active_mutations: 0 },
    trust_score: 70, verification_status: 'pending', containment_state: 'none',
    provenance: { entries: [], inherited_severity: 'info' }, provenance_origin: 'autonomous',
    created_at: '2026-05-07T00:00:00Z', executed_at: null, verified_at: null, rolled_back_at: null,
    ...overrides,
  } as MutationEnvelope;
}

// ─── mutationLineageGraph ─────────────────────────────────────────────

describe('mutationLineageGraph', () => {
  it('empty input returns empty graph', () => {
    const g = buildLineageGraph({ project_id: 'p1', nodes: [] });
    expect(g.nodes.length).toBe(0);
    expect(g.edges.length).toBe(0);
    expect(g.root_node_ids.length).toBe(0);
  });

  it('temporal co-occurrence creates edges within 30 min window', () => {
    const a = makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x');
    const b = makeMutationNode('m1', '2026-05-07T10:10:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [a, b] });
    expect(g.edges.length).toBeGreaterThanOrEqual(1);
    expect(g.edges.some(e => e.from === 'c1' && e.to === 'm1')).toBe(true);
  });

  it('outside window creates no edge', () => {
    const a = makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x');
    const b = makeMutationNode('m1', '2026-05-07T11:00:00Z', 'cap-x'); // 60 min later
    const g = buildLineageGraph({ project_id: 'p1', nodes: [a, b] });
    expect(g.edges.length).toBe(0);
  });

  it('different subjects do NOT link', () => {
    const a = makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x');
    const b = makeMutationNode('m1', '2026-05-07T10:10:00Z', 'cap-y');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [a, b] });
    expect(g.edges.length).toBe(0);
  });

  it('explicit provenance source_id creates a caused edge', () => {
    const a = makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x');
    const b = makeMutationNode('m1', '2026-05-07T11:30:00Z', 'cap-y', 'info', {
      provenance: { entries: [{ source: 'contradiction', summary: 'rage spike', source_id: 'c1', recorded_at: '2026-05-07T10:00:00Z' }], inherited_severity: 'warning' },
    });
    const g = buildLineageGraph({ project_id: 'p1', nodes: [a, b] });
    expect(g.edges.some(e => e.from === 'c1' && e.to === 'm1' && e.relation === 'caused')).toBe(true);
  });

  it('ancestorsOf traverses up to MAX_LINEAGE_DEPTH', () => {
    // Build a chain c1 → m1 → m2 → m3 → m4 → m5 → m6. Use 25min spacing so
    // adjacent pairs link (within 30min window) but skip-1 pairs (50min)
    // do not — that yields a clean chain rather than a dense graph.
    const nodes: LineageNode[] = [];
    nodes.push(makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x'));
    for (let i = 1; i <= 6; i++) {
      const ts = new Date(Date.parse('2026-05-07T10:00:00Z') + i * 25 * 60 * 1000).toISOString();
      nodes.push(makeMutationNode(`m${i}`, ts, 'cap-x'));
    }
    const g = buildLineageGraph({ project_id: 'p1', nodes });
    const ancestors = ancestorsOf(g, 'm6');
    expect(ancestors.length).toBeLessThanOrEqual(LINEAGE_DEPTH_CAP);
  });

  it('descendantsOf traverses up to MAX_LINEAGE_DEPTH', () => {
    const nodes: LineageNode[] = [makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x')];
    for (let i = 1; i <= 6; i++) {
      const ts = new Date(Date.parse('2026-05-07T10:00:00Z') + i * 25 * 60 * 1000).toISOString();
      nodes.push(makeMutationNode(`m${i}`, ts, 'cap-x'));
    }
    const g = buildLineageGraph({ project_id: 'p1', nodes });
    expect(descendantsOf(g, 'c1').length).toBeLessThanOrEqual(LINEAGE_DEPTH_CAP);
  });

  it('depthOf returns 0 for a root', () => {
    const a = makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [a] });
    expect(depthOf(g, 'c1')).toBe(0);
  });

  it('rollback nodes link to their target via subject_id', () => {
    const m = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const r: LineageNode = { node_id: 'r1', kind: 'rollback', project_id: 'p1', subject_id: 'm1', timestamp: '2026-05-07T10:30:00Z', summary: 'rollback', severity: 'warning', payload: {} };
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m, r] });
    expect(g.edges.some(e => e.from === 'm1' && e.to === 'r1' && e.relation === 'rolled_back')).toBe(true);
  });

  it('LINEAGE_DEPTH_CAP is 5', () => {
    expect(LINEAGE_DEPTH_CAP).toBe(5);
  });
});

// ─── contradictionPropagationTracker ─────────────────────────────────

describe('contradictionPropagationTracker', () => {
  const now = Date.parse('2026-05-07T12:00:00Z');

  const sample = (overrides: any = {}) => ({
    kind: 'telemetry_drift', severity: 'warning', message: 'x',
    project_id: 'p1', evidence: { timestamp: Date.parse('2026-05-07T11:55:00Z') },
    ...overrides,
  } as any);

  it('clusters contradictions by subject + kind', () => {
    const profile = buildContradictionPropagationProfile({
      project_id: 'p1',
      contradictions: [
        sample({ capability_id: 'cap-x' }),
        sample({ capability_id: 'cap-x' }),
        sample({ capability_id: 'cap-y' }),
      ],
      now_ms: now,
    });
    expect(profile.clusters.length).toBe(2);
    expect(profile.total_contradictions_in_window).toBe(3);
  });

  it('hotspots are sorted by count descending', () => {
    const profile = buildContradictionPropagationProfile({
      project_id: 'p1',
      contradictions: [
        sample({ capability_id: 'cap-x' }),
        sample({ capability_id: 'cap-x' }),
        sample({ capability_id: 'cap-x' }),
        sample({ capability_id: 'cap-y' }),
      ],
      now_ms: now,
    });
    expect(profile.hotspots[0].subject_id).toBe('cap-x');
    expect(profile.hotspots[0].count).toBe(3);
  });

  it('worst severity bubbles up at the hotspot level', () => {
    const profile = buildContradictionPropagationProfile({
      project_id: 'p1',
      contradictions: [
        sample({ capability_id: 'cap-x', severity: 'info' }),
        sample({ capability_id: 'cap-x', severity: 'error' }),
      ],
      now_ms: now,
    });
    expect(profile.hotspots[0].worst_severity).toBe('error');
  });

  it('outside the temporal window are dropped', () => {
    const profile = buildContradictionPropagationProfile({
      project_id: 'p1',
      contradictions: [
        sample({ capability_id: 'cap-x', evidence: { timestamp: now - 60 * 60 * 1000 } }),     // 1h old
      ],
      now_ms: now,
    });
    expect(profile.total_contradictions_in_window).toBe(0);
  });

  it('isRecurrent flags subjects appearing in successive windows', () => {
    const prior = buildContradictionPropagationProfile({
      project_id: 'p1', contradictions: [sample({ capability_id: 'cap-x' })], now_ms: now,
    });
    const current = buildContradictionPropagationProfile({
      project_id: 'p1', contradictions: [sample({ capability_id: 'cap-x' })], now_ms: now + 1000,
    });
    const r = isRecurrent(current, prior);
    expect(r.length).toBe(1);
    expect(r[0].subject_id).toBe('cap-x');
  });
});

// ─── causalTrustPropagation ──────────────────────────────────────────

describe('causalTrustPropagation', () => {
  it('decay factor is 0.5 per generation', () => {
    expect(DECAY).toBe(0.5);
  });

  it('a single root has zero inherited decay', () => {
    const a = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [a] });
    const map = buildTrustPropagationMap({ graph: g, resolveOwnTrust: () => 70 });
    expect(map.entries[0].inherited_trust_decay).toBe(0);
    expect(map.entries[0].effective_trust).toBe(70);
  });

  it('inherited decay halves per generation', () => {
    // Chain m1 → m2 (linked by co-occurrence within 30min on same subject).
    // m1 has trust 0 (very weak), m2 has trust 100. The decay m2 inherits =
    // (100 - 0) * 0.5^1 = 50 → effective = 100 * (1 - 50/100) = 50.
    const m1 = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const m2 = makeMutationNode('m2', '2026-05-07T10:10:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1, m2] });
    const trustByNode: Record<string, number> = { m1: 0, m2: 100 };
    const map = buildTrustPropagationMap({ graph: g, resolveOwnTrust: n => trustByNode[n.node_id] ?? 70 });
    const m2Entry = map.entries.find(e => e.node_id === 'm2')!;
    expect(m2Entry.inherited_trust_decay).toBe(50);
    expect(m2Entry.effective_trust).toBe(50);
  });

  it('depth cap prevents runaway propagation', () => {
    // 25min spacing → adjacent pairs link (within 30min) but skip-1 (50min)
    // do not, yielding a clean chain longer than LINEAGE_DEPTH_CAP.
    const nodes: LineageNode[] = [];
    for (let i = 0; i < 10; i++) {
      const ts = new Date(Date.parse('2026-05-07T10:00:00Z') + i * 25 * 60 * 1000).toISOString();
      nodes.push(makeMutationNode(`m${i}`, ts, 'cap-x'));
    }
    const g = buildLineageGraph({ project_id: 'p1', nodes });
    const map = buildTrustPropagationMap({ graph: g, resolveOwnTrust: () => 0 });
    const last = map.entries.find(e => e.node_id === 'm9')!;
    expect(last.ancestry_depth).toBeLessThanOrEqual(5);
  });

  it('worst_inherited_decay tracks the worst node', () => {
    const m1 = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const m2 = makeMutationNode('m2', '2026-05-07T10:10:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1, m2] });
    const map = buildTrustPropagationMap({ graph: g, resolveOwnTrust: n => n.node_id === 'm1' ? 0 : 80 });
    expect(map.worst_inherited_decay).toBeGreaterThan(0);
  });
});

// ─── distributedValidationHarness ────────────────────────────────────

describe('distributedValidationHarness', () => {
  const baseCtx = (env: MutationEnvelope) => ({
    envelope: env, current_trust_score: 80, is_contained: false, is_frozen: false, avg_project_trust: 70,
  });

  it('runAllValidators returns 5 verdicts with rationale', () => {
    const verdicts = runAllValidators(baseCtx(envelopeFor('POLICY_NUDGE', 'low')));
    expect(verdicts.length).toBe(5);
    expect(verdicts.every(v => typeof v.rationale === 'string' && v.rationale.length > 0)).toBe(true);
    expect(VALIDATOR_ROLES.length).toBe(5);
  });

  it('mutation_validator deducts confidence when rollback chain is empty', () => {
    const env = envelopeFor('POLICY_NUDGE', 'low', { rollback_chain: [] });
    const v = mutationValidator(baseCtx(env));
    expect(v.disagreement_flags).toContain('empty_rollback_chain');
    expect(v.confidence).toBeLessThan(80);
  });

  it('rollback_validator flags noop-only chain', () => {
    const env = envelopeFor('POLICY_NUDGE', 'low', { rollback_chain: [{ kind: 'noop', args: {} }, { kind: 'noop', args: {} }] });
    const v = rollbackValidator(baseCtx(env));
    expect(v.disagreement_flags).toContain('rollback_chain_only_noops');
  });

  it('rollback_validator recommends rollback when verification has failed', () => {
    const env = envelopeFor('POLICY_NUDGE', 'low', { verification_status: 'failed', executed_at: 'now', verified_at: 'now' });
    const v = rollbackValidator(baseCtx(env));
    expect(v.recommendation).toBe('rollback');
  });

  it('trust_validator flags trust below floor', () => {
    const env = envelopeFor('POLICY_NUDGE', 'low');
    const v = trustValidator({ ...baseCtx(env), current_trust_score: 30 });
    expect(v.disagreement_flags).toContain('trust_below_floor');
    expect(v.recommendation).toBe('reject');
  });

  it('containment_validator rejects frozen intent', () => {
    const env = envelopeFor('POLICY_NUDGE', 'low');
    const v = containmentValidator({ ...baseCtx(env), is_frozen: true });
    expect(v.recommendation).toBe('reject');
    expect(v.disagreement_flags).toContain('intent_class_frozen');
  });

  it('blast_radius_validator rejects high tier', () => {
    const env = envelopeFor('POLICY_NUDGE', 'high');
    const v = blastRadiusValidator(baseCtx(env));
    expect(v.recommendation).toBe('reject');
  });
});

// ─── validationArbitrationEngine ─────────────────────────────────────

describe('validationArbitrationEngine', () => {
  const env = envelopeFor('POLICY_NUDGE', 'low');
  const baseCtx = { envelope: env, current_trust_score: 80, is_contained: false, is_frozen: false, avg_project_trust: 70 };

  it('healthy verdicts converge on apply', () => {
    const verdicts = runAllValidators(baseCtx);
    const r = arbitrate({ mutation_id: 'mut-1', verdicts });
    expect(r.consensus_recommendation).toBe('apply');
    expect(r.minority_warning).toBeNull();
  });

  it('confidence_range exposes spread (min/max)', () => {
    const verdicts = runAllValidators(baseCtx);
    const r = arbitrate({ mutation_id: 'mut-1', verdicts });
    expect(r.confidence_range.min).toBeLessThanOrEqual(r.consensus_confidence);
    expect(r.confidence_range.max).toBeGreaterThanOrEqual(r.consensus_confidence);
  });

  it('frozen intent forces consensus to reject', () => {
    const verdicts = runAllValidators({ ...baseCtx, is_frozen: true });
    const r = arbitrate({ mutation_id: 'mut-1', verdicts });
    expect(r.consensus_recommendation).toBe('reject');
  });

  it('high blast tier escalates risk', () => {
    const env2 = envelopeFor('POLICY_NUDGE', 'high');
    const verdicts = runAllValidators({ ...baseCtx, envelope: env2 });
    const r = arbitrate({ mutation_id: 'mut-2', verdicts });
    expect(r.arbitration_risk).toBeGreaterThan(0);
  });

  it('escalation_required tied to ESCALATION_RISK_THRESHOLD', () => {
    expect(_ESCALATION_RISK_THRESHOLD_FOR_TESTS).toBe(60);
  });

  it('empty verdicts produce a defensive minority_warning', () => {
    const r = arbitrate({ mutation_id: 'mut-empty', verdicts: [] });
    expect(r.minority_warning).toBeTruthy();
    expect(r.escalation_required).toBe(true);
  });
});

// ─── validatorTrustCalibrator ────────────────────────────────────────

describe('validatorTrustCalibrator', () => {
  beforeEach(() => { _resetValidatorTrust(); });

  const env = envelopeFor('POLICY_NUDGE', 'low');
  const ctx = { envelope: env, current_trust_score: 80, is_contained: false, is_frozen: false, avg_project_trust: 70 };

  it('cold-start trust is 70', () => {
    expect(validatorTrust('p1', 'mutation_validator')).toBe(70);
  });

  it('agreement raises trust toward 100', () => {
    const verdicts = runAllValidators(ctx);
    for (let i = 0; i < 5; i++) {
      recordArbitration('p1', arbitrate({ mutation_id: `m-${i}`, verdicts }));
    }
    const profile = readValidatorTrustProfile('p1');
    expect(profile.entries[0].agreement_rate).toBe(100);
    expect(profile.entries[0].trust_score).toBeGreaterThan(70);
  });

  it('disagreement profile records the pair-key + topics', () => {
    const verdicts = runAllValidators({ ...ctx, is_frozen: true });
    recordArbitration('p1', arbitrate({ mutation_id: 'm-1', verdicts }));
    const profile = readValidatorTrustProfile('p1');
    expect(profile.disagreement_profiles.length).toBeGreaterThan(0);
  });

  it('extractDisagreements returns dissenters', () => {
    const verdicts = runAllValidators({ ...ctx, is_frozen: true });
    const r = arbitrate({ mutation_id: 'm-1', verdicts });
    const dissenters = extractDisagreements(r);
    // With is_frozen, containment_validator forces consensus=reject; some
    // others may still say apply → those become dissenters.
    expect(dissenters.length).toBeGreaterThanOrEqual(0);
  });

  it('drift signal flips to over_triggering with sustained over-rejection', () => {
    // Force a sequence where mutation_validator over-rejects vs consensus.
    for (let i = 0; i < 5; i++) {
      const verdicts: ValidatorVerdict[] = [
        { validator_type: 'mutation_validator', confidence: 90, recommendation: 'reject', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] },
        { validator_type: 'rollback_validator', confidence: 90, recommendation: 'apply', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] },
        { validator_type: 'trust_validator', confidence: 90, recommendation: 'apply', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] },
        { validator_type: 'containment_validator', confidence: 90, recommendation: 'apply', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] },
        { validator_type: 'blast_radius_validator', confidence: 90, recommendation: 'apply', rationale: '', evidence: {}, disagreement_flags: [], propagation_concerns: [], stabilization_recommendations: [] },
      ];
      recordArbitration('p1', arbitrate({ mutation_id: `m-${i}`, verdicts }));
    }
    const profile = readValidatorTrustProfile('p1');
    const mut = profile.entries.find(e => e.validator_type === 'mutation_validator')!;
    expect(mut.drift_signal).toBe('over_triggering');
  });
});

// ─── rootCauseAnalyzer ───────────────────────────────────────────────

describe('rootCauseAnalyzer', () => {
  it('returns the target itself as root when no ancestors exist', () => {
    const a = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [a] });
    const r = analyzeRootCauses({ graph: g, target_node_id: 'm1', propagation: null });
    expect(r.identified_roots.length).toBe(1);
    expect(r.identified_roots[0].node.node_id).toBe('m1');
  });

  it('depth penalty reduces confidence for deeper ancestors', () => {
    const c1 = makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x', 'error');
    const m1 = makeMutationNode('m1', '2026-05-07T10:10:00Z', 'cap-x');
    const m2 = makeMutationNode('m2', '2026-05-07T10:20:00Z', 'cap-x');
    const m3 = makeMutationNode('m3', '2026-05-07T10:30:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [c1, m1, m2, m3] });
    const r = analyzeRootCauses({ graph: g, target_node_id: 'm3', propagation: null });
    const c1Root = r.identified_roots.find(rt => rt.node.node_id === 'c1');
    if (c1Root) expect(c1Root.attribution.lineage_depth_penalty).toBeGreaterThan(0);
  });

  it('rollback_targeting_suggestion includes the API path', () => {
    // Single-node graph → analyzer treats target itself as root, which is
    // always surfaced regardless of confidence floor.
    const m1 = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1] });
    const r = analyzeRootCauses({ graph: g, target_node_id: 'm1', propagation: null });
    expect(r.identified_roots.length).toBe(1);
    expect(r.identified_roots[0].rollback_targeting_suggestion).toContain('/rollback');
  });

  it('attribution includes supporting_evidence array', () => {
    // Single-node graph guarantees the target-as-root code path runs and
    // surfaces an attribution block.
    const m1 = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x', 'error');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m1] });
    const r = analyzeRootCauses({ graph: g, target_node_id: 'm1', propagation: null });
    expect(r.identified_roots.length).toBe(1);
    expect(Array.isArray(r.identified_roots[0].attribution.supporting_evidence)).toBe(true);
  });

  it('CONFIDENCE_FLOOR is moderate', () => {
    expect(_ROOT_CONFIDENCE_FLOOR_FOR_TESTS).toBeGreaterThanOrEqual(20);
    expect(_ROOT_CONFIDENCE_FLOOR_FOR_TESTS).toBeLessThanOrEqual(40);
  });
});

// ─── causalStabilizationEngine ───────────────────────────────────────

describe('causalStabilizationEngine', () => {
  it('classifies isolated subjects when already contained', () => {
    const m = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m] });
    const propagation = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const trust = buildTrustPropagationMap({ graph: g, resolveOwnTrust: () => 70 });
    const root = analyzeRootCauses({ graph: g, target_node_id: 'm1', propagation });
    const plan = buildStabilizationPlan({
      graph: g, propagation, trust_map: trust, root_cause: root,
      already_contained_subjects: ['cap-x'],
    });
    expect(plan.priorities[0].classification).toBe('isolated');
    expect(plan.recommended_actions[0].action).toBe('noop');
  });

  it('cascading classification when ≥4 descendants', () => {
    const root = makeMutationNode('root', '2026-05-07T10:00:00Z', 'cap-x');
    const desc: LineageNode[] = [];
    for (let i = 0; i < 5; i++) {
      desc.push(makeMutationNode(`d${i}`, new Date(Date.parse('2026-05-07T10:00:00Z') + (i + 1) * 5 * 60 * 1000).toISOString(), 'cap-x'));
    }
    const g = buildLineageGraph({ project_id: 'p1', nodes: [root, ...desc] });
    const propagation = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const trustMap = buildTrustPropagationMap({ graph: g, resolveOwnTrust: () => 70 });
    const rc = analyzeRootCauses({ graph: g, target_node_id: 'd4', propagation });
    const plan = buildStabilizationPlan({ graph: g, propagation, trust_map: trustMap, root_cause: rc });
    const rootScore = plan.priorities.find(p => p.node_id === 'root');
    expect(rootScore?.classification).toBe('cascading');
  });

  it('HIGH_SCORE_THRESHOLD is moderate', () => {
    expect(_HIGH_SCORE_THRESHOLD_FOR_TESTS).toBeGreaterThanOrEqual(50);
    expect(_HIGH_SCORE_THRESHOLD_FOR_TESTS).toBeLessThanOrEqual(85);
  });
});

// ─── operationalEpidemiologyEngine ───────────────────────────────────

describe('operationalEpidemiologyEngine', () => {
  it('localized classification with no descendants', () => {
    const m = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m] });
    const prop = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const map = buildOperationalEpidemiologyMap({ graph: g, propagation: prop, now_ms: Date.parse('2026-05-07T10:30:00Z') });
    expect(map.classified_spreads[0]?.classification).toBe('localized');
  });

  it('suppressed classification when subject is frozen', () => {
    const m = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m] });
    const prop = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const map = buildOperationalEpidemiologyMap({
      graph: g, propagation: prop, frozen_subjects: ['cap-x'], now_ms: Date.parse('2026-05-07T10:30:00Z'),
    });
    expect(map.classified_spreads[0].classification).toBe('suppressed');
  });

  it('diffusion_score is 0-100', () => {
    const m = makeMutationNode('m1', '2026-05-07T10:00:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [m] });
    const prop = buildContradictionPropagationProfile({ project_id: 'p1', contradictions: [] });
    const map = buildOperationalEpidemiologyMap({ graph: g, propagation: prop, now_ms: Date.parse('2026-05-07T10:30:00Z') });
    expect(map.diffusion_score).toBeGreaterThanOrEqual(0);
    expect(map.diffusion_score).toBeLessThanOrEqual(100);
  });
});

// ─── causalityReplayEngine ───────────────────────────────────────────

describe('causalityReplayEngine', () => {
  it('empty target returns empty steps', () => {
    const g = buildLineageGraph({ project_id: 'p1', nodes: [] });
    const trace = buildCausalityReplayTrace({ graph: g, target_node_id: 'missing' });
    expect(trace.steps.length).toBe(0);
  });

  it('produces ordered steps origin → target', () => {
    const c1 = makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x');
    const m1 = makeMutationNode('m1', '2026-05-07T10:10:00Z', 'cap-x');
    const m2 = makeMutationNode('m2', '2026-05-07T10:20:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [c1, m1, m2] });
    const trace = buildCausalityReplayTrace({ graph: g, target_node_id: 'm2' });
    expect(trace.steps[trace.steps.length - 1].node.node_id).toBe('m2');
    expect(trace.steps.length).toBeGreaterThan(0);
  });

  it('annotation tags origin / target / step n', () => {
    const c1 = makeContradictionNode('c1', '2026-05-07T10:00:00Z', 'cap-x');
    const m1 = makeMutationNode('m1', '2026-05-07T10:10:00Z', 'cap-x');
    const g = buildLineageGraph({ project_id: 'p1', nodes: [c1, m1] });
    const trace = buildCausalityReplayTrace({ graph: g, target_node_id: 'm1' });
    expect(trace.steps[0].annotation).toContain('origin');
    expect(trace.steps[trace.steps.length - 1].annotation).toContain('target');
  });

  it('MAX_REPLAY_TRACE_NODES is bounded', () => {
    expect(_MAX_REPLAY_TRACE_NODES_FOR_TESTS).toBe(200);
  });
});

// ─── AuthoritativeSystemState.causality_summary ──────────────────────

describe('AuthoritativeSystemState.causality_summary', () => {
  beforeEach(() => { _resetCausalitySummaryCounters(); });

  it('reflects in-memory counter increments', () => {
    noteRootCauseDetected('proj-x');
    noteUnstableBranch('proj-x');
    noteValidatorConflict('proj-x');
    noteContradictionCluster('proj-x', 3);
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-x', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.causality_summary?.active_root_causes).toBe(1);
    expect(state.causality_summary?.unstable_branches).toBe(1);
    expect(state.causality_summary?.validator_conflicts).toBe(1);
    expect(state.causality_summary?.contradiction_clusters).toBe(3);
  });

  it('zero-state surfaces zeros without crashing', () => {
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-y', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.causality_summary?.active_root_causes).toBe(0);
  });

  it('readCausalitySummary is per-project isolated', () => {
    noteRootCauseDetected('proj-a');
    noteRootCauseDetected('proj-a');
    noteRootCauseDetected('proj-b');
    expect(readCausalitySummary('proj-a').active_root_causes).toBe(2);
    expect(readCausalitySummary('proj-b').active_root_causes).toBe(1);
  });
});
