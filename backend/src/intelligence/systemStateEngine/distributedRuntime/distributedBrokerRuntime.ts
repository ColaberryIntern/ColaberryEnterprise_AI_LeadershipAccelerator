/**
 * distributedBrokerRuntime — Phase 21. Top-level orchestrator that
 * decides which `BrokerStorageAdapter` is active and exposes a single
 * `nodeId()` per process.
 *
 * Architectural commitment:
 *   - Single-process, single-broker today. The "node" is one Node.js
 *     process. Multi-node is a Phase 22+ deployment task.
 *   - Active adapter is selected by env: FEDERATION_BROKER=redis to
 *     swap in `RedisBrokerAdapter`. Default stays `InMemoryBrokerAdapter`.
 *   - Lazy: when FEDERATION_BROKER is unset, ioredis is never imported.
 *   - Fallback always available — `RedisBrokerAdapter` accepts an
 *     `InMemoryBrokerAdapter` fallback by default.
 */

import { setBrokerAdapter, getBrokerAdapter, InMemoryBrokerAdapter } from '../federatedLearning/persistentFederationBroker';
import type { BrokerStorageAdapter } from '../federatedLearning/persistentFederationBroker';
import { RedisBrokerAdapter } from './redisBrokerAdapter';
import type { RedisClientLike } from './redisBrokerAdapter';
import type { BrokerAdapterKind, BrokerConnectionStatus } from './distributedRuntimeTypes';

// Stable per-process identifier; mirrors a real "node id" without
// pretending to coordinate with other nodes (there are none today).
const NODE_ID = `node_${process.pid}_${Date.now().toString(36)}`;

let activeAdapterKind: BrokerAdapterKind = 'in_memory';
let connectionStatus: BrokerConnectionStatus = 'connected';
let activeRedisAdapter: RedisBrokerAdapter | null = null;
let initialized = false;

export interface InitializeRuntimeOptions {
  /** Override env-driven selection. */
  force_kind?: BrokerAdapterKind;
  /** Pre-built Redis client (test injection or an already-constructed
   *  ioredis instance). */
  redis_client?: RedisClientLike;
  redis_url?: string;
  /** Fallback adapter — defaults to InMemoryBrokerAdapter. */
  fallback?: BrokerStorageAdapter;
}

/**
 * Initialize the distributed broker runtime. Reads FEDERATION_BROKER
 * unless overridden. Idempotent — multiple calls reuse the existing
 * configuration.
 */
export function initializeDistributedRuntime(opts: InitializeRuntimeOptions = {}): {
  adapter_kind: BrokerAdapterKind;
  node_id: string;
} {
  if (initialized && !opts.force_kind && !opts.redis_client) {
    return { adapter_kind: activeAdapterKind, node_id: NODE_ID };
  }

  const desired: BrokerAdapterKind =
    opts.force_kind ?? (process.env.FEDERATION_BROKER === 'redis' ? 'redis' : 'in_memory');

  if (desired === 'redis') {
    const redis = new RedisBrokerAdapter({
      client: opts.redis_client,
      redis_url: opts.redis_url,
      fallback: opts.fallback ?? new InMemoryBrokerAdapter(),
    });
    activeRedisAdapter = redis;
    setBrokerAdapter(redis);
    activeAdapterKind = 'redis';
    connectionStatus = 'connecting';
    // Fire-and-forget ping to surface initial connection state.
    void redis.ping().then(ok => {
      connectionStatus = ok ? 'connected' : 'disconnected';
    });
  } else {
    activeRedisAdapter = null;
    setBrokerAdapter(new InMemoryBrokerAdapter());
    activeAdapterKind = 'in_memory';
    connectionStatus = 'connected';
  }

  initialized = true;
  return { adapter_kind: activeAdapterKind, node_id: NODE_ID };
}

export function getActiveAdapterKind(): BrokerAdapterKind {
  return activeAdapterKind;
}

export function getNodeId(): string {
  return NODE_ID;
}

export function getConnectionStatus(): BrokerConnectionStatus {
  return connectionStatus;
}

export function getActiveAdapter(): BrokerStorageAdapter {
  if (!initialized) initializeDistributedRuntime();
  return getBrokerAdapter();
}

export function getActiveRedisAdapter(): RedisBrokerAdapter | null {
  return activeRedisAdapter;
}

/** Operator-clicked: ping the broker now. */
export async function pingBroker(): Promise<{ connected: boolean; adapter_kind: BrokerAdapterKind }> {
  if (activeRedisAdapter) {
    const ok = await activeRedisAdapter.ping();
    connectionStatus = ok ? 'connected' : 'disconnected';
    return { connected: ok, adapter_kind: 'redis' };
  }
  return { connected: true, adapter_kind: 'in_memory' };
}

export function _resetRuntimeForTests(): void {
  if (activeRedisAdapter) {
    void activeRedisAdapter.quit();
  }
  activeRedisAdapter = null;
  activeAdapterKind = 'in_memory';
  connectionStatus = 'connected';
  initialized = false;
  setBrokerAdapter(new InMemoryBrokerAdapter());
}

export const _NODE_ID_FOR_TESTS = NODE_ID;
