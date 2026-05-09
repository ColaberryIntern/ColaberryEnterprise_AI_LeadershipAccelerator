/**
 * Phase 25 — deterministic counterfactual operational projection tests.
 *
 * Targets: types/caps, sandboxGovernanceSupervisor, executionSandboxEngine,
 * rollbackSimulationEngine, propagationPreviewEngine,
 * stabilizationRehearsalEngine, topologyExperimentationGraph,
 * experimentReplayEngine, experimentationTrustSurface,
 * experimentationVisibilityReplay, experimentationSummaryCounters.
 */

import {
  evaluateSandboxSubmission, buildSandboxGovernanceProfile,
  listSandboxGovernanceAttributions, recentSandboxDecisionCount24h,
  _resetSandboxGovernanceForTests,
} from '../experimentation/sandboxGovernanceSupervisor';
import {
  submitExecutionSandbox, listSandboxes, getSandbox, recentSandboxCount24h,
  _resetSandboxesForTests,
} from '../experimentation/executionSandboxEngine';
import {
  simulateRollback, listRollbackSimulations,
  _resetRollbackSimulationsForTests,
} from '../experimentation/rollbackSimulationEngine';
import {
  buildPropagationPreview, listPropagationPreviews,
  _resetPropagationPreviewsForTests,
} from '../experimentation/propagationPreviewEngine';
import {
  rehearseStabilization, listRehearsals,
  _resetRehearsalsForTests,
} from '../experimentation/stabilizationRehearsalEngine';
import { buildTopologyExperimentationView } from '../experimentation/topologyExperimentationGraph';
import { buildExperimentReplayBundle } from '../experimentation/experimentReplayEngine';
import { buildExperimentationTrustSurface } from '../experimentation/experimentationTrustSurface';
import { buildExperimentationVisibilityReplay } from '../experimentation/experimentationVisibilityReplay';
import { buildExperimentationSummary } from '../experimentation/experimentationSummaryCounters';
import {
  MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX, MAX_REHEARSAL_CHAIN_DEPTH,
  MAX_PROJECTION_BUDGET_MS, SANDBOX_TTL_MS, MAX_SANDBOXES_PER_PARTITION,
} from '../experimentation/experimentationTypes';
import type { HypotheticalAction } from '../experimentation/experimentationTypes';
import {
  recordFailure as brokerRecordFailure,
  quarantine as brokerQuarantine,
  _resetIsolationForTests as _resetBrokerIso,
} from '../distributedRuntime/brokerIsolationEngine';
import {
  registerWorker, markRunning, markFailed, markCompleted,
  _resetCoordinatorForTests,
} from '../executionSubstrate/executionRuntimeCoordinator';
import {
  buildRollbackExecutionPlan,
  _resetRollbackForTests,
} from '../executionSubstrate/rollbackExecutionCoordinator';
import {
  _resetExecutionTopologyForTests,
} from '../executionSubstrate/executionTopologyGraph';
import { _resetGovernanceForTests as _resetExecGovernance } from '../executionSubstrate/executionGovernanceSupervisor';
import {
  _resetIsolationForTests as _resetExecIso,
  quarantine as execQuarantine,
} from '../executionSubstrate/executionIsolationEngine';
import {
  _resetPropagationForTests as _resetTopologyPropagation,
} from '../topology/runtimePropagationTopology';
import {
  _resetTopologyGraphForTests,
} from '../topology/cognitionTopologyGraph';
import { _resetRuntimeForTests } from '../distributedRuntime/distributedBrokerRuntime';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

beforeEach(() => {
  _resetSandboxGovernanceForTests();
  _resetSandboxesForTests();
  _resetRollbackSimulationsForTests();
  _resetPropagationPreviewsForTests();
  _resetRehearsalsForTests();
  _resetBrokerIso();
  _resetCoordinatorForTests();
  _resetRollbackForTests();
  _resetExecutionTopologyForTests();
  _resetExecGovernance();
  _resetExecIso();
  _resetTopologyPropagation();
  _resetTopologyGraphForTests();
  _resetRuntimeForTests();
});

const ENV = {
  max_duration_ms: 60_000, max_attempts: 1,
  allowed_namespaces: ['email_send'], parent_depth_limit: 0,
};

const LIFT_ACTION: HypotheticalAction = {
  action_id: 'a-1',
  kind: 'lift_broker_isolation',
  target_namespace: BROKER_NAMESPACES.effectiveness,
};

// ────────────────────────────────────────────────────────────────────
// Section 1 — Caps
// ────────────────────────────────────────────────────────────────────

describe('Phase 25 architectural caps', () => {
  test('caps are bounded and >= 1', () => {
    expect(MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX).toBeGreaterThan(0);
    expect(MAX_REHEARSAL_CHAIN_DEPTH).toBeGreaterThan(0);
    expect(MAX_PROJECTION_BUDGET_MS).toBeGreaterThan(0);
    expect(SANDBOX_TTL_MS).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — sandboxGovernanceSupervisor (HARD GATE)
// ────────────────────────────────────────────────────────────────────

describe('sandboxGovernanceSupervisor', () => {
  test('valid submission is permitted', () => {
    const r = evaluateSandboxSubmission({
      experiment_id: 'exp-1', organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION], chain_depth: 0,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    expect(r.decision).toBe('permitted');
  });

  test('missing organization_id rejected', () => {
    const r = evaluateSandboxSubmission({
      experiment_id: 'exp-1', organization_id: '',
      hypothetical_actions: [LIFT_ACTION], chain_depth: 0,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('organization_id_missing');
  });

  test('action count above cap rejected', () => {
    const actions: HypotheticalAction[] = Array.from({ length: MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX + 1 }, (_, i) => ({
      ...LIFT_ACTION, action_id: `a-${i}`,
    }));
    const r = evaluateSandboxSubmission({
      experiment_id: 'exp-1', organization_id: 'org-a',
      hypothetical_actions: actions, chain_depth: 0,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('action_count_exceeded');
  });

  test('chain depth above cap rejected', () => {
    const r = evaluateSandboxSubmission({
      experiment_id: 'exp-1', organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION], chain_depth: MAX_REHEARSAL_CHAIN_DEPTH + 1,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('chain_depth_exceeded');
  });

  test('projection budget above cap rejected', () => {
    const r = evaluateSandboxSubmission({
      experiment_id: 'exp-1', organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION], chain_depth: 0,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS + 1,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('projection_budget_exceeded');
  });

  test('unknown action kind rejected', () => {
    const r = evaluateSandboxSubmission({
      experiment_id: 'exp-1', organization_id: 'org-a',
      hypothetical_actions: [{ ...LIFT_ACTION, kind: 'fabricated_action' as any }],
      chain_depth: 0, projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('unknown_action_kind');
  });

  test('every decision emits attribution', () => {
    evaluateSandboxSubmission({
      experiment_id: 'exp-1', organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION], chain_depth: 0,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    evaluateSandboxSubmission({
      experiment_id: 'exp-2', organization_id: '',
      hypothetical_actions: [LIFT_ACTION], chain_depth: 0,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    expect(listSandboxGovernanceAttributions('org-a').length).toBe(1);
    expect(recentSandboxDecisionCount24h()).toBeGreaterThanOrEqual(1);
  });

  test('cross-org isolation: org-a attributions never leak to org-b', () => {
    evaluateSandboxSubmission({
      experiment_id: 'exp-a', organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION], chain_depth: 0,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    expect(listSandboxGovernanceAttributions('org-a').length).toBe(1);
    expect(listSandboxGovernanceAttributions('org-b').length).toBe(0);
  });

  test('buildSandboxGovernanceProfile reports decision counts', () => {
    evaluateSandboxSubmission({
      experiment_id: 'e-1', organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION], chain_depth: 0,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    evaluateSandboxSubmission({
      experiment_id: 'e-2', organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION], chain_depth: MAX_REHEARSAL_CHAIN_DEPTH + 5,
      projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    });
    const p = buildSandboxGovernanceProfile('org-a');
    expect(p.decision_counts.permitted).toBe(1);
    expect(p.decision_counts.rejected).toBe(1);
    expect(p.violation_counts_by_rule.chain_depth_exceeded).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — executionSandboxEngine (PURE simulation)
// ────────────────────────────────────────────────────────────────────

describe('executionSandboxEngine', () => {
  test('submitting an empty action list is observed_state tier', () => {
    const r = submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [] });
    expect(r.permitted).toBe(true);
    if (r.permitted) {
      expect(r.sandbox.tier).toBe('observed_state');
      expect(r.sandbox.projected_deltas.length).toBe(0);
    }
  });

  test('single action produces single_step_projection tier', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const r = submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    expect(r.permitted).toBe(true);
    if (r.permitted) {
      expect(r.sandbox.tier).toBe('single_step_projection');
      expect(r.sandbox.projected_deltas.length).toBeGreaterThan(0);
      expect(r.sandbox.projected_deltas.some(d => d.projected_change_kind === 'isolation_lifted')).toBe(true);
    }
  });

  test('multiple actions produce chained_rehearsal tier', () => {
    const r = submitExecutionSandbox({
      organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION, { ...LIFT_ACTION, action_id: 'a-2' }],
    });
    expect(r.permitted).toBe(true);
    if (r.permitted) expect(r.sandbox.tier).toBe('chained_rehearsal');
  });

  test('every sandbox carries an isolation_guarantee with all blocked flags=true', () => {
    const r = submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    if (!r.permitted) return;
    const g = r.sandbox.isolation_guarantee;
    expect(g.runtime_writes_blocked).toBe(true);
    expect(g.broker_writes_blocked).toBe(true);
    expect(g.federation_writes_blocked).toBe(true);
    expect(g.topology_writes_blocked).toBe(true);
    expect(g.execution_substrate_writes_blocked).toBe(true);
    expect(g.isolation_proof_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('determinism: same hypothetical actions produce same projected_state_hash', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const r1 = submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    const r2 = submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    if (!r1.permitted || !r2.permitted) return;
    expect(r1.sandbox.determinism.projected_state_hash).toBe(r2.sandbox.determinism.projected_state_hash);
    expect(r1.sandbox.determinism.hypothetical_action_hash).toBe(r2.sandbox.determinism.hypothetical_action_hash);
  });

  test('NEVER mutates live broker isolation state', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const beforeProfile = require('../distributedRuntime/brokerIsolationEngine').buildIsolationProfile(
      require('../distributedRuntime/distributedBrokerRuntime').getActiveAdapterKind(),
    );
    const beforeCount = beforeProfile.active_isolation_count;
    submitExecutionSandbox({
      organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION],          // hypothetical lift — should NOT actually lift
    });
    const afterProfile = require('../distributedRuntime/brokerIsolationEngine').buildIsolationProfile(
      require('../distributedRuntime/distributedBrokerRuntime').getActiveAdapterKind(),
    );
    expect(afterProfile.active_isolation_count).toBe(beforeCount);
    expect(beforeCount).toBeGreaterThan(0);
  });

  test('NEVER mutates execution worker lifecycle state', () => {
    const reg = registerWorker({ kind: 'mutation_execution', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!reg.permitted) return;
    markRunning(reg.envelope.worker_id);
    submitExecutionSandbox({
      organization_id: 'org-a',
      hypothetical_actions: [{
        action_id: 'a-rb',
        kind: 'rollback_worker_lifecycle',
        target_worker_id: reg.envelope.worker_id,
      }],
    });
    const { getEnvelope } = require('../executionSubstrate/executionRuntimeCoordinator');
    const env = getEnvelope(reg.envelope.worker_id);
    expect(env?.lifecycle_state).toBe('running');     // unchanged
  });

  test('rejected submission returns permitted=false with reason', () => {
    const r = submitExecutionSandbox({ organization_id: '', hypothetical_actions: [LIFT_ACTION] });
    expect(r.permitted).toBe(false);
    if (!r.permitted) {
      expect(r.decision).toBe('rejected');
      expect(r.supervisor_rule_violated).toBe('organization_id_missing');
    }
  });

  test('cross-org isolation: org-a sandboxes do not appear in org-b list', () => {
    submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    expect(listSandboxes('org-a').length).toBe(1);
    expect(listSandboxes('org-b').length).toBe(0);
  });

  test('add_broker_isolation projects downstream deltas without mutating state', () => {
    const r = submitExecutionSandbox({
      organization_id: 'org-a',
      hypothetical_actions: [{
        action_id: 'a-add', kind: 'add_broker_isolation',
        target_namespace: BROKER_NAMESPACES.effectiveness,
      }],
    });
    if (!r.permitted) return;
    expect(r.sandbox.projected_deltas.some(d => d.projected_change_kind === 'isolation_added')).toBe(true);
    // Live state stays unchanged.
    const { isIsolated } = require('../distributedRuntime/brokerIsolationEngine');
    expect(isIsolated(BROKER_NAMESPACES.effectiveness, 'org-a')).toBe(false);
  });

  test('lift_execution_isolation against a quarantined kind projects isolation_lifted', () => {
    execQuarantine('email_send', 'org-a');
    const r = submitExecutionSandbox({
      organization_id: 'org-a',
      hypothetical_actions: [{
        action_id: 'a-le', kind: 'lift_execution_isolation', target_kind: 'email_send',
      }],
    });
    if (!r.permitted) return;
    expect(r.sandbox.projected_deltas.some(d => d.projected_change_kind === 'isolation_lifted')).toBe(true);
    // Live state stays unchanged.
    const { isIsolated: isExecIsolated } = require('../executionSubstrate/executionIsolationEngine');
    expect(isExecIsolated('email_send', 'org-a')).toBe(true);
  });

  test('lift on non-isolated namespace projects no_change', () => {
    const r = submitExecutionSandbox({
      organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!r.permitted) return;
    const liftDelta = r.sandbox.projected_deltas.find(d => d.namespace === LIFT_ACTION.target_namespace);
    expect(liftDelta?.projected_change_kind).toBe('no_change');
  });

  test('ring buffer cap evicts oldest', () => {
    for (let i = 0; i < MAX_SANDBOXES_PER_PARTITION + 5; i++) {
      submitExecutionSandbox({
        organization_id: 'org-cap',
        hypothetical_actions: [{ ...LIFT_ACTION, action_id: `a-${i}` }],
      });
    }
    expect(listSandboxes('org-cap').length).toBe(MAX_SANDBOXES_PER_PARTITION);
  });

  test('getSandbox returns the requested sandbox', () => {
    const r = submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    if (!r.permitted) return;
    const fetched = getSandbox('org-a', r.sandbox.sandbox_id);
    expect(fetched?.sandbox_id).toBe(r.sandbox.sandbox_id);
  });

  test('recentSandboxCount24h tracks 24h activity', () => {
    submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    expect(recentSandboxCount24h('org-a')).toBeGreaterThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — rollbackSimulationEngine (DRY-RUN)
// ────────────────────────────────────────────────────────────────────

describe('rollbackSimulationEngine', () => {
  test('simulation against no plans produces skipped outcome', () => {
    const sim = simulateRollback({ organization_id: 'org-a' });
    expect(sim.projected_outcome).toBe('skipped');
    expect(sim.steps.length).toBe(0);
  });

  test('simulation against an existing rollback plan walks projected transitions', () => {
    buildRollbackExecutionPlan({
      organization_id: 'org-a', trigger: 'mutation_failed',
      source_chains: [
        { source_phase: 'mutation', chain_id: 'mut-1', steps: [
          { source_step_ref: 's1', description: 'd', impact_estimate: 'medium' },
          { source_step_ref: 's2', description: 'd', impact_estimate: 'low' },
        ]},
      ],
    });
    const reg = registerWorker({ kind: 'mutation_execution', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (reg.permitted) { markRunning(reg.envelope.worker_id); markFailed(reg.envelope.worker_id, 'simulated'); }
    const sim = simulateRollback({ organization_id: 'org-a' });
    expect(sim.steps.length).toBeGreaterThan(0);
    expect(sim.projected_outcome).not.toBe('skipped');
  });

  test('NEVER mutates live worker lifecycle', () => {
    buildRollbackExecutionPlan({
      organization_id: 'org-a', trigger: 'operator_requested',
      source_chains: [{ source_phase: 'mutation', chain_id: 'm1', steps: [{ source_step_ref: 's1', description: 'd', impact_estimate: 'low' }] }],
    });
    const reg = registerWorker({ kind: 'mutation_execution', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!reg.permitted) return;
    markRunning(reg.envelope.worker_id);
    markFailed(reg.envelope.worker_id, 'simulated');
    simulateRollback({ organization_id: 'org-a' });
    const { getEnvelope } = require('../executionSubstrate/executionRuntimeCoordinator');
    const env = getEnvelope(reg.envelope.worker_id);
    expect(env?.lifecycle_state).toBe('failed');     // NOT rolled_back
  });

  test('determinism hash preserved on simulations', () => {
    const sim = simulateRollback({ organization_id: 'org-a' });
    expect(sim.determinism.replayable).toBe(true);
    expect(sim.determinism.deterministic).toBe(true);
    expect(sim.determinism.projected_state_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('cross-org isolation', () => {
    simulateRollback({ organization_id: 'org-a' });
    expect(listRollbackSimulations('org-a').length).toBe(1);
    expect(listRollbackSimulations('org-b').length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — propagationPreviewEngine
// ────────────────────────────────────────────────────────────────────

describe('propagationPreviewEngine', () => {
  test('preview wraps Phase 22 walk and inherits confidence', () => {
    const preview = buildPropagationPreview({
      organization_id: 'org-a',
      hypothetical_origin: BROKER_NAMESPACES.effectiveness,
      hypothetical_action_kind: 'add_broker_isolation',
    });
    expect(preview.projected_impacted_namespaces.length).toBeGreaterThan(0);
    expect(preview.inherited_confidence.inherited_from_phase).toBe('phase_22_topology');
    expect(preview.inherited_confidence.low).toBeLessThanOrEqual(preview.inherited_confidence.high);
  });

  test('NEVER mutates live broker isolation state', () => {
    buildPropagationPreview({
      organization_id: 'org-a',
      hypothetical_origin: BROKER_NAMESPACES.effectiveness,
      hypothetical_action_kind: 'add_broker_isolation',
    });
    const { isIsolated } = require('../distributedRuntime/brokerIsolationEngine');
    expect(isIsolated(BROKER_NAMESPACES.effectiveness, 'org-a')).toBe(false);
  });

  test('cross-org isolation', () => {
    buildPropagationPreview({
      organization_id: 'org-a',
      hypothetical_origin: BROKER_NAMESPACES.effectiveness,
      hypothetical_action_kind: 'add_broker_isolation',
    });
    expect(listPropagationPreviews('org-a').length).toBe(1);
    expect(listPropagationPreviews('org-b').length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — stabilizationRehearsalEngine
// ────────────────────────────────────────────────────────────────────

describe('stabilizationRehearsalEngine', () => {
  test('empty chain rejected', () => {
    const r = rehearseStabilization({ organization_id: 'org-a', chain: [] });
    expect(r.success).toBe(false);
    expect(r.rejection_reason).toBe('empty_chain');
  });

  test('chain depth above cap rejected', () => {
    const tooDeep: HypotheticalAction[] = Array.from({ length: MAX_REHEARSAL_CHAIN_DEPTH + 1 }, (_, i) => ({
      ...LIFT_ACTION, action_id: `a-${i}`,
    }));
    const r = rehearseStabilization({ organization_id: 'org-a', chain: tooDeep });
    expect(r.success).toBe(false);
    expect(r.rejection_reason).toContain('chain_depth');
  });

  test('valid chain produces deterministic step-by-step projections', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const chain: HypotheticalAction[] = [LIFT_ACTION, { action_id: 'a-2', kind: 'force_continuity_replay' }];
    const r = rehearseStabilization({ organization_id: 'org-a', chain });
    expect(r.success).toBe(true);
    if (!r.replay) return;
    expect(r.replay.steps.length).toBe(2);
    expect(r.replay.determinism.replayable).toBe(true);
  });

  test('NEVER mutates live state', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    rehearseStabilization({ organization_id: 'org-a', chain: [LIFT_ACTION] });
    const { isIsolated } = require('../distributedRuntime/brokerIsolationEngine');
    expect(isIsolated(BROKER_NAMESPACES.effectiveness, 'org-a')).toBe(true);     // still isolated
  });

  test('cross-org isolation', () => {
    rehearseStabilization({ organization_id: 'org-a', chain: [LIFT_ACTION] });
    expect(listRehearsals('org-a').length).toBe(1);
    expect(listRehearsals('org-b').length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — topologyExperimentationGraph
// ────────────────────────────────────────────────────────────────────

describe('topologyExperimentationGraph', () => {
  test('view exposes base graph counts + no annotations by default', () => {
    const v = buildTopologyExperimentationView({ organization_id: 'org-a' });
    expect(v.base_cognition_node_count).toBeGreaterThan(0);
    expect(v.cycle_detected).toBe(false);
  });

  test('cycle detection: hypothetical edge that creates a back-edge is flagged', () => {
    // effectiveness_profiles → reliability_profiles is a static edge.
    // Adding reliability_profiles → effectiveness_profiles would create a cycle.
    const v = buildTopologyExperimentationView({
      organization_id: 'org-a',
      hypothetical_annotation: {
        hypothetical_edge_added: { from: BROKER_NAMESPACES.reliability, to: BROKER_NAMESPACES.effectiveness },
      },
    });
    expect(v.cycle_detected).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — experimentReplayEngine
// ────────────────────────────────────────────────────────────────────

describe('experimentReplayEngine', () => {
  test('replay bundle exposes determinism hashes for all artifacts', () => {
    submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    rehearseStabilization({ organization_id: 'org-a', chain: [LIFT_ACTION] });
    simulateRollback({ organization_id: 'org-a' });
    const bundle = buildExperimentReplayBundle({ organization_id: 'org-a' });
    expect(bundle.determinism_hashes.length).toBeGreaterThan(0);
    for (const h of bundle.determinism_hashes) {
      expect(h.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(['sandbox', 'rollback_simulation', 'rehearsal']).toContain(h.artifact_kind);
    }
  });

  test('cross-org bundle isolation', () => {
    submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    const bundle = buildExperimentReplayBundle({ organization_id: 'org-b' });
    expect(bundle.sandboxes.length).toBe(0);
    expect(bundle.determinism_hashes.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — experimentationTrustSurface
// ────────────────────────────────────────────────────────────────────

describe('experimentationTrustSurface', () => {
  test('all bands trace to a phase + source attribution', () => {
    const surface = buildExperimentationTrustSurface({ organization_id: 'org-a' });
    expect(surface.bands.length).toBe(6);
    for (const band of surface.bands) {
      expect(band.inherited_from_phase).toMatch(/^phase_/);
      expect(band.source_attribution_id.length).toBeGreaterThan(0);
    }
  });

  test('aggregate score is bounded 0..100', () => {
    const surface = buildExperimentationTrustSurface({ organization_id: 'org-a' });
    expect(surface.aggregate_score).toBeGreaterThanOrEqual(0);
    expect(surface.aggregate_score).toBeLessThanOrEqual(100);
  });

  test('sandbox isolation proof band is 100 when every sandbox carries the guarantee', () => {
    submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    const surface = buildExperimentationTrustSurface({ organization_id: 'org-a' });
    const proof = surface.bands.find(b => b.label === 'sandbox_isolation_proof');
    expect(proof?.score).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — visibility + summary
// ────────────────────────────────────────────────────────────────────

describe('experimentation visibility + summary', () => {
  test('visibility composes recent sandboxes + simulations + previews + rehearsals + governance + trust', () => {
    submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    rehearseStabilization({ organization_id: 'org-a', chain: [LIFT_ACTION] });
    const v = buildExperimentationVisibilityReplay({ organization_id: 'org-a' });
    expect(v.recent_sandboxes.length).toBeGreaterThan(0);
    expect(v.recent_rehearsals.length).toBeGreaterThan(0);
    expect(v.trust_surface.bands.length).toBe(6);
    expect(v.recent_governance_decisions.length).toBeGreaterThan(0);
  });

  test('summary defaults to clean state', () => {
    const snap = buildExperimentationSummary();
    expect(snap.recent_sandboxes_24h).toBe(0);
    expect(snap.health_scores.sandbox_integrity).toBe(100);
    expect(snap.health_scores.experimentation_safety).toBe(100);
  });

  test('summary reflects activity', () => {
    submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [LIFT_ACTION] });
    rehearseStabilization({ organization_id: 'org-a', chain: [LIFT_ACTION] });
    const snap = buildExperimentationSummary();
    expect(snap.recent_sandboxes_24h).toBeGreaterThanOrEqual(1);
    expect(snap.recent_rehearsals_24h).toBeGreaterThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — Hard-veto / production-state-protection guardrails
// ────────────────────────────────────────────────────────────────────

describe('phase 25 production-state protection', () => {
  test('Phase 19 federation hard veto unchanged after Phase 25 install', async () => {
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

  test('Phase 21 broker quarantine unchanged after Phase 25 sandbox use', () => {
    brokerQuarantine(BROKER_NAMESPACES.effectiveness, 'org-a');
    submitExecutionSandbox({
      organization_id: 'org-a',
      hypothetical_actions: [LIFT_ACTION],
    });
    const { getIsolationState } = require('../distributedRuntime/brokerIsolationEngine');
    const state = getIsolationState(BROKER_NAMESPACES.effectiveness, 'org-a');
    expect(state?.operator_quarantined).toBe(true);     // sandbox did NOT lift the quarantine
  });

  test('Phase 23 worker lifecycle unchanged after sandbox rollback hypothetical', () => {
    const reg = registerWorker({ kind: 'briefing_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!reg.permitted) return;
    markRunning(reg.envelope.worker_id);
    markCompleted(reg.envelope.worker_id, 'done');
    submitExecutionSandbox({
      organization_id: 'org-a',
      hypothetical_actions: [{
        action_id: 'a-rb',
        kind: 'rollback_worker_lifecycle',
        target_worker_id: reg.envelope.worker_id,
      }],
    });
    const { getEnvelope } = require('../executionSubstrate/executionRuntimeCoordinator');
    const env = getEnvelope(reg.envelope.worker_id);
    expect(env?.lifecycle_state).toBe('completed');     // hypothetical rollback did NOT mutate
  });

  test('rollback simulation reading rollback plans does not invoke real rollback execution', () => {
    buildRollbackExecutionPlan({
      organization_id: 'org-a', trigger: 'operator_requested',
      source_chains: [{ source_phase: 'mutation', chain_id: 'm1', steps: [{ source_step_ref: 's1', description: 'd', impact_estimate: 'low' }] }],
    });
    const beforePlans = require('../executionSubstrate/rollbackExecutionCoordinator').listRollbackPlans('org-a');
    const beforeStatuses = beforePlans.map((p: any) => p.status);
    simulateRollback({ organization_id: 'org-a' });
    const afterPlans = require('../executionSubstrate/rollbackExecutionCoordinator').listRollbackPlans('org-a');
    const afterStatuses = afterPlans.map((p: any) => p.status);
    expect(afterStatuses).toEqual(beforeStatuses);     // no plan status changed
  });

  test('determinism: identical inputs produce identical sandbox hashes (replay-safe)', () => {
    const a1: HypotheticalAction = { action_id: 'fixed', kind: 'lift_broker_isolation', target_namespace: BROKER_NAMESPACES.effectiveness };
    const r1 = submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [a1] });
    const r2 = submitExecutionSandbox({ organization_id: 'org-a', hypothetical_actions: [a1] });
    if (!r1.permitted || !r2.permitted) return;
    expect(r1.sandbox.determinism.projected_state_hash).toBe(r2.sandbox.determinism.projected_state_hash);
  });

  test('Phase 22 propagation walk surface unchanged after Phase 25 install', async () => {
    const prop = await import('../topology/runtimePropagationTopology');
    expect(typeof prop.buildPropagationAttribution).toBe('function');
  });
});
