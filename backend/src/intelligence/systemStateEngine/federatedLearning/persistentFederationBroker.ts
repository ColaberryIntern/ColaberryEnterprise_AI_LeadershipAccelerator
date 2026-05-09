/**
 * persistentFederationBroker — Phase 20. Storage adapter abstraction
 * for federated learning state.
 *
 * Architectural commitment (per the Phase 20 stress-test):
 *   - This is the ARCHITECTURAL CONTRACT, not production infrastructure.
 *   - v1 ships an in-memory `InMemoryBrokerAdapter` that mirrors the
 *     Phase 19 registry behavior.
 *   - Phase 21+ may introduce `RedisBrokerAdapter` / `DbBrokerAdapter`
 *     WITHOUT changing federation consumers — that's the whole point
 *     of the abstraction.
 *   - Storage is partitioned by organization_id. Cross-organization
 *     access is impossible (the contract enforces it).
 */

// ─── Adapter contract ────────────────────────────────────────────────

/**
 * The storage interface that all federation persistence must implement.
 * Bounded by the architectural caps in `federatedLearningTypes.ts`.
 *
 * All operations are async to allow real-DB implementations later;
 * the in-memory default returns synchronously-resolved Promises.
 */
export interface BrokerStorageAdapter {
  /** Put a value into an organization's namespace. Replaces existing. */
  put<T>(organization_id: string, namespace: string, key: string, value: T): Promise<void>;
  /** Get a single value. */
  get<T>(organization_id: string, namespace: string, key: string): Promise<T | null>;
  /** List all keys in a namespace for an organization. */
  listKeys(organization_id: string, namespace: string): Promise<ReadonlyArray<string>>;
  /** List all values in a namespace for an organization. */
  listValues<T>(organization_id: string, namespace: string): Promise<ReadonlyArray<T>>;
  /** Delete a single value. */
  delete(organization_id: string, namespace: string, key: string): Promise<boolean>;
  /** List all organization ids known to the broker. */
  listOrganizations(): Promise<ReadonlyArray<string>>;
  /** Reset adapter state (test-only). */
  _resetForTests(): void;
}

// ─── In-memory default implementation ────────────────────────────────

interface NamespaceMap {
  [namespace: string]: Map<string, unknown>;
}

interface OrgStore {
  [organization_id: string]: NamespaceMap;
}

class InMemoryBrokerAdapter implements BrokerStorageAdapter {
  private store: OrgStore = {};

  async put<T>(organization_id: string, namespace: string, key: string, value: T): Promise<void> {
    if (!this.store[organization_id]) this.store[organization_id] = {};
    if (!this.store[organization_id][namespace]) this.store[organization_id][namespace] = new Map();
    this.store[organization_id][namespace].set(key, value);
  }

  async get<T>(organization_id: string, namespace: string, key: string): Promise<T | null> {
    const ns = this.store[organization_id]?.[namespace];
    if (!ns) return null;
    return (ns.get(key) as T | undefined) ?? null;
  }

  async listKeys(organization_id: string, namespace: string): Promise<ReadonlyArray<string>> {
    const ns = this.store[organization_id]?.[namespace];
    if (!ns) return [];
    return Array.from(ns.keys());
  }

  async listValues<T>(organization_id: string, namespace: string): Promise<ReadonlyArray<T>> {
    const ns = this.store[organization_id]?.[namespace];
    if (!ns) return [];
    return Array.from(ns.values()) as T[];
  }

  async delete(organization_id: string, namespace: string, key: string): Promise<boolean> {
    const ns = this.store[organization_id]?.[namespace];
    if (!ns) return false;
    return ns.delete(key);
  }

  async listOrganizations(): Promise<ReadonlyArray<string>> {
    return Object.keys(this.store);
  }

  _resetForTests(): void {
    this.store = {};
  }
}

// ─── Active adapter (singleton) ──────────────────────────────────────

let activeAdapter: BrokerStorageAdapter = new InMemoryBrokerAdapter();

/** Get the active adapter. v1 returns the in-memory default. */
export function getBrokerAdapter(): BrokerStorageAdapter {
  return activeAdapter;
}

/**
 * Replace the active adapter. v1 use case is purely testing; future
 * phases (Phase 21+) will call this at boot to swap in a Redis or DB
 * adapter without changing any consumer code.
 */
export function setBrokerAdapter(adapter: BrokerStorageAdapter): void {
  activeAdapter = adapter;
}

/** Convenience namespaces used by the rest of the federated learning
 *  modules — consistent so every module reads/writes the same keyspace. */
export const BROKER_NAMESPACES = {
  effectiveness: 'effectiveness_profiles',
  reliability: 'reliability_profiles',
  diffusion: 'diffusion_replay',
  drift: 'drift_state',
  visibility: 'visibility_replay',
  policy_proposals: 'policy_proposals',
} as const;

export function _resetBroker(): void {
  activeAdapter._resetForTests();
}

/** Test helper: install a fresh in-memory adapter and return a handle to it. */
export function _installFreshInMemoryAdapter(): BrokerStorageAdapter {
  const fresh = new InMemoryBrokerAdapter();
  setBrokerAdapter(fresh);
  return fresh;
}

/** Export the in-memory class so tests can construct standalone instances. */
export { InMemoryBrokerAdapter };
