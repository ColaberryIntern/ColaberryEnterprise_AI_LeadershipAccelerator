/**
 * Phase 23 — bounded operational execution substrate tests.
 *
 * Targets the 9 executionSubstrate/ modules: types/caps,
 * executionGovernanceSupervisor, executionIsolationEngine,
 * executionRuntimeCoordinator, boundedExecutionWorker,
 * executionTopologyGraph, executionContinuityTracker,
 * executionReplayEngine, rollbackExecutionCoordinator,
 * executionVisibilityReplay, executionSummaryCounters.
 */

import {
  evaluateRegistration, evaluateEnvelopeBreach, buildGovernanceProfile,
  listAttributionsForOrg, recentDecisionCount24h,
  _resetGovernanceForTests,
} from '../executionSubstrate/executionGovernanceSupervisor';
import {
  recordSuccess, recordFailure, isIsolated, liftIsolation, quarantine,
  buildIsolationProfile, _resetIsolationForTests,
} from '../executionSubstrate/executionIsolationEngine';
import {
  registerWorker, markRunning, markCompleted, markFailed, markInterrupted,
  markRolledBack, recordHeartbeat, sweepStalledWorkers,
  flipRunningToInterruptedOnBoot, getEnvelope, listEnvelopes,
  listEnvelopesByState, activeWorkerCount, recentLifecycleCount24h,
  _resetCoordinatorForTests,
} from '../executionSubstrate/executionRuntimeCoordinator';
import { runBoundedWorker } from '../executionSubstrate/boundedExecutionWorker';
import {
  recordExecutionDependencyEdge, listEdges as listExecEdges,
  buildExecutionTopologyProfile, _resetExecutionTopologyForTests,
  _STATIC_EXECUTION_EDGE_COUNT_FOR_TESTS,
} from '../executionSubstrate/executionTopologyGraph';
import { buildExecutionContinuityReplay } from '../executionSubstrate/executionContinuityTracker';
import { replayExecutionEnvelopes } from '../executionSubstrate/executionReplayEngine';
import {
  buildRollbackExecutionPlan, recordRollbackContinuity,
  listRollbackPlans, listRollbackContinuityBounds,
  _resetRollbackForTests,
} from '../executionSubstrate/rollbackExecutionCoordinator';
import { buildExecutionVisibilityReplay } from '../executionSubstrate/executionVisibilityReplay';
import { buildExecutionSubstrateSummary } from '../executionSubstrate/executionSummaryCounters';
import {
  MAX_PARENT_DEPTH, MAX_DURATION_MS_CAP, MAX_ATTEMPTS_CAP,
  HEARTBEAT_TIMEOUT_MS, ISOLATION_FAILURE_THRESHOLD,
  MAX_WORKER_ENVELOPES_PER_PARTITION,
} from '../executionSubstrate/executionSubstrateTypes';

beforeEach(() => {
  _resetGovernanceForTests();
  _resetIsolationForTests();
  _resetCoordinatorForTests();
  _resetExecutionTopologyForTests();
  _resetRollbackForTests();
});

const ENV = {
  max_duration_ms: 60_000,
  max_attempts: 1,
  allowed_namespaces: ['email_send'],
  parent_depth_limit: 0,
};

// ────────────────────────────────────────────────────────────────────
// Section 1 — Caps
// ────────────────────────────────────────────────────────────────────

describe('Phase 23 architectural caps', () => {
  test('caps are bounded and >= 1', () => {
    expect(MAX_PARENT_DEPTH).toBeGreaterThan(0);
    expect(MAX_DURATION_MS_CAP).toBeGreaterThan(0);
    expect(MAX_ATTEMPTS_CAP).toBeGreaterThan(0);
    expect(HEARTBEAT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(ISOLATION_FAILURE_THRESHOLD).toBeGreaterThan(0);
    expect(_STATIC_EXECUTION_EDGE_COUNT_FOR_TESTS).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — executionGovernanceSupervisor (HARD GATE)
// ────────────────────────────────────────────────────────────────────

describe('executionGovernanceSupervisor', () => {
  test('valid envelope is permitted', () => {
    const r = evaluateRegistration({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      bounded_envelope: ENV, parent_depth: 0, is_isolated: false,
    });
    expect(r.decision).toBe('permitted');
    expect(r.supervisor_rule_violated).toBeUndefined();
  });

  test('missing organization_id is rejected', () => {
    const r = evaluateRegistration({
      worker_id: 'w1', kind: 'email_send', organization_id: '',
      bounded_envelope: ENV, parent_depth: 0, is_isolated: false,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('organization_id_missing');
  });

  test('isolated kind returns isolated decision (not rejected)', () => {
    const r = evaluateRegistration({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      bounded_envelope: ENV, parent_depth: 0, is_isolated: true,
    });
    expect(r.decision).toBe('isolated');
    expect(r.supervisor_rule_violated).toBe('kind_isolated');
  });

  test('parent_depth > MAX_PARENT_DEPTH is rejected (no recursive spawning)', () => {
    const r = evaluateRegistration({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      bounded_envelope: ENV, parent_depth: MAX_PARENT_DEPTH + 1, is_isolated: false,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('parent_depth_limit_exceeded');
  });

  test('max_duration_ms above cap is rejected', () => {
    const r = evaluateRegistration({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      bounded_envelope: { ...ENV, max_duration_ms: MAX_DURATION_MS_CAP + 1 },
      parent_depth: 0, is_isolated: false,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('envelope_max_duration_invalid');
  });

  test('max_attempts above cap is rejected', () => {
    const r = evaluateRegistration({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      bounded_envelope: { ...ENV, max_attempts: MAX_ATTEMPTS_CAP + 1 },
      parent_depth: 0, is_isolated: false,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('envelope_max_attempts_invalid');
  });

  test('empty allowed_namespaces is rejected', () => {
    const r = evaluateRegistration({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      bounded_envelope: { ...ENV, allowed_namespaces: [] },
      parent_depth: 0, is_isolated: false,
    });
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('envelope_namespaces_empty');
  });

  test('every decision emits an attribution row', () => {
    evaluateRegistration({ worker_id: 'w1', kind: 'email_send', organization_id: 'org-a', bounded_envelope: ENV, parent_depth: 0, is_isolated: false });
    evaluateRegistration({ worker_id: 'w2', kind: 'email_send', organization_id: 'org-a', bounded_envelope: ENV, parent_depth: 99, is_isolated: false });
    const rows = listAttributionsForOrg('org-a');
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.decision).sort()).toEqual(['permitted', 'rejected']);
  });

  test('cross-org isolation: org-a attributions do not leak to org-b', () => {
    evaluateRegistration({ worker_id: 'w1', kind: 'email_send', organization_id: 'org-a', bounded_envelope: ENV, parent_depth: 0, is_isolated: false });
    expect(listAttributionsForOrg('org-a')).toHaveLength(1);
    expect(listAttributionsForOrg('org-b')).toHaveLength(0);
  });

  test('evaluateEnvelopeBreach returns flagged when duration exceeds max', () => {
    const r = evaluateEnvelopeBreach({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      duration_so_far_ms: 120_000, max_duration_ms: 60_000,
    });
    expect(r).not.toBeNull();
    expect(r!.decision).toBe('flagged');
    expect(r!.supervisor_rule_violated).toBe('envelope_breach_at_runtime');
  });

  test('evaluateEnvelopeBreach returns null when within budget', () => {
    expect(evaluateEnvelopeBreach({
      worker_id: 'w1', kind: 'email_send', organization_id: 'org-a',
      duration_so_far_ms: 30_000, max_duration_ms: 60_000,
    })).toBeNull();
  });

  test('buildGovernanceProfile reports decision counts + violation counts', () => {
    evaluateRegistration({ worker_id: 'w1', kind: 'email_send', organization_id: 'org-a', bounded_envelope: ENV, parent_depth: 0, is_isolated: false });
    evaluateRegistration({ worker_id: 'w2', kind: 'email_send', organization_id: 'org-a', bounded_envelope: ENV, parent_depth: 99, is_isolated: false });
    const profile = buildGovernanceProfile('org-a');
    expect(profile.decision_counts.permitted).toBe(1);
    expect(profile.decision_counts.rejected).toBe(1);
    expect(profile.violation_counts_by_rule.parent_depth_limit_exceeded).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — executionIsolationEngine
// ────────────────────────────────────────────────────────────────────

describe('executionIsolationEngine', () => {
  test('not isolated by default', () => {
    expect(isIsolated('email_send', 'org-a')).toBe(false);
  });

  test('triggers after ISOLATION_FAILURE_THRESHOLD consecutive failures', () => {
    for (let i = 0; i < ISOLATION_FAILURE_THRESHOLD - 1; i++) {
      expect(recordFailure('email_send', 'org-a')).toBe(false);
    }
    expect(recordFailure('email_send', 'org-a')).toBe(true);
    expect(isIsolated('email_send', 'org-a')).toBe(true);
  });

  test('envelope_breach reason isolates immediately', () => {
    expect(recordFailure('email_send', 'org-a', 'envelope_breach')).toBe(true);
    expect(isIsolated('email_send', 'org-a')).toBe(true);
  });

  test('liftIsolation removes isolation', () => {
    recordFailure('email_send', 'org-a', 'envelope_breach');
    expect(liftIsolation('email_send', 'org-a')).toBe(true);
    expect(isIsolated('email_send', 'org-a')).toBe(false);
    expect(liftIsolation('email_send', 'org-a')).toBe(false);
  });

  test('quarantine sets operator_quarantined=true', () => {
    quarantine('email_send', 'org-a');
    const profile = buildIsolationProfile();
    expect(profile.isolated_kinds[0].reason).toBe('operator_quarantine');
    expect(profile.isolated_kinds[0].explanation).toContain('operator-quarantined');
  });

  test('cross-kind isolation: email_send isolated does not affect briefing_send', () => {
    recordFailure('email_send', 'org-a', 'envelope_breach');
    expect(isIsolated('email_send', 'org-a')).toBe(true);
    expect(isIsolated('briefing_send', 'org-a')).toBe(false);
  });

  test('cross-org isolation: email_send@org-a does not affect email_send@org-b', () => {
    recordFailure('email_send', 'org-a', 'envelope_breach');
    expect(isIsolated('email_send', 'org-a')).toBe(true);
    expect(isIsolated('email_send', 'org-b')).toBe(false);
  });

  test('recordSuccess clears the failure window', () => {
    for (let i = 0; i < ISOLATION_FAILURE_THRESHOLD - 1; i++) recordFailure('email_send', 'org-a');
    recordSuccess('email_send', 'org-a');
    // After a success, the next failure starts a fresh window — should not isolate.
    expect(recordFailure('email_send', 'org-a')).toBe(false);
    expect(isIsolated('email_send', 'org-a')).toBe(false);
  });

  test('buildIsolationProfile reports active isolations + 24h count', () => {
    recordFailure('email_send', 'org-a', 'envelope_breach');
    recordFailure('briefing_send', 'org-b', 'envelope_breach');
    const profile = buildIsolationProfile();
    expect(profile.active_isolation_count).toBe(2);
    expect(profile.total_isolation_events_24h).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — executionRuntimeCoordinator
// ────────────────────────────────────────────────────────────────────

describe('executionRuntimeCoordinator', () => {
  test('registerWorker returns permitted+envelope for valid input', () => {
    const r = registerWorker({
      kind: 'email_send', organization_id: 'org-a',
      scope_summary: 'test', bounded_envelope: ENV,
    });
    expect(r.permitted).toBe(true);
    if (r.permitted) {
      expect(r.envelope.lifecycle_state).toBe('pending');
      expect(r.envelope.parent_depth).toBe(0);
    }
  });

  test('registerWorker rejects invalid envelope', () => {
    const r = registerWorker({
      kind: 'email_send', organization_id: 'org-a',
      scope_summary: 'test',
      bounded_envelope: { ...ENV, max_duration_ms: 0 },
    });
    expect(r.permitted).toBe(false);
    if (!r.permitted) expect(r.decision).toBe('rejected');
  });

  test('registerWorker rejects when kind isolated', () => {
    recordFailure('email_send', 'org-a', 'envelope_breach');
    const r = registerWorker({
      kind: 'email_send', organization_id: 'org-a',
      scope_summary: 'test', bounded_envelope: ENV,
    });
    expect(r.permitted).toBe(false);
    if (!r.permitted) expect(r.decision).toBe('isolated');
  });

  test('lifecycle: pending → running → completed', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    expect(r.permitted).toBe(true);
    if (!r.permitted) return;
    const wid = r.envelope.worker_id;
    expect(markRunning(wid)?.lifecycle_state).toBe('running');
    expect(markCompleted(wid, 'done')?.lifecycle_state).toBe('completed');
    const env = getEnvelope(wid);
    expect(env?.lifecycle_state).toBe('completed');
    expect(env?.completed_at).toBeDefined();
  });

  test('invalid lifecycle transitions are silently ignored (no auto-correction)', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    const wid = r.envelope.worker_id;
    markCompleted(wid, 'done');
    // Cannot go from completed → running.
    const after = markRunning(wid);
    expect(after?.lifecycle_state).toBe('completed');
  });

  test('markFailed records isolation failure', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    markFailed(r.envelope.worker_id, 'boom');
    // 1 failure does not yet isolate, but the envelope state is updated.
    expect(getEnvelope(r.envelope.worker_id)?.lifecycle_state).toBe('failed');
  });

  test('5 failures in a row isolate the kind', () => {
    for (let i = 0; i < ISOLATION_FAILURE_THRESHOLD; i++) {
      const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
      if (!r.permitted) continue;
      markRunning(r.envelope.worker_id);
      markFailed(r.envelope.worker_id, 'fail');
    }
    expect(isIsolated('email_send', 'org-a')).toBe(true);
  });

  test('flipRunningToInterruptedOnBoot flips pending and running envelopes', () => {
    const r1 = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    const r2 = registerWorker({ kind: 'briefing_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r1.permitted || !r2.permitted) return;
    markRunning(r1.envelope.worker_id);  // r2 stays pending
    const flipped = flipRunningToInterruptedOnBoot();
    expect(flipped.length).toBe(2);
    expect(getEnvelope(r1.envelope.worker_id)?.lifecycle_state).toBe('interrupted');
    expect(getEnvelope(r2.envelope.worker_id)?.lifecycle_state).toBe('interrupted');
  });

  test('recordHeartbeat updates last_heartbeat_at', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    const updated = recordHeartbeat(r.envelope.worker_id);
    expect(updated?.last_heartbeat_at).toBeDefined();
  });

  test('cross-org isolation: env in org-a never appears in org-b list', () => {
    registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    expect(listEnvelopes('org-a')).toHaveLength(1);
    expect(listEnvelopes('org-b')).toHaveLength(0);
  });

  test('listEnvelopesByState filters by lifecycle tier', () => {
    const r1 = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    const r2 = registerWorker({ kind: 'briefing_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r1.permitted || !r2.permitted) return;
    markRunning(r1.envelope.worker_id);
    markCompleted(r1.envelope.worker_id, 'done');
    expect(listEnvelopesByState('org-a', 'completed')).toHaveLength(1);
    expect(listEnvelopesByState('org-a', 'pending')).toHaveLength(1);
  });

  test('activeWorkerCount counts pending+running across orgs', () => {
    const r1 = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    const r2 = registerWorker({ kind: 'briefing_send', organization_id: 'org-b', scope_summary: 't', bounded_envelope: ENV });
    if (!r1.permitted || !r2.permitted) return;
    markRunning(r1.envelope.worker_id);
    expect(activeWorkerCount()).toBe(2);
    markCompleted(r1.envelope.worker_id, 'done');
    expect(activeWorkerCount()).toBe(1);
  });

  test('recentLifecycleCount24h tracks 24h counts', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    markCompleted(r.envelope.worker_id, 'done');
    expect(recentLifecycleCount24h().completed).toBe(1);
  });

  test('envelope ring buffer cap evicts oldest', () => {
    for (let i = 0; i < MAX_WORKER_ENVELOPES_PER_PARTITION + 5; i++) {
      registerWorker({ kind: 'email_send', organization_id: 'org-cap', scope_summary: 't', bounded_envelope: ENV });
    }
    expect(listEnvelopes('org-cap').length).toBe(MAX_WORKER_ENVELOPES_PER_PARTITION);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — boundedExecutionWorker (helper)
// ────────────────────────────────────────────────────────────────────

describe('boundedExecutionWorker.runBoundedWorker', () => {
  test('successful run returns completed outcome', async () => {
    const r = await runBoundedWorker({
      kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV,
      run: async () => 42,
    });
    expect(r.outcome).toBe('completed');
    expect(r.value).toBe(42);
    expect(r.envelope?.lifecycle_state).toBe('completed');
  });

  test('throwing run returns failed outcome and records failure', async () => {
    const r = await runBoundedWorker({
      kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV,
      run: async () => { throw new Error('boom'); },
    });
    expect(r.outcome).toBe('failed');
    expect(r.envelope?.lifecycle_state).toBe('failed');
  });

  test('rejected registration returns rejected outcome without running', async () => {
    let ran = false;
    const r = await runBoundedWorker({
      kind: 'email_send', organization_id: '',  // missing org → rejected
      scope_summary: 't', bounded_envelope: ENV,
      run: async () => { ran = true; return 1; },
    });
    expect(r.outcome).toBe('rejected');
    expect(ran).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — executionTopologyGraph
// ────────────────────────────────────────────────────────────────────

describe('executionTopologyGraph', () => {
  test('partitions start with the static edge set', () => {
    const edges = listExecEdges('org-a');
    expect(edges.length).toBe(_STATIC_EXECUTION_EDGE_COUNT_FOR_TESTS);
    expect(edges.every(e => e.is_static)).toBe(true);
  });

  test('recordExecutionDependencyEdge appends dynamic edge', () => {
    const edge = recordExecutionDependencyEdge({
      organization_id: 'org-a',
      from_kind: 'one_shot_script',
      to_kind: 'email_send',
      relation: 'depends_on',
    });
    expect(edge.is_static).toBe(false);
    expect(listExecEdges('org-a').some(e => !e.is_static)).toBe(true);
  });

  test('cross-org topology isolation', () => {
    recordExecutionDependencyEdge({
      organization_id: 'org-a', from_kind: 'one_shot_script', to_kind: 'email_send', relation: 'depends_on',
    });
    expect(listExecEdges('org-a').filter(e => !e.is_static).length).toBe(1);
    expect(listExecEdges('org-b').filter(e => !e.is_static).length).toBe(0);
  });

  test('buildExecutionTopologyProfile counts active workers per kind', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    const profile = buildExecutionTopologyProfile('org-a');
    const emailNode = profile.nodes.find(n => n.kind === 'email_send');
    expect(emailNode).toBeDefined();
    expect(emailNode!.active_count).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — executionContinuityTracker (visibility only)
// ────────────────────────────────────────────────────────────────────

describe('executionContinuityTracker', () => {
  test('continuity replay reports current envelopes per state', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    const replay = buildExecutionContinuityReplay({ organization_id: 'org-a' });
    expect(replay.entries.length).toBe(1);
    expect(replay.entries[0].lifecycle_state).toBe('running');
  });

  test('continuity replay marks interrupted_on_boot envelopes', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    flipRunningToInterruptedOnBoot();
    const replay = buildExecutionContinuityReplay({ organization_id: 'org-a' });
    expect(replay.interrupted_on_boot).toContain(r.envelope.worker_id);
  });

  test('replay does not auto-resume any worker', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    flipRunningToInterruptedOnBoot();
    buildExecutionContinuityReplay({ organization_id: 'org-a' });
    expect(getEnvelope(r.envelope.worker_id)?.lifecycle_state).toBe('interrupted');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — executionReplayEngine
// ────────────────────────────────────────────────────────────────────

describe('executionReplayEngine', () => {
  test('replayExecutionEnvelopes returns recent envelopes newest-first', () => {
    registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't1', bounded_envelope: ENV });
    registerWorker({ kind: 'briefing_send', organization_id: 'org-a', scope_summary: 't2', bounded_envelope: ENV });
    const r = replayExecutionEnvelopes({ organization_id: 'org-a' });
    expect(r.envelopes.length).toBe(2);
    expect(r.envelopes[0].kind).toBe('briefing_send');
  });

  test('replayExecutionEnvelopes filters by kind', () => {
    registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    registerWorker({ kind: 'briefing_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    const r = replayExecutionEnvelopes({ organization_id: 'org-a', kind: 'briefing_send' });
    expect(r.envelopes.length).toBe(1);
  });

  test('replayExecutionEnvelopes truncation reports bounded_reason', () => {
    for (let i = 0; i < 60; i++) {
      registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: `t${i}`, bounded_envelope: ENV });
    }
    const r = replayExecutionEnvelopes({ organization_id: 'org-a', limit: 10 });
    expect(r.envelopes.length).toBe(10);
    expect(r.bounded_reason).toContain('truncated');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — rollbackExecutionCoordinator (THIN AGGREGATION)
// ────────────────────────────────────────────────────────────────────

describe('rollbackExecutionCoordinator', () => {
  test('aggregated plan carries every step with operator_required=true', () => {
    const plan = buildRollbackExecutionPlan({
      organization_id: 'org-a',
      trigger: 'mutation_failed',
      source_chains: [
        {
          source_phase: 'mutation', chain_id: 'mut-1',
          steps: [{ source_step_ref: 'mstep-1', description: 'rollback mutation A', impact_estimate: 'medium' }],
        },
        {
          source_phase: 'topology_recovery', chain_id: 'topo-1',
          steps: [{ source_step_ref: 'tstep-1', description: 'lift topology iso', impact_estimate: 'low' }],
        },
      ],
    });
    expect(plan.steps.length).toBe(2);
    for (const s of plan.steps) expect(s.operator_required).toBe(true);
    expect(plan.source_chains.map(c => c.source_phase).sort()).toEqual(['mutation', 'topology_recovery']);
  });

  test('aggregation_summary describes phase coverage', () => {
    const plan = buildRollbackExecutionPlan({
      organization_id: 'org-a', trigger: 'operator_requested',
      source_chains: [
        { source_phase: 'mutation', chain_id: 'm1', steps: [{ source_step_ref: 's1', description: 'd', impact_estimate: 'low' }] },
        { source_phase: 'distributed_recovery', chain_id: 'd1', steps: [{ source_step_ref: 's2', description: 'd', impact_estimate: 'low' }] },
      ],
    });
    expect(plan.aggregation_summary).toContain('2 source chain');
    expect(plan.aggregation_summary).toContain('2 phase');
  });

  test('recordRollbackContinuity writes bounds and optionally flips worker state', () => {
    const r = registerWorker({ kind: 'mutation_execution', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    const bounds = recordRollbackContinuity({
      organization_id: 'org-a',
      rollback_chain_id: 'mut-1', steps_replayed: 2, max_chain_depth: 1, time_elapsed_ms: 100,
      outcome: 'full', source_phase: 'mutation', worker_id: r.envelope.worker_id,
    });
    expect(bounds.outcome).toBe('full');
    expect(bounds.source_phase).toBe('mutation');
    expect(getEnvelope(r.envelope.worker_id)?.lifecycle_state).toBe('rolled_back');
  });

  test('cross-org isolation: org-a plans never appear in org-b list', () => {
    buildRollbackExecutionPlan({
      organization_id: 'org-a', trigger: 'operator_requested',
      source_chains: [{ source_phase: 'mutation', chain_id: 'm1', steps: [] }],
    });
    expect(listRollbackPlans('org-a').length).toBe(1);
    expect(listRollbackPlans('org-b').length).toBe(0);
  });

  test('listRollbackContinuityBounds is per-org isolated', () => {
    recordRollbackContinuity({
      organization_id: 'org-a', rollback_chain_id: 'r1', steps_replayed: 1, max_chain_depth: 1,
      time_elapsed_ms: 10, outcome: 'full', source_phase: 'mutation',
    });
    expect(listRollbackContinuityBounds('org-a').length).toBe(1);
    expect(listRollbackContinuityBounds('org-b').length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — executionVisibilityReplay + execution_substrate_summary
// ────────────────────────────────────────────────────────────────────

describe('executionVisibilityReplay + summary', () => {
  test('visibility replay composes active + completed + failed + topology + governance', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    markRunning(r.envelope.worker_id);
    const v = buildExecutionVisibilityReplay({ organization_id: 'org-a' });
    expect(v.active_workers.length).toBe(1);
    expect(v.topology.nodes.length).toBeGreaterThan(0);
    expect(v.governance.decision_counts.permitted).toBe(1);
  });

  test('execution_substrate_summary aggregates active + isolation', () => {
    const r1 = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    const r2 = registerWorker({ kind: 'email_send', organization_id: 'org-b', scope_summary: 't', bounded_envelope: ENV });
    if (!r1.permitted || !r2.permitted) return;
    markRunning(r1.envelope.worker_id);
    markRunning(r2.envelope.worker_id);
    markCompleted(r1.envelope.worker_id, 'done');
    quarantine('email_send', 'org-c');
    const snap = buildExecutionSubstrateSummary();
    expect(snap.active_worker_count).toBe(1);  // r2 still running
    expect(snap.completed_24h).toBe(1);
    expect(snap.active_isolation_count).toBe(1);
    expect(snap.health_scores.execution_isolation).toBeLessThan(100);
  });

  test('summary defaults to clean state', () => {
    const snap = buildExecutionSubstrateSummary();
    expect(snap.active_worker_count).toBe(0);
    expect(snap.failed_24h).toBe(0);
    expect(snap.health_scores.execution_continuity).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — Phase 23 guardrails / hard-veto preservation
// ────────────────────────────────────────────────────────────────────

describe('phase 23 guardrails', () => {
  test('Phase 19 federation_enabled=false hard-veto unchanged after Phase 23 install', async () => {
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

  test('Phase 21 broker isolation surface unchanged after Phase 23 install', async () => {
    const isolation = await import('../distributedRuntime/brokerIsolationEngine');
    expect(typeof isolation.recordFailure).toBe('function');
    expect(typeof isolation.liftIsolation).toBe('function');
  });

  test('Phase 22 topology graph surface unchanged after Phase 23 install', async () => {
    const graph = await import('../topology/cognitionTopologyGraph');
    expect(typeof graph.buildCognitionTopologyGraph).toBe('function');
  });

  test('Phase 23 worker registration cannot recursively spawn beyond MAX_PARENT_DEPTH', () => {
    // Manually craft a deeply nested registration.
    const r = registerWorker({
      kind: 'one_shot_script', organization_id: 'org-a',
      scope_summary: 'recursive', bounded_envelope: ENV,
    });
    if (!r.permitted) return;
    let lastWorkerId = r.envelope.worker_id;
    let lastDepth = 0;
    for (let i = 0; i < MAX_PARENT_DEPTH + 2; i++) {
      const child = registerWorker({
        kind: 'one_shot_script', organization_id: 'org-a',
        scope_summary: `child${i}`, bounded_envelope: ENV,
        parent_worker_id: lastWorkerId,
      });
      if (!child.permitted) {
        expect(child.decision).toBe('rejected');
        expect(child.supervisor_rule_violated).toBe('parent_depth_limit_exceeded');
        return;
      }
      lastWorkerId = child.envelope.worker_id;
      lastDepth = child.envelope.parent_depth;
    }
    // If we never got rejected we hit the depth ceiling — make sure no
    // worker ever exceeded MAX_PARENT_DEPTH.
    expect(lastDepth).toBeLessThanOrEqual(MAX_PARENT_DEPTH);
  });

  test('cross-org isolation: org-a worker registration never grants org-b visibility', () => {
    const r = registerWorker({ kind: 'email_send', organization_id: 'org-a', scope_summary: 't', bounded_envelope: ENV });
    if (!r.permitted) return;
    expect(listEnvelopes('org-a')).toHaveLength(1);
    expect(listEnvelopes('org-b')).toHaveLength(0);
    expect(listAttributionsForOrg('org-b')).toHaveLength(0);
  });
});
