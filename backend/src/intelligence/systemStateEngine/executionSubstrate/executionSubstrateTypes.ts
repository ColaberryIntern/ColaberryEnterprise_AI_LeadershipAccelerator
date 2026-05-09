/**
 * executionSubstrateTypes — Phase 23. All types for the bounded
 * operational execution visibility + governance substrate.
 *
 * Architectural commitment (per the Phase 23 stress-test):
 *   - Phase 23 INSTRUMENTS + GOVERNS execution. It does NOT replace
 *     the existing execution paths (Phase 14 handoff, Phase 15 mutation,
 *     Phase 21 distributed recovery, Phase 22 topology recovery, plus
 *     existing scripts + cron tasks).
 *   - Workers OPT IN voluntarily via `registerWorker`. No auto-discovery.
 *   - Execution topology is DECLARATIVE (compile-time + operator-explicit).
 *   - Execution continuity is VISIBILITY ONLY — no auto-resume.
 *   - Rollback execution coordinator AGGREGATES Phase 15/21/22 rollback
 *     paths. It never runs a parallel rollback engine.
 *   - Governance supervisor is a HARD GATE: violations reject the
 *     registration outright with explicit attribution.
 */

// ─── Execution worker envelope (addendum #1) ─────────────────────────

/** The kinds of bounded operational workers Phase 23 instruments. */
export type ExecutionWorkerKind =
  | 'briefing_send'                       // Cory briefing service
  | 'autonomous_handoff_dispatch'         // Phase 14 handoff queue dispatch
  | 'mutation_execution'                  // Phase 15 mutation execution
  | 'distributed_recovery_step'           // Phase 21 recovery step
  | 'topology_recovery_step'              // Phase 22 topology recovery step
  | 'manifest_ingest'                     // Phase 3 manifest ingest
  | 'continuity_replay'                   // Phase 21 continuity replay
  | 'federation_share'                    // Phase 19 archetype share
  | 'federation_consume'                  // Phase 19 archetype consume
  | 'email_send'                          // Mandrill SMTP send
  | 'basecamp_sync'                       // Basecamp ticket creation
  | 'apollo_pull'                         // Apollo data pull
  | 'scheduled_job'                       // generic cron job
  | 'one_shot_script'                     // generic one-off script
  | 'operator_initiated';                 // operator UI button

/**
 * Bounded envelope every worker carries. The supervisor enforces these
 * bounds at registration time AND at heartbeat time.
 */
export interface ExecutionBoundedEnvelope {
  readonly max_duration_ms: number;
  readonly max_attempts: number;
  readonly allowed_namespaces: ReadonlyArray<string>;
  readonly parent_depth_limit: number;     // 0 = no children allowed
}

/** 6-tier deterministic lifecycle (addendum #2). */
export type ExecutionLifecycleTier =
  | 'pending'        // registered, not yet running
  | 'running'        // active heartbeat
  | 'completed'      // success
  | 'failed'         // explicit failure
  | 'interrupted'    // process restart / heartbeat timeout
  | 'rolled_back';   // rollback path executed

/**
 * Foundational execution contract. Every register/complete/fail call
 * carries one of these. Bounded ring buffer per (organization_id, kind).
 */
export interface ExecutionWorkerEnvelope {
  readonly worker_id: string;
  readonly kind: ExecutionWorkerKind;
  readonly organization_id: string;
  readonly project_id?: string;
  readonly started_at: string;             // ISO-8601
  readonly scope_summary: string;
  readonly bounded_envelope: ExecutionBoundedEnvelope;
  readonly parent_worker_id?: string;
  readonly parent_depth: number;           // 0 = root, 1 = child of root, etc.
  readonly lifecycle_state: ExecutionLifecycleTier;
  readonly attribution: ReadonlyArray<{
    readonly recorded_at: string;
    readonly transition: ExecutionLifecycleTier;
    readonly note?: string;
  }>;
  readonly last_heartbeat_at?: string;
  readonly completed_at?: string;
  readonly failed_at?: string;
  readonly interrupted_at?: string;
  readonly rolled_back_at?: string;
  readonly failure_reason?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ─── Execution topology graph ────────────────────────────────────────

export type ExecutionTopologyRelation =
  | 'depends_on'                            // A runs after B succeeds
  | 'rolls_back_with'                       // A's rollback triggers B's rollback
  | 'inherits_envelope_from';               // A inherits bounded envelope from B (parent)

export interface ExecutionDependencyEdge {
  readonly from_kind: ExecutionWorkerKind;
  readonly to_kind: ExecutionWorkerKind;
  readonly relation: ExecutionTopologyRelation;
  readonly is_static: boolean;
  readonly recorded_at: string;
  readonly notes?: string;
}

export interface ExecutionTopologyProfile {
  readonly organization_id: string;
  readonly nodes: ReadonlyArray<{
    readonly kind: ExecutionWorkerKind;
    readonly indegree: number;
    readonly outdegree: number;
    readonly is_root: boolean;
    readonly is_leaf: boolean;
    readonly active_count: number;            // currently running
    readonly recent_failure_count: number;
  }>;
  readonly edges: ReadonlyArray<ExecutionDependencyEdge>;
  readonly built_at: string;
}

// ─── Execution continuity replay ─────────────────────────────────────

export interface ExecutionContinuityReplay {
  readonly organization_id: string;
  readonly replay_id: string;
  readonly entries: ReadonlyArray<{
    readonly worker_id: string;
    readonly kind: ExecutionWorkerKind;
    readonly lifecycle_state: ExecutionLifecycleTier;
    readonly attribution_count: number;
    readonly last_transition_at: string;
    readonly explanation: string;
  }>;
  readonly stalled_workers: ReadonlyArray<string>;        // worker_ids past heartbeat timeout
  readonly interrupted_on_boot: ReadonlyArray<string>;    // worker_ids flipped to interrupted at process boot
  readonly built_at: string;
}

// ─── Execution isolation ─────────────────────────────────────────────

export type ExecutionIsolationReason =
  | 'consecutive_failures'
  | 'envelope_breach'
  | 'depth_limit_exceeded'
  | 'operator_quarantine';

export interface ExecutionIsolationProfile {
  readonly isolated_kinds: ReadonlyArray<{
    readonly kind: ExecutionWorkerKind;
    readonly organization_id: string;
    readonly reason: ExecutionIsolationReason;
    readonly isolated_since: string;
    readonly consecutive_failures: number;
    readonly explanation: string;
  }>;
  readonly active_isolation_count: number;
  readonly total_isolation_events_24h: number;
  readonly built_at: string;
}

// ─── Rollback continuity bounds (addendum #3) ────────────────────────

export type RollbackOutcome = 'full' | 'partial' | 'failed' | 'skipped';

export type RollbackSourcePhase =
  | 'mutation'                              // Phase 15 mutation rollback chain
  | 'distributed_recovery'                  // Phase 21 distributed recovery plan
  | 'topology_recovery';                    // Phase 22 topology recovery plan

export interface RollbackContinuityBounds {
  readonly rollback_chain_id: string;
  readonly steps_replayed: number;
  readonly max_chain_depth: number;
  readonly time_elapsed_ms: number;
  readonly outcome: RollbackOutcome;
  readonly bounded_reason?: string;
  readonly source_phase: RollbackSourcePhase;
}

export interface RollbackExecutionStep {
  readonly step_id: string;
  readonly source_phase: RollbackSourcePhase;
  readonly source_step_ref: string;          // FK-by-convention to the underlying phase's step id
  readonly description: string;
  readonly operator_required: true;          // Phase 23 NEVER auto-fires; aggregated paths inherit this
  readonly impact_estimate: 'low' | 'medium' | 'high';
}

export interface RollbackExecutionPlan {
  readonly plan_id: string;
  readonly organization_id: string;
  readonly trigger: 'mutation_failed' | 'recovery_requested' | 'topology_fragmented' | 'operator_requested';
  readonly steps: ReadonlyArray<RollbackExecutionStep>;
  readonly aggregation_summary: string;       // explains which phase paths the plan links to
  readonly source_chains: ReadonlyArray<{
    readonly source_phase: RollbackSourcePhase;
    readonly chain_id: string;
    readonly step_count: number;
  }>;
  readonly bounded_reason: string;
  readonly created_at: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

// ─── Execution governance attribution (addendum #4) ──────────────────

export type ExecutionGovernanceDecision =
  | 'permitted'                             // worker registered + permitted to run
  | 'rejected'                              // registration rejected outright
  | 'isolated'                              // kind currently isolated; rejected
  | 'flagged';                              // permitted but flagged for operator review

export type SupervisorRule =
  | 'parent_depth_limit_exceeded'
  | 'envelope_max_duration_invalid'
  | 'envelope_max_attempts_invalid'
  | 'envelope_namespaces_empty'
  | 'organization_id_missing'
  | 'kind_isolated'
  | 'envelope_breach_at_runtime'
  | 'lifecycle_transition_invalid';

export interface ExecutionGovernanceAttribution {
  readonly worker_id: string;
  readonly kind: ExecutionWorkerKind;
  readonly organization_id: string;
  readonly decision: ExecutionGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: SupervisorRule;
  readonly recorded_at: string;
}

// ─── Execution governance profile ────────────────────────────────────

export interface ExecutionGovernanceProfile {
  readonly organization_id: string;
  readonly recent_decisions: ReadonlyArray<ExecutionGovernanceAttribution>;
  readonly decision_counts: {
    readonly permitted: number;
    readonly rejected: number;
    readonly isolated: number;
    readonly flagged: number;
  };
  readonly violation_counts_by_rule: Readonly<Record<SupervisorRule, number>>;
  readonly built_at: string;
}

// ─── Execution visibility ────────────────────────────────────────────

export interface ExecutionVisibilityReplay {
  readonly organization_id: string;
  readonly active_workers: ReadonlyArray<ExecutionWorkerEnvelope>;
  readonly recent_completed: ReadonlyArray<ExecutionWorkerEnvelope>;
  readonly recent_failed: ReadonlyArray<ExecutionWorkerEnvelope>;
  readonly recent_interrupted: ReadonlyArray<ExecutionWorkerEnvelope>;
  readonly topology: ExecutionTopologyProfile;
  readonly continuity: ExecutionContinuityReplay;
  readonly isolation: ExecutionIsolationProfile;
  readonly governance: ExecutionGovernanceProfile;
  readonly built_at: string;
}

// ─── Health surface ──────────────────────────────────────────────────

export interface ExecutionHealthScores {
  readonly execution_continuity: number;          // 0..100
  readonly rollback_resilience: number;           // 0..100
  readonly worker_stability: number;              // 0..100
  readonly execution_isolation: number;           // 0..100
  readonly replay_execution_integrity: number;    // 0..100
  readonly execution_governance_stability: number; // 0..100
}

export interface ExecutionSubstrateSummarySnapshot {
  readonly node_id: string;
  readonly active_worker_count: number;
  readonly completed_24h: number;
  readonly failed_24h: number;
  readonly interrupted_24h: number;
  readonly rolled_back_24h: number;
  readonly active_isolation_count: number;
  readonly recent_governance_decisions_24h: number;
  readonly health_scores: ExecutionHealthScores;
  readonly last_updated: string;
}

// ─── Architectural caps ──────────────────────────────────────────────

export const MAX_WORKER_ENVELOPES_PER_PARTITION = 500;
export const MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION = 200;
export const MAX_ROLLBACK_PLANS_PER_PARTITION = 20;
export const MAX_PARENT_DEPTH = 3;
export const MAX_DURATION_MS_CAP = 30 * 60_000;         // 30 minutes hard cap
export const MAX_ATTEMPTS_CAP = 5;
export const HEARTBEAT_TIMEOUT_MS = 5 * 60_000;          // 5 minutes
export const ISOLATION_FAILURE_THRESHOLD = 5;
export const ISOLATION_FAILURE_WINDOW_MS = 30_000;
export const RECENT_VISIBILITY_LIMIT = 25;
export const STATIC_TOPOLOGY_EDGES_VERSION = '23.0';
