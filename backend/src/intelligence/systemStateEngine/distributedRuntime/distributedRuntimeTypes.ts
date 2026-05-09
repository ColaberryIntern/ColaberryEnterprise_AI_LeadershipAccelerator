/**
 * distributedRuntimeTypes — Phase 21. All types for the bounded
 * persistent federation runtime.
 *
 * Architectural commitment (per the Phase 21 stress-test):
 *   - This is "bounded persistent federation runtime continuity with
 *     forward-compatible distributed-runtime contracts" — NOT a true
 *     multi-node distributed cognition cluster.
 *   - Single-process, single-broker today. Contracts are forward-shaped
 *     so multi-broker / multi-node deployments can populate them later
 *     without contract rewrites.
 *   - Partition == organization_id (1:1, single-writer per partition).
 *   - All recovery is operator-clicked. Isolation triggers automatically
 *     but lifting it is operator-required.
 */

// ─── Adapter / broker identity ───────────────────────────────────────

/** Which storage backend currently serves a given operation. */
export type BrokerAdapterKind = 'in_memory' | 'redis';

/** Live connection status of an adapter. */
export type BrokerConnectionStatus =
  | 'connected'      // healthy, accepting ops
  | 'connecting'     // in-flight handshake
  | 'reconnecting'   // recovering from a transient failure
  | 'disconnected'   // last attempt failed; ops fall back
  | 'isolated';      // circuit breaker open; ops short-circuit to fallback

// ─── Per-operation attribution (addendum #1) ─────────────────────────

/** Outcome of a single broker operation. */
export type BrokerOperationOutcome =
  | 'success'        // primary adapter returned within the latency budget
  | 'fallback'       // primary failed, fallback adapter served the request
  | 'isolated';      // circuit breaker open; primary skipped entirely

/**
 * Attribution emitted on every put/get/listKeys/listValues/delete call.
 * Provides runtime transparency, debug context, and operator trust.
 * Bounded ring buffer per (organization_id, namespace) pair.
 */
export interface BrokerOperationAttribution {
  readonly operation: 'put' | 'get' | 'listKeys' | 'listValues' | 'delete' | 'listOrganizations' | 'ping';
  readonly adapter_kind: BrokerAdapterKind;
  readonly namespace: string;
  readonly organization_id: string;
  readonly latency_ms: number;
  readonly outcome: BrokerOperationOutcome;
  readonly fallback_reason?: string;
  readonly observed_at: string;
}

// ─── Partition isolation tier (addendum #2) ──────────────────────────

/**
 * 5-tier deterministic classification of a partition's runtime health.
 * Drives the operator-facing isolation surface. Mapped from circuit
 * breaker state + recent attribution outcomes.
 */
export type PartitionIsolationTier =
  | 'healthy'        // recent ops succeeded, no failure pressure
  | 'monitoring'     // sporadic failures, no isolation
  | 'degraded'       // failure rate elevated but still serving
  | 'isolated'       // circuit breaker open, fallback active
  | 'quarantined';   // operator-clicked or sustained isolation; serves no ops until lifted

export interface RuntimePartitionProfile {
  readonly organization_id: string;
  readonly partition_id: string;            // partition_id === organization_id in v1
  readonly tier: PartitionIsolationTier;
  readonly health_score: number;            // 0..100
  readonly recent_ops_count: number;
  readonly recent_failure_count: number;
  readonly recent_fallback_count: number;
  readonly active_namespaces: ReadonlyArray<string>;
  readonly last_op_at: string | null;
  readonly last_failure_at: string | null;
  readonly last_isolation_event_at: string | null;
  readonly notes: ReadonlyArray<string>;
  readonly built_at: string;
}

// ─── Continuity replay bounds (addendum #3) ──────────────────────────

/** What happened on a continuity replay run. */
export type ReplayOutcome = 'full' | 'partial' | 'failed' | 'skipped';

/**
 * Bounded summary of a single replay run. Makes the "bounded" claim
 * explicit so consumers know the replay never silently reloaded
 * everything in the broker.
 */
export interface ContinuityReplayBounds {
  readonly keys_replayed: number;
  readonly namespaces_visited: number;
  readonly time_elapsed_ms: number;
  readonly adapter_kind: BrokerAdapterKind;
  readonly replay_outcome: ReplayOutcome;
  readonly bounded_reason?: string;         // e.g., "key_cap_reached", "namespace_failure", "operator_cancelled"
}

export interface RuntimeContinuityReplay {
  readonly replay_id: string;
  readonly organization_id: string | null;  // null = all orgs (admin replay)
  readonly bounds: ContinuityReplayBounds;
  readonly started_at: string;
  readonly completed_at: string;
  readonly per_namespace: ReadonlyArray<{
    readonly namespace: string;
    readonly keys_visited: number;
    readonly outcome: ReplayOutcome;
    readonly notes?: string;
  }>;
  readonly trigger: 'boot' | 'isolation_lifted' | 'operator_clicked' | 'broker_reconnected';
  readonly operator_id?: string;
}

// ─── Broker isolation state ──────────────────────────────────────────

/**
 * The reason a namespace's circuit breaker tripped. Each maps to a
 * deterministic operator-facing explanation.
 */
export type BrokerIsolationReason =
  | 'consecutive_failures'
  | 'sustained_latency'
  | 'connection_lost'
  | 'operator_quarantine';

export interface BrokerIsolationProfile {
  readonly adapter_kind: BrokerAdapterKind;
  readonly isolated_namespaces: ReadonlyArray<{
    readonly namespace: string;
    readonly organization_id: string | null;  // null = global namespace isolation
    readonly reason: BrokerIsolationReason;
    readonly isolated_since: string;
    readonly consecutive_failures: number;
    readonly fallback_active: boolean;
    readonly explanation: string;
  }>;
  readonly total_isolation_events_24h: number;
  readonly active_isolation_count: number;
  readonly built_at: string;
}

// ─── Distributed runtime topology ────────────────────────────────────

export interface DistributedRuntimeTopology {
  readonly node_id: string;                 // single node in v1
  readonly brokers: ReadonlyArray<{
    readonly broker_id: string;
    readonly adapter_kind: BrokerAdapterKind;
    readonly connection_status: BrokerConnectionStatus;
    readonly last_successful_op_at: string | null;
    readonly partition_count: number;
    readonly active_namespaces: ReadonlyArray<string>;
    readonly notes: ReadonlyArray<string>;
  }>;
  readonly partition_count: number;
  readonly total_namespaces: number;
  readonly synchronization_dependencies: ReadonlyArray<{
    readonly from_broker: string;
    readonly to_broker: string;
    readonly relation: 'fallback' | 'replica' | 'shard';
  }>;
  readonly built_at: string;
}

// ─── Distributed runtime health ──────────────────────────────────────

export interface DistributedRuntimeHealthScores {
  readonly broker_continuity: number;            // 0..100
  readonly partition_isolation: number;          // 0..100
  readonly synchronization_stability: number;    // always 100 with 1 broker; degrades on isolation
  readonly replay_recovery: number;              // 0..100
  readonly distributed_topology_stability: number; // 0..100
  readonly runtime_drift_pressure: number;       // 0..100 (higher = more drift)
}

// ─── Distributed runtime visibility ──────────────────────────────────

export interface DistributedRuntimeVisibility {
  readonly node_id: string;
  readonly partitions: ReadonlyArray<RuntimePartitionProfile>;
  readonly broker_continuity_status: BrokerConnectionStatus;
  readonly active_isolations: number;
  readonly replay_backlog_estimate: number;      // 0..100
  readonly synchronization_pressure: number;     // 0..100
  readonly runtime_drift: number;                // 0..100
  readonly federation_continuity_status: 'continuous' | 'recovering' | 'degraded' | 'broken';
  readonly health_scores: DistributedRuntimeHealthScores;
  readonly built_at: string;
}

// ─── Distributed recovery ────────────────────────────────────────────

export type RecoveryStepKind =
  | 'lift_isolation'
  | 'retry_namespace'
  | 'force_replay'
  | 'reset_synchronization'
  | 'clear_quarantine'
  | 'restart_broker';

export interface DistributedRecoveryStep {
  readonly step_id: string;
  readonly kind: RecoveryStepKind;
  readonly target_namespace?: string;
  readonly target_organization_id?: string;
  readonly description: string;
  readonly operator_required: true;             // never auto-fires
  readonly impact_estimate: 'low' | 'medium' | 'high';
  readonly rollback_path: string;
}

export interface DistributedRecoveryPlan {
  readonly plan_id: string;
  readonly trigger: 'broker_disconnected' | 'partition_isolated' | 'replay_pressure' | 'operator_requested';
  readonly steps: ReadonlyArray<DistributedRecoveryStep>;
  readonly risk_summary: string;
  readonly bounded_reason: string;
  readonly created_at: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

// ─── Summary block on AuthoritativeSystemState ───────────────────────

export interface DistributedRuntimeSummarySnapshot {
  readonly node_id: string;
  readonly active_adapter_kind: BrokerAdapterKind;
  readonly broker_continuity_status: BrokerConnectionStatus;
  readonly partition_count: number;
  readonly active_isolations: number;
  readonly recent_replay_count_24h: number;
  readonly health_scores: DistributedRuntimeHealthScores;
  readonly last_updated: string;
}

// ─── Architectural caps ──────────────────────────────────────────────

export const MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE = 200;
export const MAX_REPLAY_KEYS_PER_RUN = 5000;
export const MAX_REPLAY_NAMESPACES_PER_RUN = 32;
export const MAX_REPLAY_TIME_BUDGET_MS = 30_000;
export const MAX_RECOVERY_PLANS_PER_NODE = 20;
export const ISOLATION_FAILURE_THRESHOLD = 5;            // consecutive failures before isolation
export const ISOLATION_FAILURE_WINDOW_MS = 30_000;
export const ISOLATION_LATENCY_THRESHOLD_MS = 2_000;
export const RECENT_OPS_WINDOW_MS = 5 * 60_000;          // 5min rolling window for partition tier
export const PARTITION_TIER_DEGRADED_FAILURE_RATE = 0.2; // ≥20% failures over recent ops → degraded
export const PARTITION_TIER_MONITORING_FAILURE_RATE = 0.05;
