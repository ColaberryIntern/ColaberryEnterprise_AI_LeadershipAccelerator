/**
 * delegatedExecutionTypes — Phase 27. All types for the bounded
 * delegated operational execution substrate.
 *
 * Architectural commitment (per Phase 27 stress-test + 11 additional
 * structural invariants):
 *   - Phase 27 invokes ONE existing Phase 21/22/23 mutator under an
 *     operator-pre-issued single-use authority envelope. It is NOT
 *     autonomous orchestration. The operator is STILL the sole
 *     authority source.
 *   - Synchronous only. No queues, no background, no deferred execution.
 *     issue → validate → execute ONE action → record replay → consume.
 *   - Single-use envelopes (typed-as-`true` `single_use` field). Once
 *     consumed, permanently terminal.
 *   - Immutable envelopes after issuance — only `consumed_at`,
 *     `lifecycle_state`, `revoked_at` may change.
 *   - Hard timeouts. Permanent envelope invalidation on exhaustion.
 *   - Pre-flight: rollback coverage required, partition stability
 *     verified, topology containment verified.
 *   - Replay hashes include governance state (mode + isolation +
 *     rollback coverage + budget) — NOT just action payload.
 *   - 7 structural safety invariants verified per execution.
 *   - No side-effect chains: a delegated execution invokes ONE mutator;
 *     that's it. No cascading delegated actions.
 *   - 13 explicit non-delegatable actions in the forbidden registry —
 *     plus the bounded 5-action whitelist.
 */

import type { CompressionSourcePhase } from '../cognitiveCompression/cognitiveCompressionTypes';

// ─── Whitelisted delegatable action kinds (5 single-step recovery primitives) ─

export type DelegatableActionKind =
  | 'lift_broker_isolation'                  // Phase 21 liftIsolation
  | 'lift_execution_isolation'               // Phase 23 lift
  | 'force_continuity_replay'                // Phase 21 performContinuityReplay
  | 'execute_topology_recovery_step'         // Phase 22 single step
  | 'execute_distributed_recovery_step';     // Phase 21 single step

// ─── Authority envelope (addendum #1) ────────────────────────────────

export interface DelegatedAuthorityEnvelope {
  readonly envelope_id: string;
  readonly operator_id: string;
  readonly action_kind: DelegatableActionKind;
  readonly target_namespace?: string;
  readonly target_kind?: string;
  readonly target_organization_id: string;
  readonly target_plan_id?: string;          // for execute_*_recovery_step
  readonly target_step_id?: string;          // for execute_*_recovery_step
  readonly issued_at: string;
  readonly expires_at: string;
  readonly rollback_chain_required: true;    // typed-as-true: structural invariant
  readonly rollback_chain_id: string;        // required pre-flight
  readonly single_use: true;                 // typed-as-true: structural invariant
  readonly max_action_count: 1;              // typed-as-1: structural invariant
  readonly topology_containment_proof: string; // SHA-256 hash
  readonly deterministic_hash: string;       // SHA-256 of immutable fields
  readonly consumed_at?: string;
  readonly revoked_at?: string;
  readonly lifecycle_state: DelegatedExecutionLifecycleTier;
}

// ─── Lifecycle tier (addendum #2) ────────────────────────────────────

export type DelegatedExecutionLifecycleTier =
  | 'issued'         // envelope created, not yet validated
  | 'verified'       // gate chain passed, ready to execute
  | 'executing'      // mutator invocation in flight
  | 'completed'      // mutator returned successfully
  | 'failed'         // gate failure, mutator failure, or timeout
  | 'expired';       // TTL reached without execution OR timeout fired

// ─── Authority scope boundary proof chain (addendum #3) ──────────────

export interface AuthorityScopeBoundaryProofChain {
  readonly authority_validity_hash: string;
  readonly rollback_coverage_hash: string;
  readonly topology_containment_hash: string;
  readonly budget_compliance_hash: string;
  readonly single_use_proof_hash: string;
}

// ─── Attribution lineage (addendum #4) ───────────────────────────────

export interface DelegatedExecutionAttributionLineage {
  readonly envelope_id: string;
  readonly operator_id: string;
  readonly executed_at: string;
  readonly action_kind: DelegatableActionKind;
  readonly actual_action_outcome: 'success' | 'failure' | 'timeout' | 'refused';
  readonly rollback_chain_invoked_at?: string;
  readonly source_attributions: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase;
  }>;
}

// ─── Timeout bounds (addendum #5) ────────────────────────────────────

export interface DelegatedExecutionTimeoutBounds {
  readonly envelope_id: string;
  readonly timeout_ms: number;
  readonly started_at: string;
  readonly terminated_at?: string;
  readonly timeout_triggered: boolean;
  readonly rollback_verification_completed: boolean;
}

// ─── Governance replay hash (addendum #6) ────────────────────────────

/**
 * Replay determinism MUST include governance state, not just action
 * payload. The same action under different governance conditions is
 * NOT the same execution context.
 */
export interface DelegatedGovernanceReplayHash {
  readonly envelope_id: string;
  readonly governance_mode_hash: string;          // governance config snapshot
  readonly partition_isolation_state_hash: string; // Phase 21+23 isolation state
  readonly rollback_coverage_state_hash: string;   // Phase 15/21/22 chain state
  readonly execution_budget_state_hash: string;    // budget snapshot
  readonly composite_replay_hash: string;          // SHA-256 of the four above
}

// ─── Non-delegatable registry (addendum #7) ──────────────────────────

/** 13 explicit forbidden actions — structural anti-authority-creep. */
export type NonDelegatableActionKind =
  | 'mutation_execution'             // Phase 15
  | 'envelope_issuance'              // Phase 27 itself (no recursion)
  | 'topology_creation'              // Phase 22
  | 'topology_deletion'
  | 'federation_mutation'            // Phase 19
  | 'quarantine_issuance'            // Phase 21+23 quarantine
  | 'rollback_chain_generation'      // Phase 23 build_rollback_execution_plan
  | 'recovery_plan_generation'       // Phase 21+22 plan creation
  | 'governance_calibration'         // Phase 18
  | 'trust_mutation'                 // Phase 13/17 trust changes
  | 'sandbox_promotion'              // Phase 25/26 — explicit prohibition
  | 'runtime_promotion'              // Phase 26 — explicit prohibition
  | 'execution_daemon_creation';     // any persistent worker

export interface NonDelegatableOperationalActionRegistry {
  readonly forbidden_actions: ReadonlyArray<NonDelegatableActionKind>;
  readonly forbidden_explanations: Readonly<Record<NonDelegatableActionKind, string>>;
  readonly registry_hash: string;
}

// ─── Finality proof (addendum #8) ────────────────────────────────────

export interface DelegatedExecutionFinalityProof {
  readonly envelope_id: string;
  readonly finalized_at: string;
  readonly terminal_state: DelegatedExecutionLifecycleTier;
  readonly cannot_re_execute: true;                 // typed-as-true
  readonly cannot_re_consume: true;                 // typed-as-true
  readonly cannot_re_validate: true;                // typed-as-true
  readonly finality_hash: string;
}

// ─── Safety invariant verification (addendum #9) ─────────────────────

export type SafetyInvariantName =
  | 'rollback_exists'
  | 'partition_stable'
  | 'envelope_immutable'
  | 'authority_bounded'
  | 'topology_contained'
  | 'no_recursive_delegation'
  | 'replay_deterministic';

export interface DelegatedExecutionSafetyInvariant {
  readonly invariant_name: SafetyInvariantName;
  readonly invariant_verified: boolean;
  readonly verification_hash: string;
  readonly violated_reason?: string;
  readonly recorded_at: string;
}

// ─── Authority compression narrative (addendum #10) ──────────────────

export interface ExecutionAuthorityCompressionNarrativeBlock {
  readonly block_id: string;
  readonly template_id: string;
  readonly rendered_text: string;
  readonly citations: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase | 'phase_27_delegated_execution';
  }>;
  readonly deterministic_hash: string;
}

export interface ExecutionAuthorityCompressionNarrative {
  readonly narrative_id: string;
  readonly envelope_id: string;
  readonly organization_id: string;
  readonly blocks: ReadonlyArray<ExecutionAuthorityCompressionNarrativeBlock>;
  readonly built_at: string;
}

// ─── Rollback protection profile ─────────────────────────────────────

export interface DelegatedRollbackProtectionProfile {
  readonly envelope_id: string;
  readonly action_kind: DelegatableActionKind;
  readonly target_organization_id: string;
  readonly rollback_chain_id: string;
  readonly rollback_chain_source_phase: 'phase_15_mutation' | 'phase_21_runtime' | 'phase_22_topology' | 'phase_23_execution_substrate';
  readonly rollback_available: boolean;
  readonly verification_hash: string;
  readonly verified_at: string;
}

// ─── Topology containment profile ────────────────────────────────────

export interface TopologyDelegationContainmentProfile {
  readonly envelope_id: string;
  readonly target_organization_id: string;
  readonly target_namespace?: string;
  readonly contained_within_partition: true;        // typed-as-true
  readonly cross_org_attempted: false;              // typed-as-false
  readonly partition_quarantined: boolean;
  readonly partition_isolated_count: number;
  readonly partition_health_score: number;
  readonly partition_stability_acceptable: boolean;
  readonly containment_proof_hash: string;
  readonly built_at: string;
}

// ─── Execution budget profile ────────────────────────────────────────

export interface ExecutionBudgetProfile {
  readonly envelope_id: string;
  readonly max_action_count: 1;                     // typed-as-1
  readonly max_runtime_ms: number;
  readonly max_topology_propagation_depth: number;
  readonly max_rollback_chain_depth: number;
  readonly max_concurrency: 1;                      // typed-as-1
  readonly replay_retention_count: number;
  readonly budget_consumed: {
    readonly actions_executed: number;
    readonly runtime_ms_consumed: number;
  };
  readonly budget_exhausted: boolean;
  readonly compliance_hash: string;
}

// ─── Governance attribution ──────────────────────────────────────────

export type DelegatedGovernanceDecision =
  | 'permitted'
  | 'rejected'
  | 'flagged';

export type DelegatedSupervisorRule =
  | 'organization_id_missing'
  | 'operator_id_missing'
  | 'action_kind_not_in_whitelist'
  | 'action_kind_in_forbidden_registry'
  | 'rollback_chain_required_missing'
  | 'envelope_expired'
  | 'envelope_already_consumed'
  | 'envelope_revoked'
  | 'envelope_immutability_violated'
  | 'partition_unstable'
  | 'topology_containment_violated'
  | 'budget_exhausted'
  | 'recursive_delegation_attempted'
  | 'safety_invariant_violated'
  | 'cross_org_attempted'
  // Phase 28 — quota gate integration
  | 'quota_exhausted';

export interface DelegatedExecutionGovernanceAttribution {
  readonly envelope_id: string;
  readonly organization_id: string;
  readonly operator_id: string;
  readonly decision: DelegatedGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: DelegatedSupervisorRule;
  readonly safety_invariants_evaluated: ReadonlyArray<DelegatedExecutionSafetyInvariant>;
  readonly recorded_at: string;
}

export interface DelegatedExecutionGovernanceProfile {
  readonly organization_id: string;
  readonly recent_decisions: ReadonlyArray<DelegatedExecutionGovernanceAttribution>;
  readonly decision_counts: { readonly permitted: number; readonly rejected: number; readonly flagged: number };
  readonly violation_counts_by_rule: Readonly<Record<DelegatedSupervisorRule, number>>;
  readonly built_at: string;
}

// ─── Replay trace ────────────────────────────────────────────────────

export interface DelegatedExecutionReplayTrace {
  readonly trace_id: string;
  readonly envelope_id: string;
  readonly operator_id: string;
  readonly organization_id: string;
  readonly action_kind: DelegatableActionKind;
  readonly attribution_lineage: DelegatedExecutionAttributionLineage;
  readonly governance_replay_hash: DelegatedGovernanceReplayHash;
  readonly safety_invariants: ReadonlyArray<DelegatedExecutionSafetyInvariant>;
  readonly boundary_proof_chain: AuthorityScopeBoundaryProofChain;
  readonly timeout_bounds: DelegatedExecutionTimeoutBounds;
  readonly finality_proof: DelegatedExecutionFinalityProof;
  readonly built_at: string;
}

// ─── Execution result ────────────────────────────────────────────────

export type DelegatedExecutionOutcome = 'success' | 'failure' | 'timeout' | 'refused';

export interface DelegatedExecutionResult {
  readonly envelope_id: string;
  readonly outcome: DelegatedExecutionOutcome;
  readonly reason: string;
  readonly executed_action_kind?: DelegatableActionKind;
  readonly mutator_response_summary?: string;       // bounded string from underlying mutator
  readonly trace: DelegatedExecutionReplayTrace;
}

// ─── Trust surface ───────────────────────────────────────────────────

export interface DelegatedExecutionTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;
    readonly score: number;
    readonly inherited_from_phase: CompressionSourcePhase | 'phase_27_delegated_execution';
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;
  readonly built_at: string;
}

// ─── Visibility ──────────────────────────────────────────────────────

export interface DelegatedExecutionVisibilityReplay {
  readonly organization_id: string;
  readonly recent_envelopes: ReadonlyArray<DelegatedAuthorityEnvelope>;
  readonly recent_traces: ReadonlyArray<DelegatedExecutionReplayTrace>;
  readonly recent_governance_decisions: ReadonlyArray<DelegatedExecutionGovernanceAttribution>;
  readonly recent_authority_narratives: ReadonlyArray<ExecutionAuthorityCompressionNarrative>;
  readonly trust_surface: DelegatedExecutionTrustSurface;
  readonly built_at: string;
}

// ─── Health surface ──────────────────────────────────────────────────

export interface DelegatedExecutionHealthScores {
  readonly delegation_confidence: number;
  readonly rollback_certainty: number;
  readonly containment_integrity: number;
  readonly authority_reliability: number;
  readonly budget_safety: number;
  readonly replay_integrity: number;
}

export interface DelegatedExecutionSummarySnapshot {
  readonly node_id: string;
  readonly recent_envelopes_24h: number;
  readonly recent_executions_24h: number;
  readonly recent_refusals_24h: number;
  readonly recent_timeouts_24h: number;
  readonly recent_expirations_24h: number;
  readonly recent_governance_decisions_24h: number;
  readonly health_scores: DelegatedExecutionHealthScores;
  readonly last_updated: string;
}

// ─── Architectural caps ──────────────────────────────────────────────

export const MAX_DELEGATION_DEPTH = 1;                  // no recursion
export const MAX_ENVELOPE_TTL_MS = 5 * 60_000;          // 5 minutes hard cap
export const DEFAULT_ENVELOPE_TTL_MS = 60_000;          // 1 minute default
export const MAX_EXECUTION_TIMEOUT_MS = 30_000;         // 30 seconds hard timeout per execution
export const DEFAULT_EXECUTION_TIMEOUT_MS = 10_000;     // 10s default
export const MAX_TOPOLOGY_PROPAGATION_DEPTH = 4;
export const MAX_ROLLBACK_CHAIN_DEPTH = 8;
export const MAX_CONCURRENT_EXECUTIONS = 1;             // single-action-at-a-time per envelope
export const MAX_ENVELOPES_PER_PARTITION = 100;
export const MAX_TRACES_PER_PARTITION = 200;
export const MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION = 200;
export const MAX_AUTHORITY_NARRATIVES_PER_PARTITION = 100;
export const PARTITION_HEALTH_MIN_SCORE = 60;            // refuse below this
export const REPLAY_RETENTION_PER_ENVELOPE = 1;
