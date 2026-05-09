/**
 * topologyTypes — Phase 22. All types for the bounded within-partition
 * cognition topology orchestration layer.
 *
 * Architectural commitment (per the Phase 22 stress-test):
 *   - Topology is WITHIN-PARTITION only (within an organization).
 *     Never cross-partition, never cross-org, never federation-wide.
 *   - Dependency graph is DECLARATIVE (compile-time + operator-explicit
 *     runtime additions). No auto-discovery, no audit-mining, no
 *     learned topology emergence.
 *   - Propagation is a DETERMINISTIC walk over the declared graph.
 *     Not emergent runtime spread, not learned propagation behavior.
 *   - Forecasting is HEURISTIC + bounded + single-step lookahead.
 *     No ML, no probabilistic simulation, no recursive prediction.
 *   - Recovery sequencing is automatic; recovery EXECUTION is
 *     operator-clicked. Phase 21's operator-required-step invariant
 *     is preserved.
 */

// ─── Dependency graph (addendum #1) ──────────────────────────────────

/** How one namespace depends on another. */
export type TopologyDependencyRelation =
  | 'reads'                // namespace A reads from namespace B (e.g., reliability reads effectiveness)
  | 'writes_to'            // namespace A writes to namespace B (e.g., consent → policy_proposals)
  | 'depends_on_audit';    // namespace A consumes audit rows produced by namespace B

/** Latency sensitivity of a dependency edge — drives propagation urgency. */
export type DependencyLatencySensitivity = 'low' | 'high';

/**
 * One edge in the within-partition cognition topology graph. Static
 * edges are encoded at compile time from Phase 19/20/21 module
 * structure; dynamic edges are operator-added via `recordDependencyEdge`.
 */
export interface TopologyDependencyEdge {
  readonly from_namespace: string;
  readonly to_namespace: string;
  readonly relation: TopologyDependencyRelation;
  readonly latency_sensitivity: DependencyLatencySensitivity;
  readonly is_static: boolean;
  readonly recorded_at: string;
  readonly notes?: string;
}

/** Whole-graph snapshot for one partition. */
export interface CognitionTopologyGraph {
  readonly organization_id: string;
  readonly partition_id: string;
  readonly nodes: ReadonlyArray<{
    readonly namespace: string;
    readonly is_root: boolean;          // no incoming edges
    readonly is_leaf: boolean;          // no outgoing edges
    readonly indegree: number;
    readonly outdegree: number;
  }>;
  readonly edges: ReadonlyArray<TopologyDependencyEdge>;
  readonly built_at: string;
}

// ─── Fragmentation tier (addendum #2) ────────────────────────────────

/**
 * 4-tier deterministic classification of partition fragmentation.
 * Mapped from active isolation count + dependency-cluster overlap.
 */
export type FragmentationTier =
  | 'cohesive'      // 0 active isolations
  | 'partial'       // 1-2 active OR no dependency clusters
  | 'fragmented'    // ≥3 active OR dependency cluster with depth ≥ 2 isolated
  | 'shattered';    // ≥50% of active namespaces isolated OR all root nodes isolated

export interface TopologyFragmentationProfile {
  readonly organization_id: string;
  readonly partition_id: string;
  readonly tier: FragmentationTier;
  readonly fragmentation_pressure_score: number;   // 0..100
  readonly active_isolation_count: number;
  readonly active_namespaces: number;
  readonly isolated_root_count: number;
  readonly isolated_dependency_clusters: ReadonlyArray<{
    readonly cluster_root: string;
    readonly cluster_depth: number;
    readonly cluster_namespaces: ReadonlyArray<string>;
    readonly explanation: string;
  }>;
  readonly notes: ReadonlyArray<string>;
  readonly built_at: string;
}

// ─── Propagation confidence bounds (addendum #3) ─────────────────────

/**
 * Every propagation walk + forecast carries explicit confidence so
 * operators see exactly how confident the heuristic is. Avoids
 * over-claiming topology certainty.
 */
export interface PropagationConfidenceBounds {
  readonly forecast_horizon_minutes: number;
  readonly confidence_low: number;                  // 0..100
  readonly confidence_high: number;                 // 0..100
  readonly uncertainty_drivers: ReadonlyArray<string>;
  readonly observed_signal_strength: number;        // 0..100
}

// ─── Topology replay attribution (addendum #4) ───────────────────────

/**
 * Explains WHY a topology propagation occurred. Used by the replay
 * engine + recovery orchestrator + visibility surface.
 */
export interface TopologyReplayAttribution {
  readonly originating_namespace: string;
  readonly impacted_namespaces: ReadonlyArray<string>;
  readonly dependency_depth: number;                // longest dep chain reached
  readonly replay_walk: ReadonlyArray<{
    readonly step_index: number;
    readonly namespace: string;
    readonly arrived_via: TopologyDependencyRelation | 'origin';
    readonly arrived_from: string | null;
  }>;
  readonly propagation_reason: string;
  readonly replay_confidence: PropagationConfidenceBounds;
  readonly recorded_at: string;
}

// ─── Stabilization influence ─────────────────────────────────────────

/**
 * When a namespace recovers, which downstream namespaces likely
 * stabilized. Bounded ring buffer per partition.
 */
export interface StabilizationInfluencePath {
  readonly originating_namespace: string;           // the one that recovered
  readonly stabilized_namespaces: ReadonlyArray<string>;
  readonly recovery_kind: 'isolation_lifted' | 'replay_completed' | 'broker_reconnected' | 'operator_resolved';
  readonly observed_at: string;
  readonly attribution: TopologyReplayAttribution;
}

// ─── Runtime dependency profile ──────────────────────────────────────

export interface RuntimeDependencyProfile {
  readonly organization_id: string;
  readonly partition_id: string;
  readonly chains: ReadonlyArray<{
    readonly chain_id: string;
    readonly root_namespace: string;
    readonly path: ReadonlyArray<string>;             // ordered, root → leaves
    readonly depth: number;
    readonly any_isolated: boolean;
    readonly isolated_namespaces: ReadonlyArray<string>;
    readonly continuity_status: 'continuous' | 'degraded' | 'broken';
  }>;
  readonly stability_score: number;                   // 0..100
  readonly built_at: string;
}

// ─── Runtime propagation replay ──────────────────────────────────────

export type PropagationKind =
  | 'isolation_propagation'
  | 'continuity_restoration'
  | 'replay_backlog'
  | 'synchronization_pressure'
  | 'stabilization_flow';

export interface RuntimePropagationReplay {
  readonly replay_id: string;
  readonly organization_id: string;
  readonly partition_id: string;
  readonly entries: ReadonlyArray<{
    readonly index: number;
    readonly propagation_kind: PropagationKind;
    readonly attribution: TopologyReplayAttribution;
  }>;
  readonly bounded_reason?: string;
  readonly built_at: string;
}

// ─── Topology recovery plan ──────────────────────────────────────────

/** Same kinds as Phase 21 RecoveryStepKind, augmented with sequencing. */
export type TopologyRecoveryStepKind =
  | 'lift_isolation'
  | 'retry_namespace'
  | 'force_replay'
  | 'reset_synchronization'
  | 'clear_quarantine'
  | 'restart_broker';

export interface TopologyRecoveryStep {
  readonly step_id: string;
  readonly sequence_index: number;                  // dependency-depth ordered, leaves → roots
  readonly kind: TopologyRecoveryStepKind;
  readonly target_namespace: string;
  readonly target_organization_id: string;
  readonly description: string;
  readonly operator_required: true;                 // never auto-fires
  readonly impact_estimate: 'low' | 'medium' | 'high';
  readonly rollback_path: string;
  readonly depends_on_step_ids: ReadonlyArray<string>;
}

export interface TopologyRecoveryPlan {
  readonly plan_id: string;
  readonly organization_id: string;
  readonly partition_id: string;
  readonly trigger: 'fragmentation_detected' | 'propagation_detected' | 'operator_requested';
  readonly steps: ReadonlyArray<TopologyRecoveryStep>;
  readonly sequencing_reason: string;
  readonly bounded_reason: string;
  readonly created_at: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  readonly forecast: PropagationConfidenceBounds;
}

// ─── Topology forecast ───────────────────────────────────────────────

export interface TopologyForecastProfile {
  readonly organization_id: string;
  readonly partition_id: string;
  readonly current_tier: FragmentationTier;
  readonly forecast_tier: FragmentationTier;
  readonly forecast_horizon_minutes: number;
  readonly bounds: PropagationConfidenceBounds;
  readonly drivers: ReadonlyArray<string>;
  readonly built_at: string;
}

// ─── Topology visibility ─────────────────────────────────────────────

export interface TopologyVisibilityReplay {
  readonly organization_id: string;
  readonly partition_id: string;
  readonly graph: CognitionTopologyGraph;
  readonly fragmentation: TopologyFragmentationProfile;
  readonly dependencies: RuntimeDependencyProfile;
  readonly recent_propagations: ReadonlyArray<RuntimePropagationReplay>;
  readonly recent_stabilizations: ReadonlyArray<StabilizationInfluencePath>;
  readonly forecast: TopologyForecastProfile;
  readonly built_at: string;
}

// ─── Health surface ──────────────────────────────────────────────────

export interface TopologyHealthScores {
  readonly topology_cohesion: number;               // 0..100
  readonly fragmentation_pressure: number;          // 0..100 (higher = worse)
  readonly propagation_amplification_score: number; // 0..100 (higher = worse)
  readonly dependency_stability: number;            // 0..100
  readonly continuity_resilience: number;           // 0..100
  readonly topology_recovery_readiness: number;     // 0..100
}

export interface TopologySummarySnapshot {
  readonly organization_id: string | null;          // null = aggregated across all partitions on this node
  readonly partition_count: number;
  readonly cohesive_partition_count: number;
  readonly fragmented_partition_count: number;
  readonly shattered_partition_count: number;
  readonly active_propagations_24h: number;
  readonly recent_recovery_plans_24h: number;
  readonly health_scores: TopologyHealthScores;
  readonly last_updated: string;
}

// ─── Architectural caps ──────────────────────────────────────────────

export const MAX_DEPENDENCY_EDGES_PER_PARTITION = 200;
export const MAX_PROPAGATION_REPLAYS_PER_PARTITION = 100;
export const MAX_STABILIZATION_INFLUENCE_PATHS_PER_PARTITION = 100;
export const MAX_TOPOLOGY_RECOVERY_PLANS_PER_PARTITION = 20;
export const MAX_PROPAGATION_WALK_DEPTH = 16;
export const PROPAGATION_REPLAY_BUDGET_MS = 5_000;
export const FORECAST_DEFAULT_HORIZON_MINUTES = 30;
export const FORECAST_MAX_HORIZON_MINUTES = 120;
export const FRAGMENTATION_PARTIAL_ISOLATION_THRESHOLD = 1;
export const FRAGMENTATION_FRAGMENTED_ISOLATION_THRESHOLD = 3;
export const FRAGMENTATION_SHATTERED_ISOLATION_RATIO = 0.5;
