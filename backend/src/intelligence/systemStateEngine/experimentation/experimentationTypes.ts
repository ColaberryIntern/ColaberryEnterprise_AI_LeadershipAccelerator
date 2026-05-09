/**
 * experimentationTypes — Phase 25. All types for the deterministic
 * counterfactual operational projection substrate.
 *
 * Architectural commitment (per the Phase 25 stress-test):
 *   - Phase 25 PROJECTS hypothetical operational state; it does NOT
 *     execute operational state.
 *   - Sandboxes are PURELY in-memory. Never call live engines, never
 *     touch brokers, never invoke runtime coordinators, never dispatch
 *     workers, never modify federation/topology/execution-substrate.
 *   - Experiments fire only on explicit operator submission. No
 *     autonomous experimentation triggers. No background tick.
 *   - Rollback simulation is dry-run only — reads chain data, walks
 *     projected transitions, NEVER invokes rollback execution paths.
 *   - Propagation preview WRAPS Phase 22's existing deterministic walk
 *     against a hypothetical baseline. Not a new propagation engine.
 */

import type { CompressionSourcePhase } from '../cognitiveCompression/cognitiveCompressionTypes';

// ─── Sandbox isolation guarantee (addendum #1) ───────────────────────

/**
 * Hard structural guarantee that no production state can leak. Every
 * sandbox carries one; the engine validates it before running.
 */
export interface SandboxIsolationGuarantee {
  readonly sandbox_id: string;
  readonly runtime_writes_blocked: true;
  readonly broker_writes_blocked: true;
  readonly federation_writes_blocked: true;
  readonly topology_writes_blocked: true;
  readonly execution_substrate_writes_blocked: true;
  readonly expires_at: string;
  readonly isolation_proof_hash: string;
}

// ─── Simulation projection tier (addendum #2) ────────────────────────

export type SimulationProjectionTier =
  | 'observed_state'             // baseline only — no projection applied
  | 'single_step_projection'     // one hypothetical action, deterministic walk
  | 'chained_rehearsal'          // operator-specified chain, bounded depth ≤ 5
  | 'forecast_horizon';          // Phase 22 heuristic next-tier extended one step

// ─── Experiment replay attribution (addendum #3) ─────────────────────

export interface ExperimentReplayConfidenceBounds {
  readonly low: number;
  readonly high: number;
  readonly drivers: ReadonlyArray<string>;
  readonly inherited_from_phase: CompressionSourcePhase;
  readonly inherited_from_source_id: string;
}

export interface ExperimentReplayAttribution {
  readonly experiment_id: string;
  readonly baseline_snapshot_id: string;
  readonly hypothetical_action_count: number;
  readonly hypothetical_action_hash: string;
  readonly projected_state_hash: string;
  readonly confidence_bounds?: ExperimentReplayConfidenceBounds;
  readonly source_attributions: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase;
  }>;
}

// ─── Sandbox determinism attribution (addendum #4) ───────────────────

export interface SandboxDeterminismAttribution {
  readonly sandbox_id: string;
  readonly baseline_state_hash: string;
  readonly projected_state_hash: string;
  readonly hypothetical_action_hash: string;
  readonly replayable: boolean;
  readonly deterministic: boolean;
  readonly recorded_at: string;
}

// ─── Experimentation boundary profile (addendum #5) ──────────────────

export interface ExperimentationBoundaryProfile {
  readonly organization_id: string;
  readonly partition_id: string;
  readonly max_chain_depth: number;
  readonly max_projection_budget_ms: number;
  readonly max_action_count: number;
  readonly runtime_mutation_blocked: true;
  readonly broker_mutation_blocked: true;
  readonly topology_mutation_blocked: true;
  readonly federation_mutation_blocked: true;
  readonly execution_substrate_mutation_blocked: true;
}

// ─── Projection delta attribution (addendum #6) ──────────────────────

export type ProjectedChangeKind =
  | 'isolation_lifted'
  | 'isolation_added'
  | 'worker_lifecycle_advanced'
  | 'rollback_chain_started'
  | 'replay_completed'
  | 'recovery_step_executed'
  | 'no_change';

export interface ProjectionDeltaAttribution {
  readonly namespace: string;
  readonly projected_change_kind: ProjectedChangeKind;
  readonly derived_from_action: string;       // hypothetical_action id
  readonly dependency_depth: number;
  readonly projected_impact_score: number;    // 0..100, inherited from Phase 22 confidence centers
  readonly inherited_confidence_bounds?: ExperimentReplayConfidenceBounds;
}

// ─── Experimentation governance attribution (addendum #7) ────────────

export type SandboxGovernanceDecision =
  | 'permitted'
  | 'rejected'
  | 'flagged';

export type SandboxSupervisorRule =
  | 'organization_id_missing'
  | 'action_count_exceeded'
  | 'chain_depth_exceeded'
  | 'projection_budget_exceeded'
  | 'recursive_sandbox_attempt'
  | 'unknown_action_kind'
  | 'cross_org_action_attempt'
  | 'mutation_action_attempted_outside_sandbox';

export interface ExperimentationGovernanceAttribution {
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly decision: SandboxGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: SandboxSupervisorRule;
  readonly recorded_at: string;
}

// ─── Hypothetical actions ────────────────────────────────────────────

/** Operator-specifiable hypothetical actions. v1 set is bounded. */
export type HypotheticalActionKind =
  | 'lift_broker_isolation'              // simulate Phase 21 lift
  | 'add_broker_isolation'               // simulate Phase 21 isolation event
  | 'lift_execution_isolation'           // simulate Phase 23 lift
  | 'execute_topology_recovery_step'     // simulate Phase 22 step execution
  | 'force_continuity_replay'            // simulate Phase 21 replay
  | 'rollback_worker_lifecycle';         // simulate Phase 23 rollback transition

export interface HypotheticalAction {
  readonly action_id: string;
  readonly kind: HypotheticalActionKind;
  readonly target_namespace?: string;
  readonly target_worker_id?: string;
  readonly target_kind?: string;
  readonly notes?: string;
}

// ─── Sandbox profile ─────────────────────────────────────────────────

export interface ExecutionSandboxProfile {
  readonly sandbox_id: string;
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly tier: SimulationProjectionTier;
  readonly hypothetical_actions: ReadonlyArray<HypotheticalAction>;
  readonly baseline: ReadonlyArray<ProjectionDeltaAttribution>;       // baseline state captured
  readonly projected_deltas: ReadonlyArray<ProjectionDeltaAttribution>;
  readonly isolation_guarantee: SandboxIsolationGuarantee;
  readonly determinism: SandboxDeterminismAttribution;
  readonly boundary: ExperimentationBoundaryProfile;
  readonly time_elapsed_ms: number;
  readonly bounded_reason?: string;
  readonly built_at: string;
}

// ─── Rollback simulation ─────────────────────────────────────────────

export interface RollbackSimulationStep {
  readonly step_index: number;
  readonly source_step_ref: string;
  readonly source_phase: 'mutation' | 'distributed_recovery' | 'topology_recovery';
  readonly projected_lifecycle_transition: {
    readonly worker_id?: string;
    readonly from: string;
    readonly to: string;
  };
  readonly projected_namespace_change?: ProjectionDeltaAttribution;
  readonly explanation: string;
}

export interface RollbackSimulationReplay {
  readonly simulation_id: string;
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly source_chain_ids: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<RollbackSimulationStep>;
  readonly projected_outcome: 'all_full' | 'partial' | 'mixed' | 'failed' | 'skipped';
  readonly determinism: SandboxDeterminismAttribution;
  readonly bounded_reason?: string;
  readonly built_at: string;
}

// ─── Propagation preview ─────────────────────────────────────────────

export interface PropagationPreviewProfile {
  readonly preview_id: string;
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly hypothetical_origin: string;
  readonly hypothetical_action_kind: HypotheticalActionKind;
  readonly projected_impacted_namespaces: ReadonlyArray<string>;
  readonly projected_dependency_depth: number;
  readonly projected_impact_score: number;
  readonly inherited_confidence: ExperimentReplayConfidenceBounds;
  readonly source_phase_22_attribution_id?: string;
  readonly built_at: string;
}

// ─── Stabilization rehearsal ─────────────────────────────────────────

export interface StabilizationRehearsalStep {
  readonly step_index: number;
  readonly action: HypotheticalAction;
  readonly projected_deltas: ReadonlyArray<ProjectionDeltaAttribution>;
  readonly projected_continuity_status: 'continuous' | 'degraded' | 'broken' | 'restored';
  readonly explanation: string;
}

export interface StabilizationRehearsalReplay {
  readonly rehearsal_id: string;
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly steps: ReadonlyArray<StabilizationRehearsalStep>;
  readonly projected_final_status: 'continuous' | 'degraded' | 'broken' | 'restored';
  readonly determinism: SandboxDeterminismAttribution;
  readonly bounded_reason?: string;
  readonly built_at: string;
}

// ─── Topology experimentation graph (read-only annotations) ──────────

export interface TopologyExperimentationAnnotation {
  readonly hypothetical_edge_added?: { from: string; to: string };
  readonly hypothetical_edge_removed?: { from: string; to: string };
  readonly hypothetical_isolation_added?: string;
  readonly hypothetical_isolation_lifted?: string;
}

// ─── Trust surface ───────────────────────────────────────────────────

export interface ExperimentationTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;
    readonly score: number;
    readonly inherited_from_phase: CompressionSourcePhase | 'phase_25_experimentation';
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;
  readonly built_at: string;
}

// ─── Visibility replay ───────────────────────────────────────────────

export interface ExperimentationVisibilityReplay {
  readonly organization_id: string;
  readonly recent_sandboxes: ReadonlyArray<ExecutionSandboxProfile>;
  readonly recent_rollback_simulations: ReadonlyArray<RollbackSimulationReplay>;
  readonly recent_propagation_previews: ReadonlyArray<PropagationPreviewProfile>;
  readonly recent_rehearsals: ReadonlyArray<StabilizationRehearsalReplay>;
  readonly recent_governance_decisions: ReadonlyArray<ExperimentationGovernanceAttribution>;
  readonly trust_surface: ExperimentationTrustSurface;
  readonly built_at: string;
}

// ─── Health surface ──────────────────────────────────────────────────

export interface ExperimentationHealthScores {
  readonly experimentation_clarity: number;
  readonly simulation_reliability: number;
  readonly rollback_rehearsal_confidence: number;
  readonly propagation_preview_quality: number;
  readonly sandbox_integrity: number;
  readonly experimentation_safety: number;
}

export interface ExperimentationSummarySnapshot {
  readonly node_id: string;
  readonly recent_sandboxes_24h: number;
  readonly recent_rollback_simulations_24h: number;
  readonly recent_propagation_previews_24h: number;
  readonly recent_rehearsals_24h: number;
  readonly recent_governance_decisions_24h: number;
  readonly health_scores: ExperimentationHealthScores;
  readonly last_updated: string;
}

// ─── Architectural caps ──────────────────────────────────────────────

export const MAX_SANDBOXES_PER_PARTITION = 100;
export const MAX_ROLLBACK_SIMULATIONS_PER_PARTITION = 100;
export const MAX_PROPAGATION_PREVIEWS_PER_PARTITION = 100;
export const MAX_REHEARSALS_PER_PARTITION = 100;
export const MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION = 200;
export const MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX = 8;
export const MAX_REHEARSAL_CHAIN_DEPTH = 5;
export const MAX_PROJECTION_BUDGET_MS = 5_000;
export const MAX_BASELINE_DELTA_ENTRIES = 50;
export const SANDBOX_TTL_MS = 60 * 60_000;          // 1 hour expiry on isolation guarantee
