/**
 * stabilizationIntelligenceTypes — Phase 29. All types for the
 * replay-safe operational stabilization intelligence substrate.
 *
 * Architectural commitment (per stress-test + 3 required additions):
 *   - Phase 29 RECOMMENDS, SEQUENCES, FORECASTS, CLASSIFIES, REPLAYS.
 *     It does NOT execute recovery, issue envelopes, trigger rollback,
 *     invoke mutators, orchestrate stabilization, or escalate authority.
 *   - Recovery archetypes are STATIC built-in + OPERATOR-SET augmented.
 *     No runtime-derived archetypes, no auto-evolution from outcomes.
 *   - Phase 29 produces typed `recommended_envelope_payload` Phase 27
 *     envelope drafts. Operator clicks → Phase 27 + Phase 28 gates run.
 *     NEVER bypasses evaluateIssuance.
 *   - Sequencing is `advisory_only: true` + `never_auto_executes: true`
 *     typed-as-literal — structural commitment.
 *   - Forecasting is HEURISTIC ONLY with explicit `uncertainty_bounds`
 *     and `inherited_confidence_lineage`. No ML.
 *   - Recovery governance is `operator_mediation_required: true`
 *     typed-as-literal. Refuses autonomous execution.
 *   - Pressure derives from OBSERVABLE COUNTERS ONLY (Phase 21/22/23/27/28).
 *   - Narratives are PHASE 24-COMPLIANT (static templates, citations
 *     required, deterministic SHA-256, no LLM).
 *   - Cross-organization isolation is ABSOLUTE.
 */

import type { CompressionSourcePhase } from '../cognitiveCompression/cognitiveCompressionTypes';
import type { DelegatableActionKind } from '../delegatedExecution/delegatedExecutionTypes';

// ─── 5-tier classifications ─────────────────────────────────────────

/** Recovery pressure tier — observable-counter-derived. */
export type RecoveryPressureTier =
  | 'low' | 'moderate' | 'elevated' | 'critical' | 'saturated';

/** Composite stabilization tier. */
export type StabilizationTier =
  | 'stable' | 'recovering' | 'strained' | 'critical' | 'failing';

// ─── Recovery archetype (addendum #1, #2) ───────────────────────────

/** A single step in a recovery archetype, typed to a Phase 27 action_kind. */
export interface RecoveryArchetypeStep {
  readonly step_index: number;
  readonly action_kind: DelegatableActionKind;     // from Phase 27 whitelist
  readonly rationale: string;
  readonly parameter_template: Readonly<{
    readonly target_namespace?: string;
    readonly target_kind?: string;
    readonly target_plan_id?: string;
    readonly target_step_id?: string;
  }>;
  readonly required_rollback_chain_id_param: boolean;
  readonly deterministic_hash: string;
}

/** Archetype provenance — static built-in or operator-set augmented. */
export type RecoveryArchetypeProvenance = 'built_in' | 'operator_set';

/**
 * RecoveryArchetypeProfile — declarative recovery sequence. NEVER
 * executable — operators read and click through Phase 27 to apply.
 */
export interface RecoveryArchetypeProfile {
  readonly archetype_id: string;
  readonly name: string;
  readonly description: string;
  readonly provenance: RecoveryArchetypeProvenance;
  readonly is_built_in: boolean;
  readonly steps: ReadonlyArray<RecoveryArchetypeStep>;
  readonly applicable_when: ReadonlyArray<string>;       // human-readable triggers
  readonly source_lineage: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase | 'phase_29_stabilization';
  }>;
  readonly registered_at: string;
  readonly registered_by?: string;                       // operator_id when operator-set
  readonly deterministic_hash: string;
}

/** Operator-driven archetype mutation lineage (addendum #3). */
export interface RecoveryArchetypeGovernanceAttribution {
  readonly attribution_id: string;
  readonly organization_id: string;
  readonly archetype_id: string;
  readonly previous_hash?: string;
  readonly updated_hash: string;
  readonly updated_by: string;
  readonly reason: string;
  readonly recorded_at: string;
  readonly deterministic_hash: string;
}

// ─── Rollback sequencing (addendum #4) ──────────────────────────────

/**
 * Typed Phase 27 envelope draft an operator clicks to apply through the
 * existing issuance + quota gate flow. Phase 29 NEVER issues this.
 */
export interface RecommendedEnvelopePayload {
  readonly action_kind: DelegatableActionKind;
  readonly target_namespace?: string;
  readonly target_kind?: string;
  readonly target_organization_id: string;
  readonly target_plan_id?: string;
  readonly target_step_id?: string;
  readonly suggested_rollback_chain_id_hint: string;     // operator must verify chain id
  readonly rationale: string;
  readonly draft_hash: string;
}

/**
 * RollbackSequencingProfile — advisory ordered list. NEVER auto-executes.
 */
export interface RollbackSequencingProfile {
  readonly organization_id: string;
  readonly archetype_id: string;
  readonly steps: ReadonlyArray<{
    readonly step_index: number;
    readonly recommended_payload: RecommendedEnvelopePayload;
    readonly rationale: string;
    readonly inherited_confidence_score: number;
  }>;
  readonly advisory_only: true;                          // typed-as-true: structural
  readonly never_auto_executes: true;                    // typed-as-true: structural
  readonly sequencing_hash: string;
  readonly built_at: string;
}

// ─── Continuity restoration forecast (addendum #5) ──────────────────

export interface ContinuityRestorationForecast {
  readonly organization_id: string;
  readonly archetype_id: string;
  readonly forecast_horizon_ms: number;
  readonly estimated_total_duration_ms: number;
  readonly estimated_partition_strain_pressure: number;     // 0–100
  readonly uncertainty_bounds: Readonly<{
    readonly low: number;
    readonly expected: number;
    readonly high: number;
  }>;
  readonly inherited_confidence: Readonly<{
    readonly score: number;                                  // 0–100, capped at 80
    readonly source_phase: CompressionSourcePhase | 'phase_29_stabilization';
    readonly drivers: ReadonlyArray<string>;
  }>;
  readonly heuristic_only: true;                            // typed-as-true
  readonly forecast_hash: string;
  readonly built_at: string;
}

// ─── Recovery pressure (addendum #6) + containment (addendum #10) ───

export interface RecoveryPressureProfile {
  readonly organization_id: string;
  readonly tier: RecoveryPressureTier;
  readonly score: number;                                    // 0–100 deterministic
  readonly observed_counters: Readonly<{
    rollback_replay_count_24h: number;
    continuity_replay_count_24h: number;
    topology_recovery_plans_24h: number;
    distributed_recovery_plans_24h: number;
    partition_fragmentation_active: number;
    quota_exhaustions_24h: number;
    broker_isolations_active: number;
    execution_worker_failures_24h: number;
  }>;
  readonly sample_hash: string;
  readonly recorded_at: string;
}

/**
 * RecoveryPressureContainmentAttribution (operator brief addendum #10) —
 * operators see WHY pressure was classified safely (or not).
 */
export interface RecoveryPressureContainmentAttribution {
  readonly partition_id: string;
  readonly pressure_tier: RecoveryPressureTier;
  readonly topology_contained: boolean;
  readonly rollback_coverage_verified: boolean;
  readonly replay_integrity_verified: boolean;
  readonly drivers: ReadonlyArray<string>;
  readonly deterministic_hash: string;
  readonly recorded_at: string;
}

// ─── Stabilization replay (addendum #8 from prompt) ─────────────────

export interface StabilizationReplayTrace {
  readonly trace_id: string;
  readonly organization_id: string;
  readonly archetype_id: string;
  readonly sequencing_profile_hash: string;
  readonly forecast_hash: string;
  readonly pressure_sample_hash: string;
  readonly containment_attribution_hash: string;
  readonly governance_decision_hash: string;
  readonly composite_replay_hash: string;
  readonly built_at: string;
}

// ─── Recovery governance attribution (addendum #6 from prompt) ──────

export type RecoveryGovernanceDecision =
  | 'permitted' | 'rejected' | 'flagged';

export type RecoverySupervisorRule =
  | 'organization_id_missing'
  | 'archetype_id_missing'
  | 'archetype_not_found'
  | 'archetype_forbidden'
  | 'cross_org_attempted'
  | 'rollback_chain_required_missing'
  | 'forbidden_recovery_action'
  | 'operator_mediation_required_violated';

export interface RecoveryGovernanceAttribution {
  readonly attribution_id: string;
  readonly organization_id: string;
  readonly archetype_id?: string;
  readonly operator_id: string;
  readonly decision: RecoveryGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: RecoverySupervisorRule;
  readonly operator_mediation_required: true;                // typed-as-true
  readonly recorded_at: string;
  readonly deterministic_hash: string;
}

// ─── Trust surface ──────────────────────────────────────────────────

export interface StabilizationTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;
    readonly score: number;
    readonly inherited_from_phase: CompressionSourcePhase | 'phase_29_stabilization';
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;
  readonly built_at: string;
}

// ─── Boundary proof chain (addendum #8 — required addition #8) ──────

/**
 * StabilizationBoundaryProofChain — operators verify same stabilization
 * inputs == same recovery recommendation outputs. 5-hash chain.
 */
export interface StabilizationBoundaryProofChain {
  readonly archetype_hash: string;
  readonly sequencing_hash: string;
  readonly forecast_hash: string;
  readonly pressure_hash: string;
  readonly replay_hash: string;
}

/** Replay determinism attribution (operator brief addendum #8). */
export interface RecoveryReplayDeterminismAttribution {
  readonly archetype_hash: string;
  readonly sequencing_hash: string;
  readonly replay_hash: string;
  readonly forecast_hash: string;
  readonly deterministic_composite_hash: string;
  readonly recorded_at: string;
}

// ─── Archetype finality proof (operator brief addendum #9) ──────────

/**
 * RecoveryArchetypeFinalityProof — when an operator applies an archetype
 * (i.e., issues envelopes through Phase 27 based on its sequencing
 * recommendation), Phase 29 records this proof so silent stabilization
 * reuse is impossible.
 */
export interface RecoveryArchetypeFinalityProof {
  readonly archetype_id: string;
  readonly applied_at: string;
  readonly operator_id: string;
  readonly envelope_ids_issued: ReadonlyArray<string>;
  readonly cannot_re_execute: true;                          // typed-as-true
  readonly replayable: true;                                 // typed-as-true
  readonly bounded_reason: string;
  readonly deterministic_hash: string;
}

// ─── Narrative blocks (Phase 24 inheritance) ────────────────────────

export interface StabilizationCompressionNarrativeBlock {
  readonly block_id: string;
  readonly template_id: string;
  readonly rendered_text: string;
  readonly citations: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase | 'phase_29_stabilization';
  }>;
  readonly deterministic_hash: string;
}

export interface StabilizationNarrative {
  readonly narrative_id: string;
  readonly organization_id: string;
  readonly archetype_id?: string;
  readonly blocks: ReadonlyArray<StabilizationCompressionNarrativeBlock>;
  readonly built_at: string;
}

// ─── Visibility composite + replay bundle ───────────────────────────

export interface StabilizationVisibilityReplay {
  readonly organization_id: string;
  readonly archetypes: ReadonlyArray<RecoveryArchetypeProfile>;
  readonly recent_sequencings: ReadonlyArray<RollbackSequencingProfile>;
  readonly recent_forecasts: ReadonlyArray<ContinuityRestorationForecast>;
  readonly recent_pressure: ReadonlyArray<RecoveryPressureProfile>;
  readonly recent_governance: ReadonlyArray<RecoveryGovernanceAttribution>;
  readonly recent_finality_proofs: ReadonlyArray<RecoveryArchetypeFinalityProof>;
  readonly recent_narratives: ReadonlyArray<StabilizationNarrative>;
  readonly current_stabilization_tier: StabilizationTier;
  readonly trust_surface: StabilizationTrustSurface;
  readonly built_at: string;
}

export interface StabilizationReplayBundle {
  readonly organization_id: string;
  readonly recent_traces: ReadonlyArray<StabilizationReplayTrace>;
  readonly determinism_attribution: RecoveryReplayDeterminismAttribution;
  readonly boundary_proof_chain: StabilizationBoundaryProofChain;
  readonly built_at: string;
}

// ─── Health surface ─────────────────────────────────────────────────

export interface StabilizationHealthScores {
  readonly rollback_survivability_confidence: number;
  readonly continuity_restoration_trust: number;
  readonly recovery_replay_integrity: number;
  readonly topology_restoration_confidence: number;
  readonly stabilization_reliability: number;
  readonly recovery_governance_trust: number;
}

export interface StabilizationSummarySnapshot {
  readonly node_id: string;
  readonly recent_archetype_governance_changes_24h: number;
  readonly recent_sequencings_24h: number;
  readonly recent_forecasts_24h: number;
  readonly recent_pressure_samples_24h: number;
  readonly recent_governance_decisions_24h: number;
  readonly recent_finality_proofs_24h: number;
  readonly current_stabilization_tier: StabilizationTier;
  readonly health_scores: StabilizationHealthScores;
  readonly last_updated: string;
}

// ─── Forbidden registry types ───────────────────────────────────────

/** 9 explicit forbidden actions — defense-in-depth anti-authority-creep. */
export type ForbiddenRecoveryActionKind =
  | 'autonomous_recovery_execution'
  | 'automatic_rollback_triggering'
  | 'dynamic_playbook_mutation'
  | 'cross_org_recovery_propagation'
  | 'probabilistic_recovery_planning'
  | 'runtime_self_restoration'
  | 'hidden_recovery_prioritization'
  | 'rollback_bypass'
  | 'playbook_self_evolution';

export interface ForbiddenRecoveryActionRegistry {
  readonly forbidden_actions: ReadonlyArray<ForbiddenRecoveryActionKind>;
  readonly forbidden_explanations: Readonly<Record<ForbiddenRecoveryActionKind, string>>;
  readonly registry_hash: string;
}

// ─── Architectural caps ─────────────────────────────────────────────

export const MAX_BUILT_IN_ARCHETYPES = 5;                    // exact count of built-ins
export const MAX_OPERATOR_ARCHETYPES_PER_PARTITION = 50;
export const MAX_ARCHETYPE_GOVERNANCE_PER_PARTITION = 200;
export const MAX_SEQUENCINGS_PER_PARTITION = 200;
export const MAX_FORECASTS_PER_PARTITION = 200;
export const MAX_PRESSURE_SAMPLES_PER_PARTITION = 500;
export const MAX_GOVERNANCE_PER_PARTITION = 200;
export const MAX_FINALITY_PROOFS_PER_PARTITION = 200;
export const MAX_NARRATIVES_PER_PARTITION = 100;
export const MAX_REPLAY_TRACES_PER_PARTITION = 200;
export const MAX_STEPS_PER_ARCHETYPE = 8;
export const FORECAST_HORIZON_MS = 24 * 60 * 60_000;         // 24h
export const PRESSURE_SCORE_LOW = 25;
export const PRESSURE_SCORE_MODERATE = 50;
export const PRESSURE_SCORE_ELEVATED = 75;
export const PRESSURE_SCORE_CRITICAL = 90;
export const FORECAST_CONFIDENCE_CAP = 80;                   // heuristic humility
