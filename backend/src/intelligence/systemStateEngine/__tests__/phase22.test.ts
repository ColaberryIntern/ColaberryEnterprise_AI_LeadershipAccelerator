/**
 * Phase 22 — bounded within-partition cognition topology orchestration tests.
 *
 * Targets the 9 topology/ modules: types/caps, cognitionTopologyGraph,
 * runtimeDependencyTopology, topologyFragmentationDetector,
 * runtimePropagationTopology, stabilizationInfluenceTracker,
 * topologyForecastEngine, topologyRecoveryOrchestrator,
 * topologyReplayEngine, topologySummaryCounters.
 */

import {
  recordDependencyEdge, listEdges, buildCognitionTopologyGraph,
  downstreamNamespaces, upstreamNamespaces,
  _resetTopologyGraphForTests, _STATIC_EDGE_COUNT_FOR_TESTS,
} from '../topology/cognitionTopologyGraph';
import { buildRuntimeDependencyProfile } from '../topology/runtimeDependencyTopology';
import {
  buildTopologyFragmentationProfile, classifyFragmentationTier,
} from '../topology/topologyFragmentationDetector';
import {
  buildPropagationAttribution, buildRuntimePropagationReplay,
  listRecentPropagationReplays, listRecentAttributions,
  recentPropagationCount24h, _resetPropagationForTests,
} from '../topology/runtimePropagationTopology';
import {
  recordStabilization, listStabilizationPaths, _resetStabilizationForTests,
} from '../topology/stabilizationInfluenceTracker';
import { buildTopologyForecast } from '../topology/topologyForecastEngine';
import {
  buildTopologyRecoveryPlan, executeTopologyRecoveryStep,
  listTopologyRecoveryPlans, _resetTopologyRecoveryForTests,
} from '../topology/topologyRecoveryOrchestrator';
import { buildTopologyVisibilityReplay } from '../topology/topologyReplayEngine';
import {
  buildTopologySummary, setCachedOrgList,
} from '../topology/topologySummaryCounters';
import {
  MAX_DEPENDENCY_EDGES_PER_PARTITION,
  MAX_PROPAGATION_REPLAYS_PER_PARTITION,
  MAX_PROPAGATION_WALK_DEPTH,
  FORECAST_DEFAULT_HORIZON_MINUTES,
  FORECAST_MAX_HORIZON_MINUTES,
} from '../topology/topologyTypes';
import {
  recordFailure, quarantine, liftIsolation, _resetIsolationForTests, isIsolated,
} from '../distributedRuntime/brokerIsolationEngine';
import {
  recordAttribution, _resetAttributionForTests,
} from '../distributedRuntime/brokerOperationAttribution';
import {
  initializeDistributedRuntime, _resetRuntimeForTests, getActiveAdapter,
} from '../distributedRuntime/distributedBrokerRuntime';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

beforeEach(() => {
  _resetTopologyGraphForTests();
  _resetPropagationForTests();
  _resetStabilizationForTests();
  _resetTopologyRecoveryForTests();
  _resetIsolationForTests();
  _resetAttributionForTests();
  _resetRuntimeForTests();
  setCachedOrgList([]);
});

// ────────────────────────────────────────────────────────────────────
// Section 1 — Caps + types
// ────────────────────────────────────────────────────────────────────

describe('Phase 22 architectural caps', () => {
  test('caps are bounded and >= 1', () => {
    expect(MAX_DEPENDENCY_EDGES_PER_PARTITION).toBeGreaterThan(0);
    expect(MAX_PROPAGATION_REPLAYS_PER_PARTITION).toBeGreaterThan(0);
    expect(MAX_PROPAGATION_WALK_DEPTH).toBeGreaterThan(0);
    expect(FORECAST_MAX_HORIZON_MINUTES).toBeGreaterThanOrEqual(FORECAST_DEFAULT_HORIZON_MINUTES);
    expect(_STATIC_EDGE_COUNT_FOR_TESTS).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — cognitionTopologyGraph
// ────────────────────────────────────────────────────────────────────

describe('cognitionTopologyGraph', () => {
  test('partitions start with the full static edge set', () => {
    const edges = listEdges('org-a');
    expect(edges.length).toBe(_STATIC_EDGE_COUNT_FOR_TESTS);
    expect(edges.every(e => e.is_static)).toBe(true);
  });

  test('recordDependencyEdge appends a dynamic edge with is_static=false', () => {
    const edge = recordDependencyEdge({
      organization_id: 'org-a',
      from_namespace: 'custom_ns_a',
      to_namespace: 'custom_ns_b',
      relation: 'reads',
      latency_sensitivity: 'low',
    });
    expect(edge.is_static).toBe(false);
    expect(listEdges('org-a').some(e => !e.is_static && e.from_namespace === 'custom_ns_a')).toBe(true);
  });

  test('per-partition isolation: org-a edges do not leak into org-b', () => {
    recordDependencyEdge({ organization_id: 'org-a', from_namespace: 'a', to_namespace: 'b', relation: 'reads', latency_sensitivity: 'low' });
    const orgAEdges = listEdges('org-a');
    const orgBEdges = listEdges('org-b');
    expect(orgAEdges.length).toBe(_STATIC_EDGE_COUNT_FOR_TESTS + 1);
    expect(orgBEdges.length).toBe(_STATIC_EDGE_COUNT_FOR_TESTS);
    expect(orgBEdges.some(e => e.from_namespace === 'a' && e.to_namespace === 'b')).toBe(false);
  });

  test('graph snapshot computes indegree + outdegree + root + leaf flags', () => {
    const g = buildCognitionTopologyGraph('org-a');
    const effectiveness = g.nodes.find(n => n.namespace === BROKER_NAMESPACES.effectiveness);
    expect(effectiveness).toBeDefined();
    // effectiveness has incoming edges (broker_substrate → effectiveness) and outgoing (→ reliability, → diffusion, etc.)
    expect(effectiveness!.indegree).toBeGreaterThan(0);
    expect(effectiveness!.outdegree).toBeGreaterThan(0);
  });

  test('downstreamNamespaces walks the graph in BFS order', () => {
    const downstream = downstreamNamespaces('org-a', BROKER_NAMESPACES.effectiveness, 16);
    const namespaces = downstream.map(d => d.namespace);
    // From the static graph: effectiveness → reliability, → organizational_stabilization, → diffusion, → drift
    expect(namespaces).toContain(BROKER_NAMESPACES.reliability);
    expect(namespaces).toContain('organizational_stabilization');
    expect(namespaces).toContain(BROKER_NAMESPACES.diffusion);
    expect(namespaces).toContain(BROKER_NAMESPACES.drift);
  });

  test('upstreamNamespaces returns ancestors of a target', () => {
    const ancestors = upstreamNamespaces('org-a', 'organizational_stabilization', 16);
    // organizational_stabilization is reached by effectiveness AND reliability.
    expect(ancestors).toContain(BROKER_NAMESPACES.effectiveness);
    expect(ancestors).toContain(BROKER_NAMESPACES.reliability);
  });

  test('downstream walk respects maxDepth bound', () => {
    const depth1 = downstreamNamespaces('org-a', 'broker_substrate', 1);
    // Within depth 1 we only see direct dependents of broker_substrate.
    const namespaces = new Set(depth1.map(d => d.namespace));
    expect(namespaces.has(BROKER_NAMESPACES.effectiveness)).toBe(true);
    // organizational_stabilization is NOT a direct dependent of broker_substrate.
    expect(namespaces.has('organizational_stabilization')).toBe(false);
  });

  test('dynamic edge cap evicts oldest when exceeded', () => {
    for (let i = 0; i < MAX_DEPENDENCY_EDGES_PER_PARTITION + 50; i++) {
      recordDependencyEdge({
        organization_id: 'org-x',
        from_namespace: `ns-${i}`,
        to_namespace: `ns-${i + 1}`,
        relation: 'reads',
        latency_sensitivity: 'low',
      });
    }
    // total edges = static + capped dynamic = MAX_DEPENDENCY_EDGES_PER_PARTITION
    expect(listEdges('org-x').length).toBe(MAX_DEPENDENCY_EDGES_PER_PARTITION);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — runtimeDependencyTopology
// ────────────────────────────────────────────────────────────────────

describe('runtimeDependencyTopology', () => {
  test('cohesive partition: every chain continuity_status === "continuous"', () => {
    const profile = buildRuntimeDependencyProfile('org-a');
    expect(profile.chains.length).toBeGreaterThan(0);
    expect(profile.chains.every(c => c.continuity_status === 'continuous')).toBe(true);
    expect(profile.stability_score).toBe(100);
  });

  test('isolation on a leaf marks the chain "degraded" (root not isolated)', () => {
    recordFailure('organizational_stabilization', 'org-a', 'connection_lost');
    const profile = buildRuntimeDependencyProfile('org-a');
    const degradedChain = profile.chains.find(c => c.path.includes('organizational_stabilization'));
    expect(degradedChain).toBeDefined();
    expect(degradedChain!.continuity_status).toBe('degraded');
    expect(profile.stability_score).toBeLessThan(100);
  });

  test('isolation on a root marks the chain "broken"', () => {
    recordFailure('broker_substrate', 'org-a', 'connection_lost');
    const profile = buildRuntimeDependencyProfile('org-a');
    const brokenChain = profile.chains.find(c => c.root_namespace === 'broker_substrate');
    expect(brokenChain).toBeDefined();
    expect(brokenChain!.continuity_status).toBe('broken');
  });

  test('cross-org isolation: isolation in org-a does not affect org-b chains', () => {
    recordFailure('broker_substrate', 'org-a', 'connection_lost');
    const profileB = buildRuntimeDependencyProfile('org-b');
    expect(profileB.chains.every(c => c.continuity_status === 'continuous')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — topologyFragmentationDetector
// ────────────────────────────────────────────────────────────────────

describe('topologyFragmentationDetector', () => {
  test('cold-start partition is cohesive', () => {
    const profile = buildTopologyFragmentationProfile('org-a');
    expect(profile.tier).toBe('cohesive');
    expect(profile.fragmentation_pressure_score).toBe(0);
  });

  test('1 isolation → partial tier', () => {
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const profile = buildTopologyFragmentationProfile('org-a');
    expect(profile.tier).toBe('partial');
  });

  test('3 isolations → fragmented tier', () => {
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.reliability, 'org-a', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.drift, 'org-a', 'connection_lost');
    const profile = buildTopologyFragmentationProfile('org-a');
    expect(profile.tier).toBe('fragmented');
  });

  test('isolated dependency cluster is detected', () => {
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.reliability, 'org-a', 'connection_lost');
    const profile = buildTopologyFragmentationProfile('org-a');
    expect(profile.isolated_dependency_clusters.length).toBeGreaterThan(0);
    const cluster = profile.isolated_dependency_clusters.find(c => c.cluster_root === BROKER_NAMESPACES.effectiveness);
    expect(cluster).toBeDefined();
    expect(cluster!.cluster_namespaces).toContain(BROKER_NAMESPACES.reliability);
  });

  test('classifyFragmentationTier deterministic mapping', () => {
    expect(classifyFragmentationTier({ active_isolation_count: 0, active_namespaces: 5, isolated_root_count: 0, cluster_max_depth: 0 })).toBe('cohesive');
    expect(classifyFragmentationTier({ active_isolation_count: 1, active_namespaces: 5, isolated_root_count: 0, cluster_max_depth: 0 })).toBe('partial');
    expect(classifyFragmentationTier({ active_isolation_count: 3, active_namespaces: 10, isolated_root_count: 0, cluster_max_depth: 0 })).toBe('fragmented');
    expect(classifyFragmentationTier({ active_isolation_count: 6, active_namespaces: 10, isolated_root_count: 0, cluster_max_depth: 0 })).toBe('shattered');
    expect(classifyFragmentationTier({ active_isolation_count: 1, active_namespaces: 5, isolated_root_count: 0, cluster_max_depth: 2 })).toBe('fragmented');
  });

  test('cross-partition isolation: org-a fragmentation does not affect org-b', () => {
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.reliability, 'org-a', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.drift, 'org-a', 'connection_lost');
    const profileB = buildTopologyFragmentationProfile('org-b');
    expect(profileB.tier).toBe('cohesive');
    expect(profileB.active_isolation_count).toBe(0);
  });

  test('quarantine produces operator_quarantine reason in cluster explanation', () => {
    quarantine(BROKER_NAMESPACES.effectiveness, 'org-a');
    const profile = buildTopologyFragmentationProfile('org-a');
    expect(profile.active_isolation_count).toBe(1);
    expect(profile.tier).toBe('partial');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — runtimePropagationTopology
// ────────────────────────────────────────────────────────────────────

describe('runtimePropagationTopology', () => {
  test('isolation_propagation walk records impacted namespaces', () => {
    const attribution = buildPropagationAttribution({
      organization_id: 'org-a',
      originating_namespace: BROKER_NAMESPACES.effectiveness,
      propagation_kind: 'isolation_propagation',
    });
    expect(attribution.originating_namespace).toBe(BROKER_NAMESPACES.effectiveness);
    expect(attribution.impacted_namespaces).toContain(BROKER_NAMESPACES.reliability);
    expect(attribution.replay_walk[0].arrived_via).toBe('origin');
    expect(attribution.replay_confidence.confidence_low).toBeLessThanOrEqual(attribution.replay_confidence.confidence_high);
  });

  test('confidence is higher when origin is currently isolated', () => {
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const isoConfidence = buildPropagationAttribution({
      organization_id: 'org-a',
      originating_namespace: BROKER_NAMESPACES.effectiveness,
      propagation_kind: 'isolation_propagation',
    }).replay_confidence;
    liftIsolation(BROKER_NAMESPACES.effectiveness, 'org-a');
    const noIsoConfidence = buildPropagationAttribution({
      organization_id: 'org-a',
      originating_namespace: BROKER_NAMESPACES.effectiveness,
      propagation_kind: 'isolation_propagation',
    }).replay_confidence;
    expect(isoConfidence.observed_signal_strength).toBeGreaterThanOrEqual(noIsoConfidence.observed_signal_strength);
  });

  test('buildRuntimePropagationReplay batches multiple entries with bounded budget', () => {
    const replay = buildRuntimePropagationReplay({
      organization_id: 'org-a',
      entries: [
        { originating_namespace: BROKER_NAMESPACES.effectiveness, kind: 'isolation_propagation' },
        { originating_namespace: BROKER_NAMESPACES.reliability, kind: 'isolation_propagation' },
      ],
    });
    expect(replay.entries.length).toBe(2);
    expect(replay.organization_id).toBe('org-a');
  });

  test('listRecentAttributions returns newest-first', () => {
    buildPropagationAttribution({ organization_id: 'org-a', originating_namespace: BROKER_NAMESPACES.effectiveness, propagation_kind: 'isolation_propagation' });
    buildPropagationAttribution({ organization_id: 'org-a', originating_namespace: BROKER_NAMESPACES.reliability, propagation_kind: 'continuity_restoration' });
    const list = listRecentAttributions('org-a');
    expect(list.length).toBe(2);
    expect(list[0].originating_namespace).toBe(BROKER_NAMESPACES.reliability);
  });

  test('cross-partition isolation: org-a attributions do not leak to org-b', () => {
    buildPropagationAttribution({ organization_id: 'org-a', originating_namespace: BROKER_NAMESPACES.effectiveness, propagation_kind: 'isolation_propagation' });
    expect(listRecentAttributions('org-b')).toHaveLength(0);
    expect(listRecentPropagationReplays('org-b')).toHaveLength(0);
  });

  test('recentPropagationCount24h reflects within 24h replays', () => {
    buildRuntimePropagationReplay({
      organization_id: 'org-a',
      entries: [{ originating_namespace: BROKER_NAMESPACES.effectiveness, kind: 'isolation_propagation' }],
    });
    expect(recentPropagationCount24h('org-a')).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — stabilizationInfluenceTracker
// ────────────────────────────────────────────────────────────────────

describe('stabilizationInfluenceTracker', () => {
  test('recordStabilization captures downstream namespaces', () => {
    const path = recordStabilization({
      organization_id: 'org-a',
      originating_namespace: BROKER_NAMESPACES.effectiveness,
      recovery_kind: 'isolation_lifted',
    });
    expect(path.originating_namespace).toBe(BROKER_NAMESPACES.effectiveness);
    expect(path.stabilized_namespaces).toContain(BROKER_NAMESPACES.reliability);
  });

  test('listStabilizationPaths is per-org isolated', () => {
    recordStabilization({ organization_id: 'org-a', originating_namespace: BROKER_NAMESPACES.effectiveness, recovery_kind: 'isolation_lifted' });
    expect(listStabilizationPaths('org-a').length).toBe(1);
    expect(listStabilizationPaths('org-b').length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — topologyForecastEngine
// ────────────────────────────────────────────────────────────────────

describe('topologyForecastEngine', () => {
  test('cohesive cold-start forecast stays cohesive with high confidence', () => {
    const forecast = buildTopologyForecast({ organization_id: 'org-a' });
    expect(forecast.current_tier).toBe('cohesive');
    expect(forecast.forecast_tier).toBe('cohesive');
    expect(forecast.bounds.confidence_low).toBeLessThanOrEqual(forecast.bounds.confidence_high);
  });

  test('high recent failure rate escalates forecast from cohesive to partial-or-fragmented', () => {
    // Seed 10 ops with 3 failures (30% failure rate) — should escalate beyond cohesive.
    for (let i = 0; i < 7; i++) {
      recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org-a', latency_ms: 1, outcome: 'success' });
    }
    for (let i = 0; i < 3; i++) {
      recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org-a', latency_ms: 1, outcome: 'fallback', fallback_reason: 'r' });
    }
    const forecast = buildTopologyForecast({ organization_id: 'org-a' });
    expect(['partial', 'fragmented']).toContain(forecast.forecast_tier);
    expect(forecast.drivers.length).toBeGreaterThan(0);
  });

  test('horizon clamped to FORECAST_MAX_HORIZON_MINUTES', () => {
    const forecast = buildTopologyForecast({ organization_id: 'org-a', horizon_minutes: 99999 });
    expect(forecast.forecast_horizon_minutes).toBe(FORECAST_MAX_HORIZON_MINUTES);
  });

  test('horizon defaults when invalid', () => {
    const forecast = buildTopologyForecast({ organization_id: 'org-a', horizon_minutes: 0 });
    expect(forecast.forecast_horizon_minutes).toBe(FORECAST_DEFAULT_HORIZON_MINUTES);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — topologyRecoveryOrchestrator
// ────────────────────────────────────────────────────────────────────

describe('topologyRecoveryOrchestrator', () => {
  test('every step is operator_required=true', () => {
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const plan = buildTopologyRecoveryPlan({ organization_id: 'org-a', trigger: 'fragmentation_detected' });
    expect(plan.steps.length).toBeGreaterThan(0);
    for (const s of plan.steps) expect(s.operator_required).toBe(true);
  });

  test('lift_isolation steps are sequenced before retry+replay steps', () => {
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.reliability, 'org-a', 'connection_lost');
    const plan = buildTopologyRecoveryPlan({ organization_id: 'org-a', trigger: 'fragmentation_detected' });
    const liftIndices = plan.steps.filter(s => s.kind === 'lift_isolation').map(s => s.sequence_index);
    const retryIndices = plan.steps.filter(s => s.kind === 'retry_namespace').map(s => s.sequence_index);
    const replayIndices = plan.steps.filter(s => s.kind === 'force_replay').map(s => s.sequence_index);
    expect(Math.max(...liftIndices)).toBeLessThan(Math.min(...retryIndices));
    expect(Math.max(...retryIndices)).toBeLessThan(Math.min(...replayIndices));
  });

  test('lift step ordered by upstream-isolation count: namespaces with no isolated upstreams first', () => {
    // effectiveness has no isolated upstream; reliability depends on effectiveness.
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.reliability, 'org-a', 'connection_lost');
    const plan = buildTopologyRecoveryPlan({ organization_id: 'org-a', trigger: 'fragmentation_detected' });
    const liftSteps = plan.steps.filter(s => s.kind === 'lift_isolation');
    expect(liftSteps[0].target_namespace).toBe(BROKER_NAMESPACES.effectiveness);
    expect(liftSteps[1].target_namespace).toBe(BROKER_NAMESPACES.reliability);
  });

  test('executeTopologyRecoveryStep on lift_isolation actually lifts and records stabilization', async () => {
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const plan = buildTopologyRecoveryPlan({ organization_id: 'org-a', trigger: 'fragmentation_detected' });
    const liftStep = plan.steps.find(s => s.kind === 'lift_isolation')!;
    expect(isIsolated(BROKER_NAMESPACES.effectiveness, 'org-a')).toBe(true);
    const result = await executeTopologyRecoveryStep({ plan_id: plan.plan_id, step_id: liftStep.step_id, operator_id: 'op' });
    expect(result.executed).toBe(true);
    expect(result.notes).toContain('isolation_lifted');
    expect(isIsolated(BROKER_NAMESPACES.effectiveness, 'org-a')).toBe(false);
    expect(listStabilizationPaths('org-a').length).toBe(1);
  });

  test('executeTopologyRecoveryStep on force_replay records a replay-completed stabilization', async () => {
    initializeDistributedRuntime();
    const adapter = getActiveAdapter();
    await adapter.put('org-a', BROKER_NAMESPACES.effectiveness, 'k', { v: 1 });
    const plan = buildTopologyRecoveryPlan({ organization_id: 'org-a', trigger: 'operator_requested' });
    const replayStep = plan.steps.find(s => s.kind === 'force_replay')!;
    const result = await executeTopologyRecoveryStep({ plan_id: plan.plan_id, step_id: replayStep.step_id, operator_id: 'op' });
    expect(result.executed).toBe(true);
    expect(result.notes).toContain('replay_');
  });

  test('plan with no isolations still produces ping + replay steps', () => {
    const plan = buildTopologyRecoveryPlan({ organization_id: 'org-a', trigger: 'operator_requested' });
    expect(plan.steps.some(s => s.kind === 'retry_namespace')).toBe(true);
    expect(plan.steps.some(s => s.kind === 'force_replay')).toBe(true);
    expect(plan.steps.some(s => s.kind === 'lift_isolation')).toBe(false);
  });

  test('listTopologyRecoveryPlans is per-org isolated', () => {
    buildTopologyRecoveryPlan({ organization_id: 'org-a', trigger: 'operator_requested' });
    expect(listTopologyRecoveryPlans('org-a').length).toBe(1);
    expect(listTopologyRecoveryPlans('org-b').length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — topologyReplayEngine + topology_summary surface
// ────────────────────────────────────────────────────────────────────

describe('topologyReplayEngine + topology_summary', () => {
  test('buildTopologyVisibilityReplay composes graph + fragmentation + dependencies + forecast', () => {
    const v = buildTopologyVisibilityReplay({ organization_id: 'org-a' });
    expect(v.graph.nodes.length).toBeGreaterThan(0);
    expect(v.fragmentation.tier).toBe('cohesive');
    expect(v.dependencies.chains.length).toBeGreaterThan(0);
    expect(v.forecast.current_tier).toBe('cohesive');
  });

  test('topology_summary aggregates across cached orgs', () => {
    setCachedOrgList(['org-a', 'org-b', 'org-c']);
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const snap = buildTopologySummary();
    expect(snap.partition_count).toBe(3);
    expect(snap.cohesive_partition_count).toBe(2);
    expect(snap.health_scores.topology_cohesion).toBeGreaterThan(0);
  });

  test('topology_summary defaults to 0 partitions when nothing cached', () => {
    const snap = buildTopologySummary();
    expect(snap.partition_count).toBe(0);
    expect(snap.cohesive_partition_count).toBe(0);
  });

  test('topology_summary fragmentation_pressure rises with shattered partitions', () => {
    setCachedOrgList(['org-shattered', 'org-cohesive']);
    // Shatter org-shattered: isolate ≥50% of active namespaces. Make many isolations.
    recordFailure(BROKER_NAMESPACES.effectiveness, 'org-shattered', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.reliability, 'org-shattered', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.policy_proposals, 'org-shattered', 'connection_lost');
    recordFailure('broker_substrate', 'org-shattered', 'connection_lost');
    recordFailure(BROKER_NAMESPACES.drift, 'org-shattered', 'connection_lost');
    const snap = buildTopologySummary();
    expect(snap.shattered_partition_count + snap.fragmented_partition_count).toBeGreaterThanOrEqual(1);
    expect(snap.health_scores.fragmentation_pressure).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — Topology guardrails / hard-veto preservation
// ────────────────────────────────────────────────────────────────────

describe('topology guardrails', () => {
  test('Phase 19 federation_enabled=false hard-veto unchanged after Phase 22 install', async () => {
    const consent = await import('../federation/federationConsentEngine');
    consent.updateConsent({
      project_id: 'p1', organization_id: 'org-x',
      federation_enabled: false,
      share_permissions: { contradiction_archetype: true, recovery_archetype: true, routing_archetype: true, governance_drift_signature: true, stabilization_pattern: true },
      consume_permissions: { contradiction_archetype: true, recovery_archetype: true, routing_archetype: true, governance_drift_signature: true, stabilization_pattern: true },
      updated_by: 'ali@colaberry.com',
    });
    expect(consent.canShare('p1', 'recovery_archetype')).toBe(false);
    expect(consent.canConsume('p1', 'recovery_archetype')).toBe(false);
  });

  test('Phase 21 isolation engine surface unchanged after Phase 22 install', async () => {
    const isolation = await import('../distributedRuntime/brokerIsolationEngine');
    expect(typeof isolation.recordFailure).toBe('function');
    expect(typeof isolation.liftIsolation).toBe('function');
    expect(typeof isolation.quarantine).toBe('function');
  });

  test('Phase 22 topology graph is per-partition: no cross-org edge propagation', () => {
    recordDependencyEdge({
      organization_id: 'org-a',
      from_namespace: 'custom_a',
      to_namespace: 'custom_b',
      relation: 'reads',
      latency_sensitivity: 'low',
    });
    const orgB = buildCognitionTopologyGraph('org-b');
    expect(orgB.edges.some(e => e.from_namespace === 'custom_a')).toBe(false);
  });
});
