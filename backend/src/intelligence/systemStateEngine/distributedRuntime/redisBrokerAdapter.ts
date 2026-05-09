/**
 * redisBrokerAdapter — Phase 21. Redis-backed implementation of the
 * Phase 20 `BrokerStorageAdapter` contract.
 *
 * Architectural commitment:
 *   - Lazy: the `ioredis` module is only imported when an adapter is
 *     actually constructed. With FEDERATION_BROKER unset, ioredis is
 *     never touched at startup.
 *   - Organization-partitioned: every key is prefixed `fedrt:{org}:{namespace}:{key}`.
 *     A namespace's keys are also tracked in a per-org index set so
 *     `listKeys` / `listValues` are bounded.
 *   - Fallback-safe: every op accepts an injected fallback adapter
 *     (default `InMemoryBrokerAdapter`). On Redis failure or when the
 *     namespace is isolated, the fallback handles the request and an
 *     attribution row records the outcome.
 *   - Cross-org isolation: an `org_a` call cannot read an `org_b` key
 *     because key names are prefixed with the org id — there is no
 *     pattern that crosses the boundary.
 */

import type { BrokerStorageAdapter } from '../federatedLearning/persistentFederationBroker';
import { InMemoryBrokerAdapter } from '../federatedLearning/persistentFederationBroker';
import type { BrokerAdapterKind, BrokerOperationOutcome } from './distributedRuntimeTypes';
import { recordAttribution } from './brokerOperationAttribution';
import {
  recordSuccess as isolationRecordSuccess,
  recordFailure as isolationRecordFailure,
  isIsolated,
} from './brokerIsolationEngine';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

/** The minimal Redis-client surface the adapter consumes. Both
 *  `ioredis` and `ioredis-mock` satisfy this. */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface RedisBrokerAdapterOptions {
  /** Pre-built Redis client. When omitted, the adapter lazy-imports
   *  `ioredis` and constructs one from `redis_url` (or REDIS_URL env). */
  client?: RedisClientLike;
  redis_url?: string;
  /** Fallback adapter used when Redis is isolated or fails. Defaults
   *  to a fresh `InMemoryBrokerAdapter`. */
  fallback?: BrokerStorageAdapter;
  /** Optional key prefix override (defaults to `fedrt`). */
  key_prefix?: string;
}

const DEFAULT_KEY_PREFIX = 'fedrt';
const ORGS_INDEX_KEY = (prefix: string) => `${prefix}:_orgs`;
const KEYS_INDEX_KEY = (prefix: string, org: string, ns: string) => `${prefix}:_idx:${org}:${ns}`;
const VALUE_KEY = (prefix: string, org: string, ns: string, key: string) =>
  `${prefix}:${org}:${ns}:${key}`;

const ADAPTER_KIND: BrokerAdapterKind = 'redis';
const FALLBACK_KIND: BrokerAdapterKind = 'in_memory';

export class RedisBrokerAdapter implements BrokerStorageAdapter {
  private client: RedisClientLike | null = null;
  private clientPromise: Promise<RedisClientLike> | null = null;
  private readonly fallback: BrokerStorageAdapter;
  private readonly key_prefix: string;
  private connected = false;
  private readonly opts: RedisBrokerAdapterOptions;

  constructor(opts: RedisBrokerAdapterOptions = {}) {
    this.opts = opts;
    this.fallback = opts.fallback ?? new InMemoryBrokerAdapter();
    this.key_prefix = opts.key_prefix ?? DEFAULT_KEY_PREFIX;
    if (opts.client) {
      this.client = opts.client;
      this.attachConnectionListeners(opts.client);
    }
  }

  private async getClient(): Promise<RedisClientLike> {
    if (this.client) return this.client;
    if (this.clientPromise) return this.clientPromise;
    const url = this.opts.redis_url ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    this.clientPromise = (async () => {
      // Lazy import so `ioredis` is only loaded when the adapter is
      // actually constructed and a client wasn't injected.
      const mod: any = await import('ioredis');
      const Ctor = mod.default ?? mod;
      const c: RedisClientLike = new Ctor(url, { lazyConnect: false, maxRetriesPerRequest: 1 });
      this.attachConnectionListeners(c);
      this.client = c;
      return c;
    })();
    return this.clientPromise;
  }

  private attachConnectionListeners(c: RedisClientLike): void {
    try {
      c.on('connect', () => {
        if (!this.connected) {
          this.connected = true;
          try { publishCognitiveEvent({ kind: 'broker.connected', project_id: 'system', payload: { adapter_kind: ADAPTER_KIND } }); } catch {}
        }
      });
      c.on('end', () => {
        if (this.connected) {
          this.connected = false;
          try { publishCognitiveEvent({ kind: 'broker.disconnected', project_id: 'system', severity: 'warning', payload: { adapter_kind: ADAPTER_KIND } }); } catch {}
        }
      });
      c.on('error', () => { /* surfaced via op attribution, not as an event */ });
    } catch { /* listener registration optional */ }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async ping(): Promise<boolean> {
    const t0 = Date.now();
    try {
      const c = await this.getClient();
      await c.ping();
      const latency = Date.now() - t0;
      recordAttribution({ operation: 'ping', adapter_kind: ADAPTER_KIND, namespace: '_system', organization_id: '_system', latency_ms: latency, outcome: 'success' });
      this.connected = true;
      return true;
    } catch (err: any) {
      const latency = Date.now() - t0;
      recordAttribution({ operation: 'ping', adapter_kind: ADAPTER_KIND, namespace: '_system', organization_id: '_system', latency_ms: latency, outcome: 'fallback', fallback_reason: err?.message ?? 'ping_failed' });
      this.connected = false;
      return false;
    }
  }

  async quit(): Promise<void> {
    if (this.client) {
      try { await this.client.quit(); } catch { /* ignore */ }
    }
  }

  // ─── Adapter contract ────────────────────────────────────────────

  async put<T>(organization_id: string, namespace: string, key: string, value: T): Promise<void> {
    if (isIsolated(namespace, organization_id)) {
      return this.runFallback('put', organization_id, namespace, 'isolated', () =>
        this.fallback.put(organization_id, namespace, key, value),
      ).then(() => undefined);
    }
    const t0 = Date.now();
    try {
      const c = await this.getClient();
      const serialized = JSON.stringify(value);
      await c.set(VALUE_KEY(this.key_prefix, organization_id, namespace, key), serialized);
      await c.sadd(KEYS_INDEX_KEY(this.key_prefix, organization_id, namespace), key);
      await c.sadd(ORGS_INDEX_KEY(this.key_prefix), organization_id);
      // Mirror to fallback for replay-safe recovery if Redis later fails.
      await this.fallback.put(organization_id, namespace, key, value);
      this.recordSuccess('put', organization_id, namespace, Date.now() - t0);
    } catch (err: any) {
      await this.runFallback('put', organization_id, namespace, err?.message ?? 'put_failed', () =>
        this.fallback.put(organization_id, namespace, key, value),
      );
    }
  }

  async get<T>(organization_id: string, namespace: string, key: string): Promise<T | null> {
    if (isIsolated(namespace, organization_id)) {
      return this.runFallback('get', organization_id, namespace, 'isolated', () =>
        this.fallback.get<T>(organization_id, namespace, key),
      );
    }
    const t0 = Date.now();
    try {
      const c = await this.getClient();
      const raw = await c.get(VALUE_KEY(this.key_prefix, organization_id, namespace, key));
      this.recordSuccess('get', organization_id, namespace, Date.now() - t0);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    } catch (err: any) {
      return this.runFallback('get', organization_id, namespace, err?.message ?? 'get_failed', () =>
        this.fallback.get<T>(organization_id, namespace, key),
      );
    }
  }

  async listKeys(organization_id: string, namespace: string): Promise<ReadonlyArray<string>> {
    if (isIsolated(namespace, organization_id)) {
      return this.runFallback('listKeys', organization_id, namespace, 'isolated', () =>
        this.fallback.listKeys(organization_id, namespace),
      );
    }
    const t0 = Date.now();
    try {
      const c = await this.getClient();
      const keys = await c.smembers(KEYS_INDEX_KEY(this.key_prefix, organization_id, namespace));
      this.recordSuccess('listKeys', organization_id, namespace, Date.now() - t0);
      return [...keys].sort();
    } catch (err: any) {
      return this.runFallback('listKeys', organization_id, namespace, err?.message ?? 'listKeys_failed', () =>
        this.fallback.listKeys(organization_id, namespace),
      );
    }
  }

  async listValues<T>(organization_id: string, namespace: string): Promise<ReadonlyArray<T>> {
    const keys = await this.listKeys(organization_id, namespace);
    const out: T[] = [];
    for (const k of keys) {
      const v = await this.get<T>(organization_id, namespace, k);
      if (v !== null) out.push(v);
    }
    return out;
  }

  async delete(organization_id: string, namespace: string, key: string): Promise<boolean> {
    if (isIsolated(namespace, organization_id)) {
      return this.runFallback('delete', organization_id, namespace, 'isolated', () =>
        this.fallback.delete(organization_id, namespace, key),
      );
    }
    const t0 = Date.now();
    try {
      const c = await this.getClient();
      const removed = await c.del(VALUE_KEY(this.key_prefix, organization_id, namespace, key));
      await c.srem(KEYS_INDEX_KEY(this.key_prefix, organization_id, namespace), key);
      // Keep fallback in sync.
      await this.fallback.delete(organization_id, namespace, key);
      this.recordSuccess('delete', organization_id, namespace, Date.now() - t0);
      return removed > 0;
    } catch (err: any) {
      return this.runFallback('delete', organization_id, namespace, err?.message ?? 'delete_failed', () =>
        this.fallback.delete(organization_id, namespace, key),
      );
    }
  }

  async listOrganizations(): Promise<ReadonlyArray<string>> {
    const t0 = Date.now();
    try {
      const c = await this.getClient();
      const orgs = await c.smembers(ORGS_INDEX_KEY(this.key_prefix));
      this.recordSuccess('listOrganizations', '_system', '_orgs_index', Date.now() - t0);
      return [...orgs].sort();
    } catch (err: any) {
      const latency = Date.now() - t0;
      const fb = await this.fallback.listOrganizations();
      recordAttribution({ operation: 'listOrganizations', adapter_kind: FALLBACK_KIND, namespace: '_orgs_index', organization_id: '_system', latency_ms: latency, outcome: 'fallback', fallback_reason: err?.message ?? 'listOrganizations_failed' });
      isolationRecordFailure('_orgs_index', null);
      return fb;
    }
  }

  _resetForTests(): void {
    this.fallback._resetForTests();
  }

  // ─── Internal: success + fallback paths ──────────────────────────

  private recordSuccess(op: BrokerAdapterOpName, organization_id: string, namespace: string, latency_ms: number): void {
    recordAttribution({ operation: op, adapter_kind: ADAPTER_KIND, namespace, organization_id, latency_ms, outcome: 'success' });
    isolationRecordSuccess(namespace, organization_id);
  }

  private async runFallback<T>(
    op: BrokerAdapterOpName,
    organization_id: string,
    namespace: string,
    reason: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const t0 = Date.now();
    const result = await fn();
    const latency = Date.now() - t0;
    const outcome: BrokerOperationOutcome = reason === 'isolated' ? 'isolated' : 'fallback';
    recordAttribution({ operation: op, adapter_kind: FALLBACK_KIND, namespace, organization_id, latency_ms: latency, outcome, fallback_reason: reason });
    if (outcome === 'fallback') {
      const triggered = isolationRecordFailure(namespace, organization_id);
      if (triggered) {
        try {
          publishCognitiveEvent({
            kind: 'broker.isolation.triggered',
            project_id: 'system',
            severity: 'warning',
            payload: { namespace, organization_id, reason },
          });
        } catch { /* noop */ }
      }
    }
    return result;
  }

  /** Test-only: expose the wrapped fallback so tests can inspect it. */
  _getFallbackForTests(): BrokerStorageAdapter {
    return this.fallback;
  }
}

type BrokerAdapterOpName =
  | 'put' | 'get' | 'listKeys' | 'listValues' | 'delete' | 'listOrganizations' | 'ping';
