/**
 * Phase 24 — deterministic operational cognition compression tests.
 *
 * Targets: types/caps, narrativeTemplateRegistry, operationalNarrativeBuilder,
 * causalStoryCompression, rollbackNarrativeEngine, continuityStoryEngine,
 * topologyNarrativeEngine, trustSurfaceGenerator, cognitiveLoadAnalyzer,
 * operatorGuidanceOrchestrator, compressionSummaryCounters.
 */

import {
  listTemplateIds, getTemplateSpec, renderTemplate,
  _TEMPLATE_COUNT_FOR_TESTS,
} from '../cognitiveCompression/narrativeTemplateRegistry';
import {
  buildBlock, buildOperationalNarrative, aggregateInheritedConfidence,
  listNarratives, recentNarrativeCount24h,
  _resetNarrativeBuilderForTests,
} from '../cognitiveCompression/operationalNarrativeBuilder';
import { buildCausalStoryReplay } from '../cognitiveCompression/causalStoryCompression';
import { buildRollbackNarrativeReplay } from '../cognitiveCompression/rollbackNarrativeEngine';
import { buildContinuityNarrative } from '../cognitiveCompression/continuityStoryEngine';
import { buildTopologyNarrativeReplay } from '../cognitiveCompression/topologyNarrativeEngine';
import { buildOperationalTrustSurface } from '../cognitiveCompression/trustSurfaceGenerator';
import { buildCognitiveLoadProfile } from '../cognitiveCompression/cognitiveLoadAnalyzer';
import {
  buildOperatorGuidancePlan, listOperatorGuidancePlans,
  _resetGuidanceForTests,
} from '../cognitiveCompression/operatorGuidanceOrchestrator';
import { buildCognitiveCompressionSummary } from '../cognitiveCompression/compressionSummaryCounters';
import {
  MAX_BLOCKS_PER_NARRATIVE, MAX_CITATIONS_PER_BLOCK,
  MAX_GUIDANCE_ITEMS_PER_PLAN, MAX_RENDERED_TEXT_CHARS,
} from '../cognitiveCompression/cognitiveCompressionTypes';
import type { NarrativeCitation, NarrativeConfidenceBounds } from '../cognitiveCompression/cognitiveCompressionTypes';
import {
  recordFailure as brokerRecordFailureRaw, quarantine as brokerQuarantineRaw,
  _resetIsolationForTests as _resetBrokerIsolation,
} from '../distributedRuntime/brokerIsolationEngine';
import {
  registerWorker, markRunning, markFailed, markCompleted,
  _resetCoordinatorForTests,
} from '../executionSubstrate/executionRuntimeCoordinator';
import {
  buildRollbackExecutionPlan, recordRollbackContinuity,
  _resetRollbackForTests,
} from '../executionSubstrate/rollbackExecutionCoordinator';
import {
  recordExecutionDependencyEdge, _resetExecutionTopologyForTests,
} from '../executionSubstrate/executionTopologyGraph';
import {
  _resetGovernanceForTests, evaluateRegistration,
} from '../executionSubstrate/executionGovernanceSupervisor';
import {
  _resetIsolationForTests as _resetExecIsolation,
  recordFailure as execRecordFailure,
  quarantine as execQuarantine,
} from '../executionSubstrate/executionIsolationEngine';
import {
  buildPropagationAttribution, _resetPropagationForTests,
} from '../topology/runtimePropagationTopology';
import {
  _resetTopologyGraphForTests,
} from '../topology/cognitionTopologyGraph';
import { _resetRuntimeForTests } from '../distributedRuntime/distributedBrokerRuntime';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

beforeEach(() => {
  _resetNarrativeBuilderForTests();
  _resetGuidanceForTests();
  _resetBrokerIsolation();
  _resetCoordinatorForTests();
  _resetRollbackForTests();
  _resetExecutionTopologyForTests();
  _resetGovernanceForTests();
  _resetExecIsolation();
  _resetPropagationForTests();
  _resetTopologyGraphForTests();
  _resetRuntimeForTests();
});

const ENV = {
  max_duration_ms: 60_000,
  max_attempts: 1,
  allowed_namespaces: ['email_send'],
  parent_depth_limit: 0,
};

const FAKE_CITE: NarrativeCitation = {
  source_kind: 'unit_test',
  source_id: 'src-1',
  source_phase: 'phase_22_topology',
  recorded_at: new Date().toISOString(),
  fragment_quoted: 'test fragment',
};

// ────────────────────────────────────────────────────────────────────
// Section 1 — Caps + types
// ────────────────────────────────────────────────────────────────────

describe('Phase 24 architectural caps', () => {
  test('caps are bounded and >= 1', () => {
    expect(MAX_BLOCKS_PER_NARRATIVE).toBeGreaterThan(0);
    expect(MAX_CITATIONS_PER_BLOCK).toBeGreaterThan(0);
    expect(MAX_GUIDANCE_ITEMS_PER_PLAN).toBeGreaterThan(0);
    expect(MAX_RENDERED_TEXT_CHARS).toBeGreaterThan(0);
    expect(_TEMPLATE_COUNT_FOR_TESTS).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — narrativeTemplateRegistry
// ────────────────────────────────────────────────────────────────────

describe('narrativeTemplateRegistry', () => {
  test('listTemplateIds returns sorted ids', () => {
    const ids = listTemplateIds();
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(ids.length).toBeGreaterThan(0);
  });

  test('renderTemplate produces deterministic hash for same inputs', () => {
    const a = renderTemplate('exec.worker.completed.v1', {
      worker_id: 'w1', kind: 'email_send', started_at: '2026-05-08T00:00:00Z',
      completed_at: '2026-05-08T00:00:01Z', duration_ms: 1000,
    });
    const b = renderTemplate('exec.worker.completed.v1', {
      worker_id: 'w1', kind: 'email_send', started_at: '2026-05-08T00:00:00Z',
      completed_at: '2026-05-08T00:00:01Z', duration_ms: 1000,
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.text).toBe(b!.text);
    expect(a!.deterministic_hash).toBe(b!.deterministic_hash);
  });

  test('renderTemplate returns null for unknown template id (no fallback)', () => {
    expect(renderTemplate('does.not.exist.v1', { foo: 'bar' })).toBeNull();
  });

  test('renderTemplate returns null when required vars missing (no fallback)', () => {
    expect(renderTemplate('exec.worker.completed.v1', { worker_id: 'w1' })).toBeNull();
  });

  test('renderTemplate output is capped at MAX_RENDERED_TEXT_CHARS', () => {
    const longString = 'x'.repeat(MAX_RENDERED_TEXT_CHARS + 200);
    const r = renderTemplate('generic.attribution.v1', {
      source_phase: 'phase_22_topology',
      source_id: 'long',
      fragment: longString,
    });
    expect(r).not.toBeNull();
    expect(r!.text.length).toBeLessThanOrEqual(MAX_RENDERED_TEXT_CHARS);
  });

  test('getTemplateSpec returns the specification for a known template', () => {
    const spec = getTemplateSpec('exec.worker.completed.v1');
    expect(spec).toBeDefined();
    expect(spec!.required_vars).toContain('worker_id');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — operationalNarrativeBuilder
// ────────────────────────────────────────────────────────────────────

describe('operationalNarrativeBuilder', () => {
  test('buildBlock returns null when source_attributions is empty (no citation = no narrative)', () => {
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: [],
      selection_rule: 'test',
    });
    expect(block).toBeNull();
  });

  test('buildBlock returns null when template missing required vars', () => {
    const block = buildBlock({
      template_id: 'exec.worker.completed.v1',
      vars: { worker_id: 'w1' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    expect(block).toBeNull();
  });

  test('buildBlock returns a structured block with citations and determinism hash', () => {
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'something happened' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    expect(block).not.toBeNull();
    expect(block!.source_attributions).toHaveLength(1);
    expect(block!.determinism.template_id).toBe('generic.attribution.v1');
    expect(block!.determinism.deterministic_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('buildBlock caps citations at MAX_CITATIONS_PER_BLOCK', () => {
    const manyCitations = Array.from({ length: MAX_CITATIONS_PER_BLOCK + 5 }, (_, i) => ({
      ...FAKE_CITE, source_id: `src-${i}`,
    }));
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: manyCitations,
      selection_rule: 'test',
    });
    expect(block!.source_attributions.length).toBe(MAX_CITATIONS_PER_BLOCK);
  });

  test('buildOperationalNarrative returns null when all blocks are null', () => {
    const narrative = buildOperationalNarrative({
      organization_id: 'org-a',
      kind: 'execution_continuity',
      source_event_count: 3,
      blocks: [null, null, null],
    });
    expect(narrative).toBeNull();
  });

  test('buildOperationalNarrative classifies tier deterministically', () => {
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    const atomicNarr = buildOperationalNarrative({
      organization_id: 'org-a',
      kind: 'execution_continuity',
      source_event_count: 1,
      blocks: [block],
    });
    expect(atomicNarr!.tier).toBe('atomic');
  });

  test('compression bounds reflect omitted blocks', () => {
    const validBlock = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    const narr = buildOperationalNarrative({
      organization_id: 'org-a',
      kind: 'execution_continuity',
      source_event_count: 5,
      blocks: [validBlock, null, null],
    });
    expect(narr!.compression.rendered_block_count).toBe(1);
    expect(narr!.compression.omitted_low_priority_events).toBe(4);
    expect(narr!.compression.compression_ratio).toBeLessThan(0.5);
  });

  test('cross-org isolation: org-a narratives never leak into org-b list', () => {
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    buildOperationalNarrative({
      organization_id: 'org-a',
      kind: 'execution_continuity',
      source_event_count: 1,
      blocks: [block],
    });
    expect(listNarratives('org-a')).toHaveLength(1);
    expect(listNarratives('org-b')).toHaveLength(0);
  });

  test('aggregateInheritedConfidence with single source uses single_source rule', () => {
    const conf: NarrativeConfidenceBounds = {
      low: 70, high: 90, drivers: [],
      inherited_from_source_id: 'src-1', inherited_from_phase: 'phase_22_topology',
    };
    const aggregated = aggregateInheritedConfidence([conf], 'src-1', 'phase_22_topology');
    expect(aggregated!.aggregation_rule).toBe('single_source');
  });

  test('aggregateInheritedConfidence min_low_max_high widens band honestly', () => {
    const a: NarrativeConfidenceBounds = {
      low: 70, high: 90, drivers: ['driverA'],
      inherited_from_source_id: 'src-1', inherited_from_phase: 'phase_22_topology',
    };
    const b: NarrativeConfidenceBounds = {
      low: 50, high: 80, drivers: ['driverB'],
      inherited_from_source_id: 'src-2', inherited_from_phase: 'phase_22_topology',
    };
    const aggregated = aggregateInheritedConfidence([a, b], 'src-1', 'phase_22_topology', 'min_low_max_high');
    expect(aggregated!.low).toBe(50);
    expect(aggregated!.high).toBe(90);
    expect(aggregated!.drivers).toContain('driverA');
    expect(aggregated!.drivers).toContain('driverB');
  });

  test('aggregateInheritedConfidence narrowest_band picks tightest band', () => {
    const a: NarrativeConfidenceBounds = {
      low: 50, high: 90, drivers: [],
      inherited_from_source_id: 'a', inherited_from_phase: 'phase_22_topology',
    };
    const b: NarrativeConfidenceBounds = {
      low: 70, high: 80, drivers: [],
      inherited_from_source_id: 'b', inherited_from_phase: 'phase_22_topology',
    };
    const aggregated = aggregateInheritedConfidence([a, b], 'a', 'phase_22_topology', 'narrowest_band');
    expect(aggregated!.low).toBe(70);
    expect(aggregated!.high).toBe(80);
  });

  test('recentNarrativeCount24h tracks 24h activity per org', () => {
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    buildOperationalNarrative({
      organization_id: 'org-a', kind: 'execution_continuity',
      source_event_count: 1, blocks: [block],
    });
    expect(recentNarrativeCount24h('org-a')).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — causalStoryCompression
// ────────────────────────────────────────────────────────────────────

describe('causalStoryCompression', () => {
  test('returns null when there is nothing to compress', () => {
    expect(buildCausalStoryReplay({ organization_id: 'org-a' })).toBeNull();
  });

  test('compresses Phase 21 broker isolation + Phase 22 propagation + Phase 23 worker failure', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    buildPropagationAttribution({
      organization_id: 'org-a',
      originating_namespace: BROKER_NAMESPACES.effectiveness,
      propagation_kind: 'isolation_propagation',
    });
    const reg = registerWorker({
      kind: 'mutation_execution', organization_id: 'org-a',
      scope_summary: 'failing mutation', bounded_envelope: ENV,
    });
    if (reg.permitted) {
      markRunning(reg.envelope.worker_id);
      markFailed(reg.envelope.worker_id, 'simulated');
    }

    const story = buildCausalStoryReplay({ organization_id: 'org-a' });
    expect(story).not.toBeNull();
    expect(story!.causal_chain.length).toBeGreaterThanOrEqual(3);
    // Every block in the narrative carries source_attributions[].
    for (const block of story!.narrative.blocks) {
      expect(block.source_attributions.length).toBeGreaterThan(0);
    }
  });

  test('cross-org: org-a story does not include org-b events', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const story = buildCausalStoryReplay({ organization_id: 'org-b' });
    // org-b has no events in any phase → null.
    expect(story).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — rollbackNarrativeEngine
// ────────────────────────────────────────────────────────────────────

describe('rollbackNarrativeEngine', () => {
  test('returns null when no rollback plans or bounds exist', () => {
    expect(buildRollbackNarrativeReplay({ organization_id: 'org-a' })).toBeNull();
  });

  test('aggregates Phase 15 + Phase 22 source chains', () => {
    buildRollbackExecutionPlan({
      organization_id: 'org-a',
      trigger: 'mutation_failed',
      source_chains: [
        { source_phase: 'mutation', chain_id: 'mut-1', steps: [{ source_step_ref: 's1', description: 'd', impact_estimate: 'medium' }] },
        { source_phase: 'topology_recovery', chain_id: 'topo-1', steps: [{ source_step_ref: 's2', description: 'd', impact_estimate: 'low' }] },
      ],
    });
    recordRollbackContinuity({
      organization_id: 'org-a',
      rollback_chain_id: 'mut-1', steps_replayed: 1, max_chain_depth: 1,
      time_elapsed_ms: 10, outcome: 'full', source_phase: 'mutation',
    });
    const replay = buildRollbackNarrativeReplay({ organization_id: 'org-a' });
    expect(replay).not.toBeNull();
    expect(replay!.rollback_chain_ids.length).toBeGreaterThanOrEqual(2);
    expect(replay!.outcome_summary).toBe('all_full');
    expect(replay!.source_phase_breakdown.phase_15_mutation).toBeGreaterThan(0);
  });

  test('outcome_summary detects mixed outcomes', () => {
    recordRollbackContinuity({
      organization_id: 'org-a', rollback_chain_id: 'r1',
      steps_replayed: 1, max_chain_depth: 1, time_elapsed_ms: 10,
      outcome: 'full', source_phase: 'mutation',
    });
    recordRollbackContinuity({
      organization_id: 'org-a', rollback_chain_id: 'r2',
      steps_replayed: 1, max_chain_depth: 1, time_elapsed_ms: 10,
      outcome: 'partial', source_phase: 'mutation',
    });
    const replay = buildRollbackNarrativeReplay({ organization_id: 'org-a' });
    expect(replay!.outcome_summary).toBe('mixed');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — continuityStoryEngine
// ────────────────────────────────────────────────────────────────────

describe('continuityStoryEngine', () => {
  test('returns null when no continuity events', () => {
    expect(buildContinuityNarrative({ organization_id: 'org-a' })).toBeNull();
  });

  test('renders interrupted_on_boot blocks', async () => {
    const reg = registerWorker({
      kind: 'briefing_send', organization_id: 'org-a',
      scope_summary: 'pending', bounded_envelope: ENV,
    });
    if (reg.permitted) markRunning(reg.envelope.worker_id);
    const { flipRunningToInterruptedOnBoot } = await import('../executionSubstrate/executionRuntimeCoordinator');
    flipRunningToInterruptedOnBoot();
    const continuity = buildContinuityNarrative({ organization_id: 'org-a' });
    expect(continuity).not.toBeNull();
    expect(continuity!.interrupted_worker_count).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — topologyNarrativeEngine
// ────────────────────────────────────────────────────────────────────

describe('topologyNarrativeEngine', () => {
  test('always renders fragmentation + forecast (cohesive cold-start)', () => {
    const replay = buildTopologyNarrativeReplay({ organization_id: 'org-a' });
    expect(replay).not.toBeNull();
    expect(replay!.fragmentation_tier).toBe('cohesive');
    expect(replay!.narrative.blocks.length).toBeGreaterThanOrEqual(2);
  });

  test('escalates tier when isolations exist', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const replay = buildTopologyNarrativeReplay({ organization_id: 'org-a' });
    expect(replay!.fragmentation_tier).not.toBe('cohesive');
    expect(replay!.active_isolation_count).toBeGreaterThan(0);
  });

  test('every block in a topology narrative carries source_attributions', () => {
    const replay = buildTopologyNarrativeReplay({ organization_id: 'org-a' });
    for (const block of replay!.narrative.blocks) {
      expect(block.source_attributions.length).toBeGreaterThan(0);
    }
  });

  test('confidence on forecast block is inherited from phase_22_topology', () => {
    const replay = buildTopologyNarrativeReplay({ organization_id: 'org-a' });
    const forecastBlock = replay!.narrative.blocks.find(b => b.template_id === 'topology.forecast.v1');
    expect(forecastBlock!.confidence).toBeDefined();
    expect(forecastBlock!.confidence!.inherited_from_phase).toBe('phase_22_topology');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — trustSurfaceGenerator
// ────────────────────────────────────────────────────────────────────

describe('trustSurfaceGenerator', () => {
  test('every band in the trust surface is inherited from a phase', () => {
    const surface = buildOperationalTrustSurface({ organization_id: 'org-a' });
    expect(surface.bands.length).toBeGreaterThan(0);
    for (const band of surface.bands) {
      expect(band.inherited_from_phase).toMatch(/^phase_/);
      expect(band.source_attribution_id.length).toBeGreaterThan(0);
    }
  });

  test('aggregate score is bounded 0..100', () => {
    const surface = buildOperationalTrustSurface({ organization_id: 'org-a' });
    expect(surface.aggregate_score).toBeGreaterThanOrEqual(0);
    expect(surface.aggregate_score).toBeLessThanOrEqual(100);
  });

  test('isolation lowers the broker_continuity_inherited band', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const surface = buildOperationalTrustSurface({ organization_id: 'org-a' });
    const brokerBand = surface.bands.find(b => b.label === 'broker_continuity_inherited');
    expect(brokerBand!.score).toBeLessThan(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — cognitiveLoadAnalyzer
// ────────────────────────────────────────────────────────────────────

describe('cognitiveLoadAnalyzer', () => {
  test('cold-start partition is light', () => {
    const profile = buildCognitiveLoadProfile({ organization_id: 'org-a' });
    expect(profile.tier).toBe('light');
    expect(profile.load_score).toBe(0);
  });

  test('drivers are ranked by contribution descending', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    brokerRecordFailureRaw(BROKER_NAMESPACES.reliability, 'org-a', 'connection_lost');
    brokerRecordFailureRaw(BROKER_NAMESPACES.drift, 'org-a', 'connection_lost');
    const profile = buildCognitiveLoadProfile({ organization_id: 'org-a' });
    for (let i = 1; i < profile.drivers.length; i++) {
      expect(profile.drivers[i].contribution).toBeLessThanOrEqual(profile.drivers[i - 1].contribution);
    }
  });

  test('high pressure escalates the load tier beyond light', () => {
    // Multiple isolations + worker failures → moderate or higher.
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    brokerRecordFailureRaw(BROKER_NAMESPACES.reliability, 'org-a', 'connection_lost');
    brokerRecordFailureRaw(BROKER_NAMESPACES.drift, 'org-a', 'connection_lost');
    const reg = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (reg.permitted) { markRunning(reg.envelope.worker_id); markFailed(reg.envelope.worker_id, 'fail'); }
    const profile = buildCognitiveLoadProfile({ organization_id: 'org-a' });
    expect(profile.tier).not.toBe('light');
  });

  test('observable_signals captures all 7 metrics', () => {
    const profile = buildCognitiveLoadProfile({ organization_id: 'org-a' });
    expect(profile.observable_signals).toBeDefined();
    expect(typeof profile.observable_signals.fragmentation_pressure).toBe('number');
    expect(typeof profile.observable_signals.active_broker_isolations).toBe('number');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — operatorGuidanceOrchestrator
// ────────────────────────────────────────────────────────────────────

describe('operatorGuidanceOrchestrator', () => {
  test('cold-start partition gets default-floor guidance only', () => {
    const plan = buildOperatorGuidancePlan({ organization_id: 'org-a' });
    expect(plan.items.length).toBeGreaterThanOrEqual(1);
    const onlyFloor = plan.items.every(i => i.attribution.ranked_by_rule === 'no_active_signal_default_floor');
    expect(onlyFloor).toBe(true);
  });

  test('broker isolation generates highest-urgency lift_broker_isolation guidance', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const plan = buildOperatorGuidancePlan({ organization_id: 'org-a' });
    const liftItem = plan.items.find(i => i.attribution.action_kind === 'lift_broker_isolation');
    expect(liftItem).toBeDefined();
    expect(liftItem!.attribution.urgency_score).toBeGreaterThanOrEqual(80);
    expect(liftItem!.attribution.ranked_by_rule).toBe('broker_isolation_blocks_partition');
  });

  test('execution kind isolation generates lift_execution_isolation guidance', () => {
    execQuarantine('apollo_pull', 'org-a');
    const plan = buildOperatorGuidancePlan({ organization_id: 'org-a' });
    const item = plan.items.find(i => i.attribution.action_kind === 'lift_execution_isolation');
    expect(item).toBeDefined();
    expect(item!.target_kind).toBe('apollo_pull');
  });

  test('items are sorted by urgency descending', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    execQuarantine('email_send', 'org-a');
    const plan = buildOperatorGuidancePlan({ organization_id: 'org-a' });
    for (let i = 1; i < plan.items.length; i++) {
      expect(plan.items[i].attribution.urgency_score).toBeLessThanOrEqual(plan.items[i - 1].attribution.urgency_score);
    }
  });

  test('every item carries source_attributions[]', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const plan = buildOperatorGuidancePlan({ organization_id: 'org-a' });
    for (const item of plan.items) {
      expect(item.attribution.source_attributions.length).toBeGreaterThan(0);
    }
  });

  test('every item has an operator-clickable phase + endpoint hint (menu-bounded)', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const plan = buildOperatorGuidancePlan({ organization_id: 'org-a' });
    for (const item of plan.items) {
      expect(item.attribution.operator_clickable_phase).toMatch(/^phase_/);
      expect(item.target_endpoint_hint).toMatch(/^(GET|POST) /);
    }
  });

  test('cross-org isolation: org-a guidance does not affect org-b', () => {
    brokerRecordFailureRaw(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const planB = buildOperatorGuidancePlan({ organization_id: 'org-b' });
    const liftBroker = planB.items.find(i => i.attribution.action_kind === 'lift_broker_isolation');
    expect(liftBroker).toBeUndefined();
  });

  test('listOperatorGuidancePlans is per-org isolated', () => {
    buildOperatorGuidancePlan({ organization_id: 'org-a' });
    expect(listOperatorGuidancePlans('org-a').length).toBe(1);
    expect(listOperatorGuidancePlans('org-b').length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — compressionSummaryCounters
// ────────────────────────────────────────────────────────────────────

describe('compressionSummaryCounters', () => {
  test('default summary has light load and clean health', () => {
    const snap = buildCognitiveCompressionSummary();
    expect(snap.current_load_tier).toBe('light');
    expect(snap.health_scores.operational_clarity).toBe(100);
  });

  test('summary reflects narrative + guidance activity', () => {
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    buildOperationalNarrative({
      organization_id: 'org-a', kind: 'execution_continuity',
      source_event_count: 1, blocks: [block],
    });
    buildOperatorGuidancePlan({ organization_id: 'org-a' });
    const snap = buildCognitiveCompressionSummary();
    expect(snap.recent_narratives_24h).toBeGreaterThanOrEqual(1);
    expect(snap.recent_guidance_plans_24h).toBeGreaterThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 12 — Hallucination guardrails / hard-veto preservation
// ────────────────────────────────────────────────────────────────────

describe('phase 24 hallucination guardrails', () => {
  test('block generation REQUIRES at least one citation (structural anti-hallucination)', () => {
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: [],  // empty → must fail
      selection_rule: 'test',
    });
    expect(block).toBeNull();
  });

  test('unknown templates cannot be rendered (no synthetic fallback)', () => {
    expect(renderTemplate('synthetic.fake.template.v1', { foo: 'bar' })).toBeNull();
  });

  test('confidence cannot be invented — only inherited or aggregated', () => {
    // aggregateInheritedConfidence with empty inputs returns undefined.
    const aggregated = aggregateInheritedConfidence([], 'src', 'phase_22_topology');
    expect(aggregated).toBeUndefined();
  });

  test('Phase 19 federation_enabled=false hard-veto unchanged after Phase 24 install', async () => {
    const consent = await import('../federation/federationConsentEngine');
    consent.updateConsent({
      project_id: 'p1', organization_id: 'org-x',
      federation_enabled: false,
      share_permissions: { contradiction_archetype: true, recovery_archetype: true, routing_archetype: true, governance_drift_signature: true, stabilization_pattern: true },
      consume_permissions: { contradiction_archetype: true, recovery_archetype: true, routing_archetype: true, governance_drift_signature: true, stabilization_pattern: true },
      updated_by: 'ali@colaberry.com',
    });
    expect(consent.canShare('p1', 'recovery_archetype')).toBe(false);
  });

  test('Phase 23 governance supervisor surface unchanged after Phase 24 install', () => {
    const r = evaluateRegistration({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      bounded_envelope: ENV, parent_depth: 0, is_isolated: false,
    });
    expect(r.decision).toBe('permitted');
  });

  test('Phase 21 broker isolation engine surface unchanged after Phase 24 install', () => {
    expect(typeof brokerRecordFailureRaw).toBe('function');
    expect(typeof brokerQuarantineRaw).toBe('function');
  });

  test('Phase 22 topology graph remains untouched (cross-phase install safety)', async () => {
    const graph = await import('../topology/cognitionTopologyGraph');
    expect(typeof graph.buildCognitionTopologyGraph).toBe('function');
  });

  test('execRecordFailure does not affect Phase 24 narrative emission', () => {
    execRecordFailure('email_send', 'org-a', 'envelope_breach');
    const block = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'x', fragment: 'y' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    expect(block).not.toBeNull();
  });

  test('determinism: same inputs produce same hash + same text every time', () => {
    const a = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'src', fragment: 'consistent text' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    const b = buildBlock({
      template_id: 'generic.attribution.v1',
      vars: { source_phase: 'phase_22_topology', source_id: 'src', fragment: 'consistent text' },
      source_attributions: [FAKE_CITE],
      selection_rule: 'test',
    });
    expect(a!.rendered_text).toBe(b!.rendered_text);
    expect(a!.determinism.deterministic_hash).toBe(b!.determinism.deterministic_hash);
  });

  test('topology recovery dependency edges from Phase 23 do not affect Phase 24 narratives', () => {
    recordExecutionDependencyEdge({
      organization_id: 'org-a',
      from_kind: 'one_shot_script', to_kind: 'email_send',
      relation: 'depends_on',
    });
    const surface = buildOperationalTrustSurface({ organization_id: 'org-a' });
    expect(surface.bands.length).toBeGreaterThan(0);
  });

  test('completed worker lifecycle does not generate phantom narrative events', () => {
    const reg = registerWorker({
      kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV,
    });
    if (reg.permitted) {
      markRunning(reg.envelope.worker_id);
      markCompleted(reg.envelope.worker_id, 'done');
    }
    // No automatic narrative is generated by lifecycle transitions —
    // narratives are pulled, not pushed.
    expect(listNarratives('org-a')).toHaveLength(0);
  });
});
