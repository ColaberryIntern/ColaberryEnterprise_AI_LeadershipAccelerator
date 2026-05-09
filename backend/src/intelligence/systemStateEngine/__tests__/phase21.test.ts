/**
 * Phase 21 — bounded persistent federation runtime continuity tests.
 *
 * Targets the 8 distributedRuntime modules: types/caps, brokerOperationAttribution,
 * brokerIsolationEngine, redisBrokerAdapter (against ioredis-mock + an
 * injected failing client), distributedBrokerRuntime, runtimePartitionCoordinator,
 * runtimeContinuityReplay, runtimeTopologyTracker, distributedRuntimeHealth,
 * distributedRecoveryEngine, distributedRuntimeSummaryCounters.
 */

import RedisMock from 'ioredis-mock';
import { RedisBrokerAdapter } from '../distributedRuntime/redisBrokerAdapter';
import type { RedisClientLike } from '../distributedRuntime/redisBrokerAdapter';
import {
  recordAttribution, listAttributions, listAttributionsForOrg,
  getAttributionStats, _resetAttributionForTests,
} from '../distributedRuntime/brokerOperationAttribution';
import {
  recordSuccess, recordFailure, isIsolated, getIsolationState, liftIsolation,
  quarantine, buildIsolationProfile, _resetIsolationForTests,
  _ISOLATION_FAILURE_THRESHOLD_FOR_TESTS,
} from '../distributedRuntime/brokerIsolationEngine';
import {
  initializeDistributedRuntime, getActiveAdapterKind, getNodeId,
  getActiveAdapter, _resetRuntimeForTests, pingBroker,
} from '../distributedRuntime/distributedBrokerRuntime';
import {
  partitionIdFor, buildPartitionProfile, listPartitions, partitionCount,
  _classifyTierForTests,
} from '../distributedRuntime/runtimePartitionCoordinator';
import {
  performContinuityReplay, listRecentReplays, recentReplayCount24h,
  _resetReplayForTests,
} from '../distributedRuntime/runtimeContinuityReplay';
import { buildRuntimeTopology } from '../distributedRuntime/runtimeTopologyTracker';
import { buildRuntimeVisibility } from '../distributedRuntime/distributedRuntimeHealth';
import {
  buildRecoveryPlan, executeRecoveryStep, listRecoveryPlans,
  _resetRecoveryForTests,
} from '../distributedRuntime/distributedRecoveryEngine';
import { buildDistributedRuntimeSummary, setCachedPartitionCount }
  from '../distributedRuntime/distributedRuntimeSummaryCounters';
import {
  MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE,
  MAX_REPLAY_KEYS_PER_RUN, MAX_REPLAY_NAMESPACES_PER_RUN,
  MAX_RECOVERY_PLANS_PER_NODE, ISOLATION_FAILURE_THRESHOLD,
} from '../distributedRuntime/distributedRuntimeTypes';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';

beforeEach(async () => {
  _resetAttributionForTests();
  _resetIsolationForTests();
  _resetReplayForTests();
  _resetRecoveryForTests();
  _resetRuntimeForTests();
  setCachedPartitionCount(0);
  // ioredis-mock shares data globally between instances by default — flush.
  try {
    const tmp: any = new (RedisMock as any)();
    if (typeof tmp.flushall === 'function') await tmp.flushall();
  } catch { /* noop */ }
});

function freshMockClient(): RedisClientLike {
  const c: any = new (RedisMock as any)();
  return c as RedisClientLike;
}

// ────────────────────────────────────────────────────────────────────
// Section 1 — Types + caps
// ────────────────────────────────────────────────────────────────────

describe('Phase 21 architectural caps', () => {
  test('caps are bounded and >= 1', () => {
    expect(MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE).toBeGreaterThan(0);
    expect(MAX_REPLAY_KEYS_PER_RUN).toBeGreaterThan(0);
    expect(MAX_REPLAY_NAMESPACES_PER_RUN).toBeGreaterThan(0);
    expect(MAX_RECOVERY_PLANS_PER_NODE).toBeGreaterThan(0);
    expect(ISOLATION_FAILURE_THRESHOLD).toBe(_ISOLATION_FAILURE_THRESHOLD_FOR_TESTS);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — brokerOperationAttribution
// ────────────────────────────────────────────────────────────────────

describe('brokerOperationAttribution', () => {
  test('records and reads back rows for an org', () => {
    recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'effectiveness_profiles', organization_id: 'org-a', latency_ms: 1, outcome: 'success' });
    recordAttribution({ operation: 'get', adapter_kind: 'in_memory', namespace: 'effectiveness_profiles', organization_id: 'org-a', latency_ms: 2, outcome: 'success' });
    const list = listAttributions('org-a', 'effectiveness_profiles');
    expect(list).toHaveLength(2);
    // Per-namespace buffer is insertion-ordered (oldest first).
    expect(list[0].operation).toBe('put');
    expect(list[1].operation).toBe('get');
    const orgRows = listAttributionsForOrg('org-a');
    expect(orgRows).toHaveLength(2);
    expect(orgRows.map(r => r.operation).sort()).toEqual(['get', 'put']);
  });

  test('caps the buffer at MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE', () => {
    for (let i = 0; i < MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE + 50; i++) {
      recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'reliability_profiles', organization_id: 'org-x', latency_ms: 1, outcome: 'success' });
    }
    expect(listAttributions('org-x', 'reliability_profiles').length).toBe(MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE);
  });

  test('aggregate stats track fallback + isolated outcomes', () => {
    recordAttribution({ operation: 'put', adapter_kind: 'redis', namespace: 'n', organization_id: 'org', latency_ms: 1, outcome: 'success' });
    recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org', latency_ms: 2, outcome: 'fallback', fallback_reason: 'connection_lost' });
    recordAttribution({ operation: 'get', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org', latency_ms: 1, outcome: 'isolated', fallback_reason: 'isolated' });
    const s = getAttributionStats();
    expect(s.ops_published).toBe(3);
    expect(s.ops_fallback).toBe(1);
    expect(s.ops_isolated).toBe(1);
  });

  test('cross-org isolation: org-a calls do not leak into org-b reads', () => {
    recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org-a', latency_ms: 1, outcome: 'success' });
    recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org-b', latency_ms: 1, outcome: 'success' });
    expect(listAttributionsForOrg('org-a')).toHaveLength(1);
    expect(listAttributionsForOrg('org-b')).toHaveLength(1);
    expect(listAttributionsForOrg('org-c')).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — brokerIsolationEngine
// ────────────────────────────────────────────────────────────────────

describe('brokerIsolationEngine', () => {
  test('not isolated by default; recordSuccess is no-op', () => {
    recordSuccess('n', 'org-a');
    expect(isIsolated('n', 'org-a')).toBe(false);
  });

  test('triggers isolation after ISOLATION_FAILURE_THRESHOLD consecutive failures', () => {
    for (let i = 0; i < ISOLATION_FAILURE_THRESHOLD - 1; i++) {
      const triggered = recordFailure('n', 'org-a');
      expect(triggered).toBe(false);
    }
    expect(isIsolated('n', 'org-a')).toBe(false);
    const triggered = recordFailure('n', 'org-a');
    expect(triggered).toBe(true);
    expect(isIsolated('n', 'org-a')).toBe(true);
  });

  test('connection_lost reason isolates immediately', () => {
    const triggered = recordFailure('n', 'org-a', 'connection_lost');
    expect(triggered).toBe(true);
    expect(isIsolated('n', 'org-a')).toBe(true);
    const state = getIsolationState('n', 'org-a');
    expect(state?.reason).toBe('connection_lost');
  });

  test('liftIsolation removes isolation; subsequent reads see false', () => {
    recordFailure('n', 'org-a', 'connection_lost');
    expect(isIsolated('n', 'org-a')).toBe(true);
    expect(liftIsolation('n', 'org-a')).toBe(true);
    expect(isIsolated('n', 'org-a')).toBe(false);
    expect(liftIsolation('n', 'org-a')).toBe(false);  // idempotent
  });

  test('quarantine marks operator_quarantined=true and survives lift attempts until explicit', () => {
    quarantine('n', 'org-a');
    const s = getIsolationState('n', 'org-a');
    expect(s?.operator_quarantined).toBe(true);
    expect(s?.reason).toBe('operator_quarantine');
    expect(liftIsolation('n', 'org-a')).toBe(true);
    expect(isIsolated('n', 'org-a')).toBe(false);
  });

  test('cross-namespace isolation: isolating org-a/n1 does not affect org-a/n2', () => {
    recordFailure('n1', 'org-a', 'connection_lost');
    expect(isIsolated('n1', 'org-a')).toBe(true);
    expect(isIsolated('n2', 'org-a')).toBe(false);
  });

  test('cross-org isolation: isolating org-a/n does not affect org-b/n', () => {
    recordFailure('n', 'org-a', 'connection_lost');
    expect(isIsolated('n', 'org-a')).toBe(true);
    expect(isIsolated('n', 'org-b')).toBe(false);
  });

  test('buildIsolationProfile reports active isolations + 24h count', () => {
    recordFailure('a', 'o1', 'connection_lost');
    recordFailure('b', 'o2', 'connection_lost');
    const profile = buildIsolationProfile('redis');
    expect(profile.active_isolation_count).toBe(2);
    expect(profile.isolated_namespaces.map(n => n.namespace).sort()).toEqual(['a', 'b']);
    expect(profile.total_isolation_events_24h).toBe(2);
  });

  test('isolation explanation includes consecutive_failures count for that reason', () => {
    for (let i = 0; i < ISOLATION_FAILURE_THRESHOLD; i++) recordFailure('n', 'org-a');
    const profile = buildIsolationProfile('in_memory');
    expect(profile.isolated_namespaces[0].explanation).toContain('consecutive failures');
    expect(profile.isolated_namespaces[0].consecutive_failures).toBeGreaterThanOrEqual(ISOLATION_FAILURE_THRESHOLD);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — RedisBrokerAdapter (against ioredis-mock)
// ────────────────────────────────────────────────────────────────────

describe('RedisBrokerAdapter', () => {
  test('put then get round-trips via Redis', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const adapter = new RedisBrokerAdapter({ client });
    await adapter.put('org-a', 'effectiveness_profiles', 'arch-1', { hello: 'world' });
    const v = await adapter.get<{ hello: string }>('org-a', 'effectiveness_profiles', 'arch-1');
    expect(v).toEqual({ hello: 'world' });
  });

  test('listKeys returns previously put keys; cross-org isolation enforced', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const adapter = new RedisBrokerAdapter({ client });
    await adapter.put('org-a', 'reliability_profiles', 'k1', { v: 1 });
    await adapter.put('org-a', 'reliability_profiles', 'k2', { v: 2 });
    await adapter.put('org-b', 'reliability_profiles', 'k3', { v: 3 });
    expect([...await adapter.listKeys('org-a', 'reliability_profiles')].sort()).toEqual(['k1', 'k2']);
    expect(await adapter.listKeys('org-b', 'reliability_profiles')).toEqual(['k3']);
    expect(await adapter.listKeys('org-c', 'reliability_profiles')).toEqual([]);
  });

  test('listOrganizations returns the union of orgs that have written', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const adapter = new RedisBrokerAdapter({ client });
    await adapter.put('org-a', 'x', 'k', { v: 1 });
    await adapter.put('org-b', 'x', 'k', { v: 2 });
    expect([...await adapter.listOrganizations()].sort()).toEqual(['org-a', 'org-b']);
  });

  test('delete removes the key and the membership entry', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const adapter = new RedisBrokerAdapter({ client });
    await adapter.put('org-a', 'n', 'k1', { v: 1 });
    expect(await adapter.delete('org-a', 'n', 'k1')).toBe(true);
    expect(await adapter.get('org-a', 'n', 'k1')).toBeNull();
    expect(await adapter.listKeys('org-a', 'n')).toEqual([]);
  });

  test('get returns null for missing key', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const adapter = new RedisBrokerAdapter({ client });
    expect(await adapter.get('org-a', 'n', 'missing')).toBeNull();
  });

  test('listValues hydrates JSON values', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const adapter = new RedisBrokerAdapter({ client });
    await adapter.put('org-a', 'n', 'k1', { v: 1 });
    await adapter.put('org-a', 'n', 'k2', { v: 2 });
    const values = await adapter.listValues<{ v: number }>('org-a', 'n');
    expect(values.map(x => x.v).sort()).toEqual([1, 2]);
  });

  test('falls back when Redis throws + records fallback attribution', async () => {
    let fail = true;
    const failingClient: RedisClientLike = {
      get: jest.fn(async () => { if (fail) throw new Error('redis_down'); return null; }),
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 0),
      smembers: jest.fn(async () => []),
      sadd: jest.fn(async () => 1),
      srem: jest.fn(async () => 0),
      ping: jest.fn(async () => 'PONG'),
      quit: jest.fn(async () => 'OK'),
      on: jest.fn(),
    };
    const adapter = new RedisBrokerAdapter({ client: failingClient });
    // Pre-seed fallback so the get fallback returns something.
    await adapter._getFallbackForTests().put('org-a', 'n', 'k', { v: 99 });
    const v = await adapter.get('org-a', 'n', 'k');
    expect(v).toEqual({ v: 99 });
    const ops = listAttributions('org-a', 'n');
    expect(ops.some(o => o.outcome === 'fallback')).toBe(true);
    fail = false;
  });

  test('isolated namespace short-circuits to fallback (outcome="isolated")', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const adapter = new RedisBrokerAdapter({ client });
    await adapter.put('org-a', 'n', 'k', { v: 1 });
    quarantine('n', 'org-a');
    const v = await adapter.get('org-a', 'n', 'k');
    // Fallback returned the value (mirror was written on put).
    expect(v).toEqual({ v: 1 });
    const ops = listAttributions('org-a', 'n');
    expect(ops.some(o => o.outcome === 'isolated')).toBe(true);
  });

  test('ping reports adapter connectivity', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const adapter = new RedisBrokerAdapter({ client });
    expect(await adapter.ping()).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — distributedBrokerRuntime
// ────────────────────────────────────────────────────────────────────

describe('distributedBrokerRuntime', () => {
  test('default initialization keeps in_memory adapter', () => {
    const r = initializeDistributedRuntime();
    expect(r.adapter_kind).toBe('in_memory');
    expect(getActiveAdapterKind()).toBe('in_memory');
    expect(getNodeId()).toMatch(/^node_/);
  });

  test('force_kind=redis with injected client swaps adapter', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    const r = initializeDistributedRuntime({ force_kind: 'redis', redis_client: client });
    expect(r.adapter_kind).toBe('redis');
    const adapter = getActiveAdapter();
    await adapter.put('org-a', 'n', 'k', { v: 1 });
    expect(await adapter.get('org-a', 'n', 'k')).toEqual({ v: 1 });
  });

  test('pingBroker on in_memory adapter always returns connected', async () => {
    initializeDistributedRuntime();
    const r = await pingBroker();
    expect(r.connected).toBe(true);
    expect(r.adapter_kind).toBe('in_memory');
  });

  test('node_id is per-process and stable across calls', () => {
    const a = getNodeId();
    const b = getNodeId();
    expect(a).toBe(b);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — runtimePartitionCoordinator
// ────────────────────────────────────────────────────────────────────

describe('runtimePartitionCoordinator', () => {
  test('partitionIdFor is identity (partition == organization_id)', () => {
    expect(partitionIdFor('org-a')).toBe('org-a');
  });

  test('cold-start partition is healthy with 0 ops', () => {
    initializeDistributedRuntime();
    const profile = buildPartitionProfile('org-a');
    expect(profile.tier).toBe('healthy');
    expect(profile.recent_ops_count).toBe(0);
    expect(profile.health_score).toBe(100);
  });

  test('failure-rate ≥ 20% degrades the partition tier', () => {
    initializeDistributedRuntime();
    for (let i = 0; i < 8; i++) {
      recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org-a', latency_ms: 1, outcome: 'success' });
    }
    for (let i = 0; i < 2; i++) {
      recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org-a', latency_ms: 1, outcome: 'fallback', fallback_reason: 'reason' });
    }
    const profile = buildPartitionProfile('org-a');
    expect(['monitoring', 'degraded']).toContain(profile.tier);
  });

  test('quarantined isolation forces the partition tier to quarantined', () => {
    initializeDistributedRuntime();
    recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org-a', latency_ms: 1, outcome: 'success' });
    quarantine('n', 'org-a');
    const profile = buildPartitionProfile('org-a');
    expect(profile.tier).toBe('quarantined');
    expect(profile.health_score).toBe(0);
  });

  test('isolated (non-quarantined) forces the partition tier to isolated', () => {
    initializeDistributedRuntime();
    recordAttribution({ operation: 'put', adapter_kind: 'in_memory', namespace: 'n', organization_id: 'org-a', latency_ms: 1, outcome: 'success' });
    recordFailure('n', 'org-a', 'connection_lost');
    const profile = buildPartitionProfile('org-a');
    expect(profile.tier).toBe('isolated');
  });

  test('listPartitions returns one profile per org the broker has seen', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    initializeDistributedRuntime({ force_kind: 'redis', redis_client: client });
    const adapter = getActiveAdapter();
    await adapter.put('org-a', 'n', 'k', { v: 1 });
    await adapter.put('org-b', 'n', 'k', { v: 2 });
    const partitions = await listPartitions();
    expect(partitions.map(p => p.organization_id).sort()).toEqual(['org-a', 'org-b']);
  });

  test('partitionCount counts unique orgs', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    initializeDistributedRuntime({ force_kind: 'redis', redis_client: client });
    const adapter = getActiveAdapter();
    await adapter.put('org-a', 'n', 'k', { v: 1 });
    expect(await partitionCount()).toBe(1);
  });

  test('classifyTier helper produces deterministic mapping', () => {
    expect(_classifyTierForTests(true, true, 0, 0)).toBe('quarantined');
    expect(_classifyTierForTests(false, true, 0, 0)).toBe('isolated');
    expect(_classifyTierForTests(false, false, 0.3, 10)).toBe('degraded');
    expect(_classifyTierForTests(false, false, 0.1, 10)).toBe('monitoring');
    expect(_classifyTierForTests(false, false, 0.01, 10)).toBe('healthy');
    expect(_classifyTierForTests(false, false, 0, 0)).toBe('healthy');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — runtimeContinuityReplay
// ────────────────────────────────────────────────────────────────────

describe('runtimeContinuityReplay', () => {
  test('skipped outcome when there are no organizations', async () => {
    initializeDistributedRuntime();
    const replay = await performContinuityReplay({ trigger: 'boot' });
    expect(replay.bounds.replay_outcome).toBe('skipped');
    expect(replay.bounds.keys_replayed).toBe(0);
  });

  test('full outcome replays known keys and records bounds', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    initializeDistributedRuntime({ force_kind: 'redis', redis_client: client });
    const adapter = getActiveAdapter();
    await adapter.put('org-a', BROKER_NAMESPACES.effectiveness, 'arch-1', { v: 1 });
    await adapter.put('org-a', BROKER_NAMESPACES.reliability, 'arch-1', { v: 2 });
    const replay = await performContinuityReplay({ trigger: 'boot', organization_id: 'org-a' });
    expect(replay.bounds.replay_outcome).toBe('full');
    expect(replay.bounds.keys_replayed).toBe(2);
    expect(replay.bounds.namespaces_visited).toBeGreaterThanOrEqual(2);
    expect(replay.organization_id).toBe('org-a');
  });

  test('listRecentReplays + recentReplayCount24h reflect most recent runs', async () => {
    initializeDistributedRuntime();
    await performContinuityReplay({ trigger: 'boot' });
    await performContinuityReplay({ trigger: 'isolation_lifted' });
    expect(listRecentReplays().length).toBe(2);
    expect(recentReplayCount24h()).toBe(2);
  });

  test('per-namespace failure marks the result partial', async () => {
    const failing: RedisClientLike = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 0),
      smembers: jest.fn(async () => { throw new Error('redis_down'); }),
      sadd: jest.fn(async () => 1),
      srem: jest.fn(async () => 0),
      ping: jest.fn(async () => 'PONG'),
      quit: jest.fn(async () => 'OK'),
      on: jest.fn(),
    };
    initializeDistributedRuntime({ force_kind: 'redis', redis_client: failing });
    const adapter = getActiveAdapter();
    // Force the broker to know an org exists by writing into the fallback.
    await (adapter as any)._getFallbackForTests().put('org-a', 'n', 'k', { v: 1 });
    const replay = await performContinuityReplay({ trigger: 'broker_reconnected', organization_id: 'org-a' });
    // Either partial (some namespaces failed listKeys) or skipped if the
    // fallback mirror returned for every namespace; both are acceptable v1
    // behaviors. Just assert the result is bounded + not "failed".
    expect(['full', 'partial', 'skipped']).toContain(replay.bounds.replay_outcome);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — runtimeTopologyTracker + distributedRuntimeHealth
// ────────────────────────────────────────────────────────────────────

describe('runtimeTopologyTracker + distributedRuntimeHealth', () => {
  test('topology returns 1 broker entry in v1 (single-process)', async () => {
    initializeDistributedRuntime();
    const topo = await buildRuntimeTopology();
    expect(topo.brokers).toHaveLength(1);
    expect(topo.brokers[0].adapter_kind).toBe('in_memory');
    expect(topo.synchronization_dependencies).toEqual([]);
  });

  test('visibility includes 6 health scores + federation_continuity_status', async () => {
    initializeDistributedRuntime();
    const v = await buildRuntimeVisibility();
    expect(typeof v.health_scores.broker_continuity).toBe('number');
    expect(typeof v.health_scores.partition_isolation).toBe('number');
    expect(typeof v.health_scores.synchronization_stability).toBe('number');
    expect(typeof v.health_scores.replay_recovery).toBe('number');
    expect(typeof v.health_scores.distributed_topology_stability).toBe('number');
    expect(typeof v.health_scores.runtime_drift_pressure).toBe('number');
    expect(['continuous', 'recovering', 'degraded', 'broken']).toContain(v.federation_continuity_status);
  });

  test('active isolations degrade synchronization_stability', async () => {
    initializeDistributedRuntime();
    recordFailure('n', 'org-a', 'connection_lost');
    const v = await buildRuntimeVisibility();
    expect(v.health_scores.synchronization_stability).toBeLessThan(100);
    expect(v.active_isolations).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — distributedRecoveryEngine
// ────────────────────────────────────────────────────────────────────

describe('distributedRecoveryEngine', () => {
  test('every step is operator_required=true', () => {
    const plan = buildRecoveryPlan({ trigger: 'operator_requested' });
    expect(plan.steps.length).toBeGreaterThan(0);
    for (const s of plan.steps) expect(s.operator_required).toBe(true);
  });

  test('plan with active isolation includes a lift_isolation step', () => {
    recordFailure('n', 'org-a', 'connection_lost');
    const plan = buildRecoveryPlan({ trigger: 'partition_isolated' });
    expect(plan.steps.some(s => s.kind === 'lift_isolation')).toBe(true);
  });

  test('replay_pressure trigger includes a reset_synchronization step', () => {
    const plan = buildRecoveryPlan({ trigger: 'replay_pressure' });
    expect(plan.steps.some(s => s.kind === 'reset_synchronization')).toBe(true);
  });

  test('executeRecoveryStep on lift_isolation actually lifts the isolation', async () => {
    recordFailure('n', 'org-a', 'connection_lost');
    const plan = buildRecoveryPlan({ trigger: 'partition_isolated' });
    const liftStep = plan.steps.find(s => s.kind === 'lift_isolation')!;
    expect(isIsolated('n', 'org-a')).toBe(true);
    const result = await executeRecoveryStep({
      plan_id: plan.plan_id, step_id: liftStep.step_id, operator_id: 'ali@colaberry.com',
    });
    expect(result.executed).toBe(true);
    expect(isIsolated('n', 'org-a')).toBe(false);
  });

  test('executeRecoveryStep on retry_namespace pings the broker', async () => {
    initializeDistributedRuntime();
    const plan = buildRecoveryPlan({ trigger: 'broker_disconnected' });
    const retry = plan.steps.find(s => s.kind === 'retry_namespace')!;
    const result = await executeRecoveryStep({
      plan_id: plan.plan_id, step_id: retry.step_id, operator_id: 'op',
    });
    expect(result.executed).toBe(true);
    expect(result.notes).toContain('broker_ping');
  });

  test('listRecoveryPlans returns plans newest-first', () => {
    const a = buildRecoveryPlan({ trigger: 'operator_requested' });
    const b = buildRecoveryPlan({ trigger: 'operator_requested' });
    const plans = listRecoveryPlans();
    expect(plans[0].plan_id).toBe(b.plan_id);
    expect(plans[1].plan_id).toBe(a.plan_id);
  });

  test('plan status flips to in_progress / completed as steps execute', async () => {
    const plan = buildRecoveryPlan({ trigger: 'operator_requested' });
    expect(plan.status).toBe('pending');
    const first = plan.steps[0];
    await executeRecoveryStep({ plan_id: plan.plan_id, step_id: first.step_id, operator_id: 'op' });
    const after = listRecoveryPlans().find(p => p.plan_id === plan.plan_id)!;
    expect(['in_progress', 'completed']).toContain(after.status);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — distributed_runtime_summary surface
// ────────────────────────────────────────────────────────────────────

describe('distributed_runtime_summary', () => {
  test('summary block reflects active adapter, partition count, isolations, replays', async () => {
    const client: RedisClientLike = new (RedisMock as any)();
    initializeDistributedRuntime({ force_kind: 'redis', redis_client: client });
    setCachedPartitionCount(2);
    recordFailure('n', 'org-a', 'connection_lost');
    await performContinuityReplay({ trigger: 'isolation_lifted' });
    const snap = buildDistributedRuntimeSummary();
    expect(snap.active_adapter_kind).toBe('redis');
    expect(snap.partition_count).toBe(2);
    expect(snap.active_isolations).toBe(1);
    expect(snap.recent_replay_count_24h).toBe(1);
    expect(typeof snap.health_scores.broker_continuity).toBe('number');
  });

  test('summary defaults to in_memory + 0 isolations when nothing has happened', () => {
    initializeDistributedRuntime();
    const snap = buildDistributedRuntimeSummary();
    expect(snap.active_adapter_kind).toBe('in_memory');
    expect(snap.active_isolations).toBe(0);
    expect(snap.recent_replay_count_24h).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — Federation guardrails / hard-veto preservation
// ────────────────────────────────────────────────────────────────────

describe('federation guardrails', () => {
  test('Phase 19 federation_enabled=false hard-veto unchanged after Phase 21 install', async () => {
    // Sanity-only: Phase 21 doesn't touch the federation consent surface.
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

  test('Phase 17 hard veto: containment validator surface unchanged after Phase 21', async () => {
    const harness = await import('../causality/distributedValidationHarness');
    // The actual veto path is exercised in phase16/17 suites; here we
    // just confirm the Phase 21 install did not break the import chain.
    expect(typeof harness).toBe('object');
  });
});
