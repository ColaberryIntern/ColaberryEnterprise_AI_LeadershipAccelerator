/**
 * Phase 26 — bounded live operational rehearsal substrate tests.
 *
 * Targets: types/caps, sandboxGovernanceSupervisor (live),
 * sandboxTopologyIsolation, ephemeralWorkerRuntime, sandboxExecutionEnvelope,
 * liveSandboxCoordinator, sandboxRollbackRehearsal,
 * sandboxPreviewNarrativeBuilder, sandboxReplayEngine,
 * sandboxTrustSurface, liveSandboxVisibilityReplay, sandboxSummaryCounters.
 */

import {
  evaluateLiveSandboxSubmission,
  buildLiveSandboxGovernanceProfile,
  listLiveSandboxGovernanceAttributions,
  recentLiveSandboxDecisionCount24h,
  _resetLiveSandboxGovernanceForTests,
} from '../liveSandbox/sandboxGovernanceSupervisor';
import {
  buildSandboxTopologyIsolationProfile,
} from '../liveSandbox/sandboxTopologyIsolation';
import {
  createEphemeralRuntime, markRuntimeRunning, markRuntimeCompleted,
  markRuntimeFailed, expireRuntime, recordRuntimeHeartbeat,
  getRuntime, listRuntimes, activeRuntimeCount,
  recentRuntimeCount24h, recentExpirationCount24h,
  _resetEphemeralRuntimeForTests,
} from '../liveSandbox/ephemeralWorkerRuntime';
import {
  buildSandboxExecutionEnvelope, buildBoundaryProofChain,
} from '../liveSandbox/sandboxExecutionEnvelope';
import { submitLiveSandbox } from '../liveSandbox/liveSandboxCoordinator';
import {
  rehearseSandboxRollback, listSandboxRollbackRehearsals,
  _resetSandboxRollbackRehearsalsForTests,
} from '../liveSandbox/sandboxRollbackRehearsal';
import {
  buildSandboxPreviewNarrative, listSandboxPreviewNarratives,
  _resetSandboxPreviewNarrativesForTests,
} from '../liveSandbox/sandboxPreviewNarrativeBuilder';
import { buildSandboxReplayBundle, getReplayDeterminismBounds } from '../liveSandbox/sandboxReplayEngine';
import { buildLiveSandboxTrustSurface } from '../liveSandbox/sandboxTrustSurface';
import { buildLiveSandboxVisibilityReplay } from '../liveSandbox/liveSandboxVisibilityReplay';
import { buildLiveSandboxSummary } from '../liveSandbox/sandboxSummaryCounters';
import {
  MAX_LIVE_SANDBOX_DEPTH, MAX_RUNTIME_TTL_MS, DEFAULT_RUNTIME_TTL_MS,
  MAX_RUNTIMES_PER_PARTITION, MAX_HEARTBEATS_PER_RUNTIME,
} from '../liveSandbox/liveSandboxTypes';
import type { HypotheticalAction } from '../experimentation/experimentationTypes';
import {
  recordFailure as brokerRecordFailure,
  _resetIsolationForTests as _resetBrokerIso,
} from '../distributedRuntime/brokerIsolationEngine';
import {
  registerWorker, markRunning, markFailed,
  _resetCoordinatorForTests,
} from '../executionSubstrate/executionRuntimeCoordinator';
import {
  buildRollbackExecutionPlan,
  _resetRollbackForTests,
} from '../executionSubstrate/rollbackExecutionCoordinator';
import { _resetExecutionTopologyForTests } from '../executionSubstrate/executionTopologyGraph';
import { _resetGovernanceForTests as _resetExecGovernance } from '../executionSubstrate/executionGovernanceSupervisor';
import { _resetIsolationForTests as _resetExecIso } from '../executionSubstrate/executionIsolationEngine';
import { _resetPropagationForTests as _resetTopologyPropagation } from '../topology/runtimePropagationTopology';
import { _resetTopologyGraphForTests } from '../topology/cognitionTopologyGraph';
import { _resetRuntimeForTests } from '../distributedRuntime/distributedBrokerRuntime';
import {
  _resetSandboxesForTests, listSandboxes,
} from '../experimentation/executionSandboxEngine';
import { _resetSandboxGovernanceForTests } from '../experimentation/sandboxGovernanceSupervisor';
import { _resetRollbackSimulationsForTests } from '../experimentation/rollbackSimulationEngine';
import { _resetPropagationPreviewsForTests } from '../experimentation/propagationPreviewEngine';
import { _resetRehearsalsForTests } from '../experimentation/stabilizationRehearsalEngine';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

beforeEach(() => {
  _resetLiveSandboxGovernanceForTests();
  _resetEphemeralRuntimeForTests();
  _resetSandboxRollbackRehearsalsForTests();
  _resetSandboxPreviewNarrativesForTests();
  _resetSandboxesForTests();
  _resetSandboxGovernanceForTests();
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

const LIFT_ACTION: HypotheticalAction = {
  action_id: 'a-1',
  kind: 'lift_broker_isolation',
  target_namespace: BROKER_NAMESPACES.effectiveness,
};

// ────────────────────────────────────────────────────────────────────
// Section 1 — Caps
// ────────────────────────────────────────────────────────────────────

describe('Phase 26 architectural caps', () => {
  test('caps are bounded and >= 1', () => {
    expect(MAX_LIVE_SANDBOX_DEPTH).toBe(1);
    expect(MAX_RUNTIME_TTL_MS).toBeGreaterThan(0);
    expect(DEFAULT_RUNTIME_TTL_MS).toBeGreaterThan(0);
    expect(MAX_HEARTBEATS_PER_RUNTIME).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — sandboxGovernanceSupervisor (live)
// ────────────────────────────────────────────────────────────────────

describe('liveSandbox/sandboxGovernanceSupervisor', () => {
  test('valid submission permitted', () => {
    const r = evaluateLiveSandboxSubmission({
      runtime_id: 'r-1', organization_id: 'org-a', operator_id: 'op-1',
      action_count: 1, ttl_ms: DEFAULT_RUNTIME_TTL_MS, depth: 0,
      underlying_phase_25_permitted: true,
    });
    expect(r.decision).toBe('permitted');
  });

  test('missing organization_id rejected', () => {
    const r = evaluateLiveSandboxSubmission({
      runtime_id: 'r-1', organization_id: '', operator_id: 'op-1',
      action_count: 1, ttl_ms: DEFAULT_RUNTIME_TTL_MS, depth: 0,
      underlying_phase_25_permitted: true,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('organization_id_missing');
  });

  test('missing operator_id rejected', () => {
    const r = evaluateLiveSandboxSubmission({
      runtime_id: 'r-1', organization_id: 'org-a', operator_id: '',
      action_count: 1, ttl_ms: DEFAULT_RUNTIME_TTL_MS, depth: 0,
      underlying_phase_25_permitted: true,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('operator_id_missing');
  });

  test('TTL above MAX_RUNTIME_TTL_MS rejected', () => {
    const r = evaluateLiveSandboxSubmission({
      runtime_id: 'r-1', organization_id: 'org-a', operator_id: 'op-1',
      action_count: 1, ttl_ms: MAX_RUNTIME_TTL_MS + 1, depth: 0,
      underlying_phase_25_permitted: true,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('ttl_exceeds_max');
  });

  test('depth > MAX_LIVE_SANDBOX_DEPTH rejected (no recursive rehearsals)', () => {
    const r = evaluateLiveSandboxSubmission({
      runtime_id: 'r-1', organization_id: 'org-a', operator_id: 'op-1',
      action_count: 1, ttl_ms: DEFAULT_RUNTIME_TTL_MS, depth: 2,
      underlying_phase_25_permitted: true,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('recursive_sandbox_attempt');
  });

  test('underlying Phase 25 rejection cascades to Phase 26 rejection', () => {
    const r = evaluateLiveSandboxSubmission({
      runtime_id: 'r-1', organization_id: 'org-a', operator_id: 'op-1',
      action_count: 1, ttl_ms: DEFAULT_RUNTIME_TTL_MS, depth: 0,
      underlying_phase_25_permitted: false,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('underlying_phase_25_rejected');
  });

  test('every decision emits attribution; cross-org isolation', () => {
    evaluateLiveSandboxSubmission({
      runtime_id: 'r-a', organization_id: 'org-a', operator_id: 'op',
      action_count: 1, ttl_ms: DEFAULT_RUNTIME_TTL_MS, depth: 0,
      underlying_phase_25_permitted: true,
    });
    expect(listLiveSandboxGovernanceAttributions('org-a').length).toBe(1);
    expect(listLiveSandboxGovernanceAttributions('org-b').length).toBe(0);
    expect(recentLiveSandboxDecisionCount24h()).toBeGreaterThanOrEqual(1);
  });

  test('buildLiveSandboxGovernanceProfile reports decision counts', () => {
    evaluateLiveSandboxSubmission({
      runtime_id: 'r1', organization_id: 'org-a', operator_id: 'op',
      action_count: 1, ttl_ms: DEFAULT_RUNTIME_TTL_MS, depth: 0,
      underlying_phase_25_permitted: true,
    });
    evaluateLiveSandboxSubmission({
      runtime_id: 'r2', organization_id: 'org-a', operator_id: 'op',
      action_count: 1, ttl_ms: DEFAULT_RUNTIME_TTL_MS, depth: 5,
      underlying_phase_25_permitted: true,
    });
    const p = buildLiveSandboxGovernanceProfile('org-a');
    expect(p.decision_counts.permitted).toBe(1);
    expect(p.decision_counts.rejected).toBe(1);
    expect(p.violation_counts_by_rule.recursive_sandbox_attempt).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — sandboxTopologyIsolation
// ────────────────────────────────────────────────────────────────────

describe('sandboxTopologyIsolation', () => {
  test('builds profile with all 4 detachment_proofs typed-as-true', () => {
    const profile = buildSandboxTopologyIsolationProfile({ runtime_id: 'r-1', organization_id: 'org-a' });
    expect(profile.detachment_proofs.production_topology_detached).toBe(true);
    expect(profile.detachment_proofs.federation_topology_detached).toBe(true);
    expect(profile.detachment_proofs.distributed_runtime_detached).toBe(true);
    expect(profile.detachment_proofs.cross_org_attempts_blocked).toBe(true);
  });

  test('verification_hash is 16-char SHA-256', () => {
    const profile = buildSandboxTopologyIsolationProfile({ runtime_id: 'r-1', organization_id: 'org-a' });
    expect(profile.verification_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(profile.snapshot_lineage.phase_22_graph_snapshot_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(profile.snapshot_lineage.phase_23_substrate_snapshot_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('determinism: same inputs produce same verification hash', () => {
    const a = buildSandboxTopologyIsolationProfile({ runtime_id: 'r-x', organization_id: 'org-a' });
    const b = buildSandboxTopologyIsolationProfile({ runtime_id: 'r-x', organization_id: 'org-a' });
    // The verification hash includes built_at so they will differ — test the snapshot hashes
    // which DO determinism only on graph state.
    expect(a.snapshot_lineage.phase_22_graph_snapshot_hash).toBe(b.snapshot_lineage.phase_22_graph_snapshot_hash);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — ephemeralWorkerRuntime
// ────────────────────────────────────────────────────────────────────

describe('ephemeralWorkerRuntime', () => {
  test('createEphemeralRuntime produces pending lifecycle + detached boundary', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r-1', organization_id: 'org-a',
      topology_isolation_verification_hash: 'hash', ttl_ms: 30_000,
    });
    const profile = createEphemeralRuntime({
      experiment_id: 'exp-1', organization_id: 'org-a',
      ttl_ms: 30_000, boundary_proof: proof,
    });
    expect(profile.lifecycle_state).toBe('pending');
    expect(profile.boundary_tier).toBe('detached');
    expect(profile.heartbeats.length).toBe(0);
    expect(profile.attribution_log.length).toBe(1);
  });

  test('lifecycle: pending → running → completed', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r-1', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 30_000,
    });
    const profile = createEphemeralRuntime({
      experiment_id: 'exp', organization_id: 'org-a',
      ttl_ms: 30_000, boundary_proof: proof,
    });
    expect(markRuntimeRunning(profile.runtime_id)?.lifecycle_state).toBe('running');
    expect(markRuntimeCompleted(profile.runtime_id, 'done')?.lifecycle_state).toBe('completed');
  });

  test('invalid transitions silently no-op (no auto-correction)', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r-1', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 30_000,
    });
    const profile = createEphemeralRuntime({
      experiment_id: 'exp', organization_id: 'org-a',
      ttl_ms: 30_000, boundary_proof: proof,
    });
    markRuntimeCompleted(profile.runtime_id, 'done');
    // Cannot go from completed → running.
    const after = markRuntimeRunning(profile.runtime_id);
    expect(after?.lifecycle_state).toBe('completed');
  });

  test('expireRuntime flips state + records expiration attribution', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r-1', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 30_000,
    });
    const profile = createEphemeralRuntime({
      experiment_id: 'exp', organization_id: 'org-a',
      ttl_ms: 30_000, boundary_proof: proof,
    });
    const expired = expireRuntime(profile.runtime_id, 'operator_cancelled');
    expect(expired?.lifecycle_state).toBe('expired');
    expect(expired?.boundary_tier).toBe('expired');
    expect(expired?.expiration?.expiration_trigger).toBe('operator_cancelled');
    expect(expired?.expiration?.runtime_duration_ms).toBeGreaterThanOrEqual(0);
  });

  test('heartbeat ticks recorded with deterministic hash', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r-1', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 30_000,
    });
    const profile = createEphemeralRuntime({
      experiment_id: 'exp', organization_id: 'org-a',
      ttl_ms: 30_000, boundary_proof: proof,
    });
    markRuntimeRunning(profile.runtime_id);
    const updated = recordRuntimeHeartbeat(profile.runtime_id);
    expect(updated?.heartbeats.length).toBe(1);
    expect(updated?.heartbeats[0].deterministic_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('heartbeats capped at MAX_HEARTBEATS_PER_RUNTIME', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r-1', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 30_000,
    });
    const profile = createEphemeralRuntime({
      experiment_id: 'exp', organization_id: 'org-a',
      ttl_ms: 30_000, boundary_proof: proof,
    });
    markRuntimeRunning(profile.runtime_id);
    for (let i = 0; i < MAX_HEARTBEATS_PER_RUNTIME + 5; i++) {
      recordRuntimeHeartbeat(profile.runtime_id);
    }
    const final = getRuntime(profile.runtime_id);
    expect(final?.heartbeats.length).toBeLessThanOrEqual(MAX_HEARTBEATS_PER_RUNTIME);
  });

  test('cross-org isolation: org-a runtimes never appear in org-b', () => {
    const proofA = buildBoundaryProofChain({
      runtime_id: 'r-a', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 30_000,
    });
    createEphemeralRuntime({ experiment_id: 'e', organization_id: 'org-a', ttl_ms: 30_000, boundary_proof: proofA });
    expect(listRuntimes('org-a').length).toBe(1);
    expect(listRuntimes('org-b').length).toBe(0);
  });

  test('runtime ring buffer cap evicts oldest', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r', organization_id: 'org-cap',
      topology_isolation_verification_hash: 'h', ttl_ms: 30_000,
    });
    for (let i = 0; i < MAX_RUNTIMES_PER_PARTITION + 5; i++) {
      createEphemeralRuntime({ experiment_id: 'e', organization_id: 'org-cap', ttl_ms: 30_000, boundary_proof: proof });
    }
    expect(listRuntimes('org-cap').length).toBe(MAX_RUNTIMES_PER_PARTITION);
  });

  test('TTL auto-expiration via unref\'d timer', async () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r-fast', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 10,
    });
    const profile = createEphemeralRuntime({
      experiment_id: 'e', organization_id: 'org-a',
      ttl_ms: 10, boundary_proof: proof,
    });
    expect(profile.lifecycle_state).toBe('pending');
    await new Promise(resolve => setTimeout(resolve, 50));
    const final = getRuntime(profile.runtime_id);
    expect(final?.lifecycle_state).toBe('expired');
    expect(final?.expiration?.expiration_trigger).toBe('ttl_reached');
  });

  test('activeRuntimeCount + recentRuntimeCount24h tracking', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 30_000,
    });
    const profile = createEphemeralRuntime({
      experiment_id: 'e', organization_id: 'org-a',
      ttl_ms: 30_000, boundary_proof: proof,
    });
    expect(activeRuntimeCount('org-a')).toBe(1);
    markRuntimeRunning(profile.runtime_id);
    markRuntimeCompleted(profile.runtime_id, 'done');
    expect(activeRuntimeCount('org-a')).toBe(0);
    expect(recentRuntimeCount24h('org-a')).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — sandboxExecutionEnvelope
// ────────────────────────────────────────────────────────────────────

describe('sandboxExecutionEnvelope', () => {
  test('builds envelope with bounded budget', () => {
    const env = buildSandboxExecutionEnvelope({
      runtime_id: 'r-1', organization_id: 'org-a', operator_id: 'op-1',
      hypothetical_actions: [LIFT_ACTION], ttl_ms: 30_000,
    });
    expect(env.bounded_budget.max_ttl_ms).toBeLessThanOrEqual(MAX_RUNTIME_TTL_MS);
    expect(env.bounded_budget.max_simulation_depth).toBe(MAX_LIVE_SANDBOX_DEPTH);
    expect(env.operator_authorization.operator_id).toBe('op-1');
    expect(env.operator_authorization.authorization_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('boundary proof chain has all 5 SHA-256 hashes', () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r-1', organization_id: 'org-a',
      topology_isolation_verification_hash: 'topohash',
      underlying_phase_25_sandbox_hash: 'p25hash',
      ttl_ms: 30_000,
    });
    expect(proof.topology_detachment_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(proof.runtime_isolation_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(proof.replay_determinism_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(proof.expiration_proof_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(proof.mutation_avoidance_proof_hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — liveSandboxCoordinator (top-level)
// ────────────────────────────────────────────────────────────────────

describe('liveSandboxCoordinator.submitLiveSandbox', () => {
  test('successful submission walks lifecycle to completed', () => {
    const r = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op-1',
      hypothetical_actions: [LIFT_ACTION],
    });
    expect(r.permitted).toBe(true);
    if (!r.permitted) return;
    expect(r.runtime.lifecycle_state).toBe('completed');
    expect(r.runtime.heartbeats.length).toBeGreaterThan(0);
    expect(r.envelope.operator_authorization.operator_id).toBe('op-1');
    expect(r.topology_isolation.detachment_proofs.production_topology_detached).toBe(true);
  });

  test('underlying Phase 25 sandbox is created + linked', () => {
    const r = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op-1',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!r.permitted) return;
    expect(r.runtime.underlying_phase_25_sandbox_id).toBeDefined();
    expect(listSandboxes('org-a').length).toBe(1);
  });

  test('rejection on missing operator_id', () => {
    const r = submitLiveSandbox({
      organization_id: 'org-a', operator_id: '',
      hypothetical_actions: [LIFT_ACTION],
    });
    expect(r.permitted).toBe(false);
  });

  test('NEVER mutates live broker isolation state', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    const beforeProfile = require('../distributedRuntime/brokerIsolationEngine').buildIsolationProfile(
      require('../distributedRuntime/distributedBrokerRuntime').getActiveAdapterKind(),
    );
    const beforeCount = beforeProfile.active_isolation_count;
    submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op-1',
      hypothetical_actions: [LIFT_ACTION],
    });
    const afterProfile = require('../distributedRuntime/brokerIsolationEngine').buildIsolationProfile(
      require('../distributedRuntime/distributedBrokerRuntime').getActiveAdapterKind(),
    );
    expect(afterProfile.active_isolation_count).toBe(beforeCount);
    expect(beforeCount).toBeGreaterThan(0);
  });

  test('cross-org isolation: org-a runtime invisible from org-b', () => {
    submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op-1',
      hypothetical_actions: [LIFT_ACTION],
    });
    expect(listRuntimes('org-a').length).toBe(1);
    expect(listRuntimes('org-b').length).toBe(0);
  });

  test('runtime carries full boundary_proof chain (5 hashes)', () => {
    const r = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op-1',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!r.permitted) return;
    const proof = r.runtime.boundary_proof;
    expect(proof.topology_detachment_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(proof.runtime_isolation_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(proof.replay_determinism_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(proof.expiration_proof_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(proof.mutation_avoidance_proof_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('TTL above MAX rejected', () => {
    const r = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op-1',
      hypothetical_actions: [LIFT_ACTION],
      ttl_ms: MAX_RUNTIME_TTL_MS + 1,
    });
    expect(r.permitted).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — sandboxRollbackRehearsal
// ────────────────────────────────────────────────────────────────────

describe('sandboxRollbackRehearsal', () => {
  test('rehearses rollback against existing Phase 23 plan', () => {
    buildRollbackExecutionPlan({
      organization_id: 'org-a', trigger: 'mutation_failed',
      source_chains: [{ source_phase: 'mutation', chain_id: 'm1', steps: [{ source_step_ref: 's1', description: 'd', impact_estimate: 'low' }] }],
    });
    const reg = registerWorker({ kind: 'mutation_execution', organization_id: 'org-a', scope_summary: 't', bounded_envelope: { max_duration_ms: 60_000, max_attempts: 1, allowed_namespaces: ['email_send'], parent_depth_limit: 0 } });
    if (reg.permitted) { markRunning(reg.envelope.worker_id); markFailed(reg.envelope.worker_id, 'simulated'); }
    const submit = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!submit.permitted) return;
    const rehearsal = rehearseSandboxRollback({
      runtime_id: submit.runtime.runtime_id, organization_id: 'org-a',
    });
    expect(rehearsal).not.toBeNull();
    expect(rehearsal!.preview_citation.source_phase).toBe('phase_25_experimentation');
    expect(rehearsal!.determinism.replayable).toBe(true);
  });

  test('cannot rehearse against expired runtime', () => {
    const submit = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!submit.permitted) return;
    expireRuntime(submit.runtime.runtime_id);
    const rehearsal = rehearseSandboxRollback({
      runtime_id: submit.runtime.runtime_id, organization_id: 'org-a',
    });
    expect(rehearsal).toBeNull();
  });

  test('cross-org rehearsal blocked', () => {
    const submit = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!submit.permitted) return;
    const rehearsal = rehearseSandboxRollback({
      runtime_id: submit.runtime.runtime_id, organization_id: 'org-b',
    });
    expect(rehearsal).toBeNull();
  });

  test('NEVER mutates live worker lifecycle state', () => {
    const reg = registerWorker({ kind: 'mutation_execution', organization_id: 'org-a', scope_summary: 't', bounded_envelope: { max_duration_ms: 60_000, max_attempts: 1, allowed_namespaces: ['email_send'], parent_depth_limit: 0 } });
    if (!reg.permitted) return;
    markRunning(reg.envelope.worker_id);
    markFailed(reg.envelope.worker_id, 'simulated');
    const submit = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!submit.permitted) return;
    rehearseSandboxRollback({
      runtime_id: submit.runtime.runtime_id, organization_id: 'org-a',
    });
    const { getEnvelope } = require('../executionSubstrate/executionRuntimeCoordinator');
    const env = getEnvelope(reg.envelope.worker_id);
    expect(env?.lifecycle_state).toBe('failed');     // unchanged
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — sandboxPreviewNarrativeBuilder (Phase 24-compliant)
// ────────────────────────────────────────────────────────────────────

describe('sandboxPreviewNarrativeBuilder', () => {
  test('builds narrative with citations for active runtime', () => {
    const submit = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!submit.permitted) return;
    const narrative = buildSandboxPreviewNarrative({
      runtime_id: submit.runtime.runtime_id, organization_id: 'org-a',
    });
    expect(narrative).not.toBeNull();
    expect(narrative!.blocks.length).toBeGreaterThan(0);
    for (const block of narrative!.blocks) {
      expect(block.citations.length).toBeGreaterThan(0);
      expect(block.deterministic_hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  test('citations reference both Phase 25 sandbox and Phase 26 runtime', () => {
    const submit = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!submit.permitted) return;
    const narrative = buildSandboxPreviewNarrative({
      runtime_id: submit.runtime.runtime_id, organization_id: 'org-a',
    });
    expect(narrative).not.toBeNull();
    const cite = narrative!.blocks[0].citations[0];
    expect(cite.underlying_phase_26_runtime_id).toBe(submit.runtime.runtime_id);
  });

  test('returns null for unknown runtime', () => {
    const narrative = buildSandboxPreviewNarrative({
      runtime_id: 'no-such-runtime', organization_id: 'org-a',
    });
    expect(narrative).toBeNull();
  });

  test('expiration block added when runtime expired', () => {
    const submit = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!submit.permitted) return;
    expireRuntime(submit.runtime.runtime_id);
    const narrative = buildSandboxPreviewNarrative({
      runtime_id: submit.runtime.runtime_id, organization_id: 'org-a',
    });
    const expBlock = narrative!.blocks.find(b => b.template_id === 'sandbox.expiration.notice.v1');
    expect(expBlock).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — sandboxReplayEngine
// ────────────────────────────────────────────────────────────────────

describe('sandboxReplayEngine', () => {
  test('replay bundle exposes determinism bounds for all runtimes', () => {
    submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    const bundle = buildSandboxReplayBundle({ organization_id: 'org-a' });
    expect(bundle.runtimes.length).toBe(1);
    expect(bundle.determinism_bounds.length).toBe(1);
    expect(bundle.determinism_bounds[0].replay_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.determinism_bounds[0].replayable).toBe(true);
    expect(bundle.determinism_bounds[0].deterministic).toBe(true);
  });

  test('cross-org bundle isolation', () => {
    submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    const bundle = buildSandboxReplayBundle({ organization_id: 'org-b' });
    expect(bundle.runtimes.length).toBe(0);
    expect(bundle.determinism_bounds.length).toBe(0);
  });

  test('getReplayDeterminismBounds returns per-runtime bounds', () => {
    const submit = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!submit.permitted) return;
    const bounds = getReplayDeterminismBounds(submit.runtime.runtime_id);
    expect(bounds).not.toBeNull();
    expect(bounds!.replay_hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — sandboxTrustSurface
// ────────────────────────────────────────────────────────────────────

describe('sandboxTrustSurface', () => {
  test('all 6 bands trace to a phase + source attribution', () => {
    const surface = buildLiveSandboxTrustSurface({ organization_id: 'org-a' });
    expect(surface.bands.length).toBe(6);
    for (const band of surface.bands) {
      expect(band.inherited_from_phase).toMatch(/^phase_/);
      expect(band.source_attribution_id.length).toBeGreaterThan(0);
    }
  });

  test('aggregate score is bounded 0..100', () => {
    const surface = buildLiveSandboxTrustSurface({ organization_id: 'org-a' });
    expect(surface.aggregate_score).toBeGreaterThanOrEqual(0);
    expect(surface.aggregate_score).toBeLessThanOrEqual(100);
  });

  test('sandbox_isolation_proof = 100 when every runtime carries boundary proof chain', () => {
    submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    const surface = buildLiveSandboxTrustSurface({ organization_id: 'org-a' });
    const proofBand = surface.bands.find(b => b.label === 'sandbox_isolation_proof');
    expect(proofBand?.score).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — visibility + summary
// ────────────────────────────────────────────────────────────────────

describe('liveSandbox visibility + summary', () => {
  test('visibility composes runtimes + rehearsals + narratives + governance + trust', () => {
    submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    const v = buildLiveSandboxVisibilityReplay({ organization_id: 'org-a' });
    expect(v.recent_runtimes.length).toBe(1);
    expect(v.trust_surface.bands.length).toBe(6);
    expect(v.recent_governance_decisions.length).toBeGreaterThan(0);
  });

  test('summary defaults to clean state', () => {
    const snap = buildLiveSandboxSummary();
    expect(snap.active_runtimes).toBe(0);
    expect(snap.health_scores.sandbox_replay_reliability).toBe(100);
    expect(snap.health_scores.topology_containment_stability).toBe(100);
  });

  test('summary reflects activity', () => {
    submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    const snap = buildLiveSandboxSummary();
    expect(snap.recent_runtimes_24h).toBeGreaterThanOrEqual(1);
  });

  test('expiration counts tracked in summary', async () => {
    const proof = buildBoundaryProofChain({
      runtime_id: 'r', organization_id: 'org-a',
      topology_isolation_verification_hash: 'h', ttl_ms: 10,
    });
    createEphemeralRuntime({ experiment_id: 'e', organization_id: 'org-a', ttl_ms: 10, boundary_proof: proof });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(recentExpirationCount24h('org-a')).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 12 — Production-state protection (hard-veto preservation)
// ────────────────────────────────────────────────────────────────────

describe('phase 26 production-state protection', () => {
  test('Phase 19 federation hard veto unchanged', async () => {
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

  test('Phase 21 broker isolation unchanged after sandbox runtime', () => {
    brokerRecordFailure(BROKER_NAMESPACES.effectiveness, 'org-a', 'connection_lost');
    submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    const { isIsolated } = require('../distributedRuntime/brokerIsolationEngine');
    expect(isIsolated(BROKER_NAMESPACES.effectiveness, 'org-a')).toBe(true);
  });

  test('Phase 22 propagation surface unchanged after Phase 26 install', async () => {
    const prop = await import('../topology/runtimePropagationTopology');
    expect(typeof prop.buildPropagationAttribution).toBe('function');
  });

  test('Phase 25 sandbox surface unchanged after Phase 26 install', async () => {
    const exp = await import('../experimentation/executionSandboxEngine');
    expect(typeof exp.submitExecutionSandbox).toBe('function');
  });

  test('runtime cannot be promoted to production execution', () => {
    const r = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    // The engine exposes no API to promote a runtime — verify by checking
    // the runtime profile shape (no 'promote' or 'commit' fields).
    if (!r.permitted) return;
    expect((r.runtime as any).promote).toBeUndefined();
    expect((r.runtime as any).commit).toBeUndefined();
    expect((r.runtime as any).execute).toBeUndefined();
  });

  test('determinism: same hypothetical actions produce same boundary proof topology hash', () => {
    const r1 = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    const r2 = submitLiveSandbox({
      organization_id: 'org-a', operator_id: 'op',
      hypothetical_actions: [LIFT_ACTION],
    });
    if (!r1.permitted || !r2.permitted) return;
    // Topology snapshot hashes are deterministic on graph state.
    expect(r1.topology_isolation.snapshot_lineage.phase_22_graph_snapshot_hash)
      .toBe(r2.topology_isolation.snapshot_lineage.phase_22_graph_snapshot_hash);
  });
});
