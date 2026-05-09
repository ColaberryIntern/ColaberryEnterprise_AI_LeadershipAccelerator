/**
 * recoveryForesightTypes — Phase 30. All types for the replay-safe
 * stabilization decision cognition substrate.
 *
 * Architectural commitment (per stress-test + 3 required additions):
 *   - Phase 30 COMPARES, EXPLAINS, WALKS THROUGH, REPLAYS, FORECASTS.
 *     It does NOT select archetypes, rank stabilization paths, recommend
 *     "best" recovery, issue authority, optimize stabilization, infer
 *     operator preference, or evolve decision heuristics.
 *   - NO `selected_archetype`, NO `recommended_archetype`, NO
 *     `aggregate_score`, NO `composite_priority`, NO `ranking_index`.
 *     `engine_never_ranks: true` typed-as-literal on every comparison
 *     profile.
 *   - Phase 30 produces DATA STRUCTURES ONLY — never writes envelopes,
 *     never mutates archetypes, never invokes sequencing writes,
 *     never triggers rollback, never invokes mutators.
 *   - Archaeology scope is Phase 29-ONLY in v1: archetypes + governance
 *     + finality proofs + sequencings + forecasts + pressure samples.
 *     No cross-phase mutator lineage.
 *   - Tradeoffs are HEURISTIC ONLY with `heuristic_only: true`
 *     typed-as-literal.
 *   - Guidance is `advisory_only: true` typed-as-literal.
 *   - Narratives are PHASE 24-COMPLIANT.
 *   - Cross-organization isolation is ABSOLUTE.
 */

import type { CompressionSourcePhase } from '../cognitiveCompression/cognitiveCompressionTypes';

// ─── 5-tier enums ───────────────────────────────────────────────────

/**
 * DecisionForesightTier — composite classification of how clear the
 * stabilization decision space is for an organization right now.
 *   - clear: archetypes are applicable + governance permits + tradeoffs are bounded
 *   - explorable: archetypes are applicable but tradeoffs vary widely
 *   - contested: archetypes have similar metrics; operator judgment required
 *   - unsuitable: no archetypes are applicable for current pressure
 *   - blocked: every applicable archetype was rejected by governance
 */
export type DecisionForesightTier =
  | 'clear' | 'explorable' | 'contested' | 'unsuitable' | 'blocked';

// ─── ArchetypeComparisonRow (addendum #2) ───────────────────────────

export interface ArchetypeComparisonRow {
  readonly archetype_id: string;
  readonly archetype_name: string;
  readonly provenance: 'built_in' | 'operator_set';
  readonly step_count: number;
  readonly duration_ms: number;
  readonly strain_pressure: number;                          // 0–100
  readonly confidence: number;                                // 0–100, capped at 80
  readonly governance_passed: boolean;
  readonly governance_reason?: string;
  readonly deterministic_hash: string;
}

/**
 * StabilizationDecisionComparisonProfile (addendum #1) — multi-archetype
 * side-by-side comparison. NO `selected_archetype`. NO aggregate score.
 * `engine_never_ranks: true` typed-as-literal.
 */
export interface StabilizationDecisionComparisonProfile {
  readonly comparison_id: string;
  readonly organization_id: string;
  readonly rows: ReadonlyArray<ArchetypeComparisonRow>;
  readonly engine_never_ranks: true;                          // typed-as-true: structural
  readonly advisory_only: true;                               // typed-as-true: structural
  readonly tier: DecisionForesightTier;
  readonly comparison_hash: string;
  readonly built_at: string;
}

// ─── RollbackSurvivabilityComparison (addendum #3) ──────────────────

export interface RollbackSurvivabilityRow {
  readonly archetype_id: string;
  readonly archetype_name: string;
  readonly rollback_chain_source_phase:
    | 'phase_15_mutation' | 'phase_21_runtime'
    | 'phase_22_topology' | 'phase_23_execution_substrate' | 'none';
  readonly rollback_steps_count: number;
  readonly inherited_confidence: Readonly<{
    readonly score: number;
    readonly drivers: ReadonlyArray<string>;
  }>;
  readonly uncertainty_bounds: Readonly<{
    readonly low: number;
    readonly expected: number;
    readonly high: number;
  }>;
  readonly deterministic_hash: string;
}

export interface RollbackSurvivabilityComparison {
  readonly comparison_id: string;
  readonly organization_id: string;
  readonly rows: ReadonlyArray<RollbackSurvivabilityRow>;
  readonly engine_never_ranks: true;                          // typed-as-true
  readonly heuristic_only: true;                              // typed-as-true
  readonly survivability_hash: string;
  readonly built_at: string;
}

// ─── ContinuityTradeoffProfile (addendum #4) ────────────────────────

export interface ContinuityTradeoffRow {
  readonly archetype_id: string;
  readonly archetype_name: string;
  readonly estimated_duration_ms: number;
  readonly estimated_strain_pressure: number;                 // 0–100
  readonly estimated_replay_amplification: number;            // 0–100
  readonly estimated_topology_strain: number;                 // 0–100
  readonly uncertainty_bounds: Readonly<{
    readonly low: number;
    readonly expected: number;
    readonly high: number;
  }>;
  readonly deterministic_hash: string;
}

export interface ContinuityTradeoffProfile {
  readonly profile_id: string;
  readonly organization_id: string;
  readonly rows: ReadonlyArray<ContinuityTradeoffRow>;
  readonly heuristic_only: true;                              // typed-as-true
  readonly engine_never_ranks: true;                          // typed-as-true
  readonly tradeoff_hash: string;
  readonly built_at: string;
}

// ─── RecoveryArchaeologyReplayTrace (addendum #5) ───────────────────

export interface RecoveryArchaeologyReplayTrace {
  readonly trace_id: string;
  readonly organization_id: string;
  readonly archetype_count: number;
  readonly governance_attribution_count: number;
  readonly finality_proof_count: number;
  readonly sequencing_count: number;
  readonly forecast_count: number;
  readonly pressure_sample_count: number;
  readonly archaeology_hash: string;                          // composite of phase 29 store hashes
  readonly read_only: true;                                   // typed-as-true: structural
  readonly cross_phase_archaeology: false;                    // typed-as-false: scope is Phase 29-only
  readonly built_at: string;
}

// ─── StabilizationGuidanceSurface (addendum #6) ─────────────────────

export interface StabilizationGuidanceBlock {
  readonly block_id: string;
  readonly archetype_id?: string;                              // optional — cross-archetype guidance
  readonly template_id: string;
  readonly rendered_text: string;
  readonly citations: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase | 'phase_29_stabilization' | 'phase_30_foresight';
  }>;
  readonly deterministic_hash: string;
}

export interface StabilizationGuidanceSurface {
  readonly guidance_id: string;
  readonly organization_id: string;
  readonly blocks: ReadonlyArray<StabilizationGuidanceBlock>;
  readonly advisory_only: true;                                // typed-as-true: structural
  readonly engine_never_ranks: true;                           // typed-as-true: structural
  readonly built_at: string;
}

// ─── DecisionGovernanceAttribution (addendum #7) ────────────────────

export type DecisionGovernanceDecision = 'permitted' | 'rejected' | 'flagged';

export type DecisionSupervisorRule =
  | 'organization_id_missing'
  | 'cross_org_attempted'
  | 'forbidden_foresight_action'
  | 'archetype_id_missing'
  | 'archetype_not_found'
  | 'operator_mediation_required_violated';

export interface DecisionGovernanceAttribution {
  readonly attribution_id: string;
  readonly organization_id: string;
  readonly comparison_id?: string;
  readonly operator_id: string;
  readonly decision: DecisionGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: DecisionSupervisorRule;
  readonly operator_mediation_required: true;                 // typed-as-true
  readonly recorded_at: string;
  readonly deterministic_hash: string;
}

// ─── StabilizationDecisionReplayTrace (addendum #8) ─────────────────

export interface StabilizationDecisionReplayTrace {
  readonly trace_id: string;
  readonly organization_id: string;
  readonly comparison_hash: string;
  readonly survivability_hash: string;
  readonly tradeoff_hash: string;
  readonly archaeology_hash: string;
  readonly composite_replay_hash: string;
  readonly built_at: string;
}

// ─── RecoveryNarrativeWalkthrough (addendum #9, Phase 24 inheritance) ─

export interface RecoveryNarrativeWalkthroughBlock {
  readonly block_id: string;
  readonly archetype_id?: string;
  readonly template_id: string;
  readonly rendered_text: string;
  readonly citations: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase | 'phase_29_stabilization' | 'phase_30_foresight';
  }>;
  readonly deterministic_hash: string;
}

export interface RecoveryNarrativeWalkthrough {
  readonly walkthrough_id: string;
  readonly organization_id: string;
  readonly archetype_ids: ReadonlyArray<string>;               // included archetypes
  readonly blocks: ReadonlyArray<RecoveryNarrativeWalkthroughBlock>;
  readonly built_at: string;
}

// ─── DecisionBoundaryProofChain (addendum #11) ──────────────────────

export interface DecisionBoundaryProofChain {
  readonly comparison_hash: string;
  readonly survivability_hash: string;
  readonly tradeoff_hash: string;
  readonly archaeology_hash: string;
  readonly replay_hash: string;
}

// ─── DecisionReplayDeterminismAttribution (addendum #12) ────────────

export interface DecisionReplayDeterminismAttribution {
  readonly comparison_hash: string;
  readonly survivability_hash: string;
  readonly tradeoff_hash: string;
  readonly archaeology_hash: string;
  readonly replay_hash: string;
  readonly deterministic_composite_hash: string;
  readonly recorded_at: string;
}

// ─── Operator addendum #9 — ComparisonNeutralityProof ────────────────

/**
 * Operators verify the comparison engine remained STRUCTURALLY NEUTRAL.
 * No ranking, no aggregate scoring, no recommended_archetype.
 */
export interface ComparisonNeutralityProof {
  readonly comparison_id: string;
  readonly engine_never_ranks: true;                          // typed-as-true
  readonly no_aggregate_score: true;                          // typed-as-true
  readonly no_selected_archetype: true;                       // typed-as-true
  readonly deterministic_hash: string;
  readonly recorded_at: string;
}

// ─── Operator addendum #10 — RecoveryForesightDeterminismBounds ──────

/**
 * Operators verify same stabilization inputs == same comparison outputs.
 * Five-hash bounds.
 */
export interface RecoveryForesightDeterminismBounds {
  readonly comparison_hash: string;
  readonly replay_hash: string;
  readonly archaeology_hash: string;
  readonly tradeoff_hash: string;
  readonly deterministic_composite_hash: string;
  readonly recorded_at: string;
}

// ─── Operator addendum #11 — DecisionVisibilityAttribution ──────────

/**
 * Operators understand WHY each stabilization path appeared exactly as
 * shown. Surfaces what metrics + tradeoffs + uncertainty were
 * displayed.
 */
export interface DecisionVisibilityAttribution {
  readonly archetype_id: string;
  readonly surfaced_metrics: ReadonlyArray<string>;            // e.g., ['duration_ms', 'strain_pressure']
  readonly surfaced_tradeoffs: ReadonlyArray<string>;
  readonly surfaced_uncertainty: ReadonlyArray<string>;
  readonly governance_visibility_verified: boolean;
  readonly deterministic_hash: string;
  readonly recorded_at: string;
}

// ─── Trust surface ──────────────────────────────────────────────────

export interface RecoveryForesightTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;
    readonly score: number;
    readonly inherited_from_phase: CompressionSourcePhase | 'phase_29_stabilization' | 'phase_30_foresight';
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;
  readonly built_at: string;
}

// ─── Visibility composite ───────────────────────────────────────────

export interface RecoveryForesightVisibilityReplay {
  readonly organization_id: string;
  readonly recent_comparisons: ReadonlyArray<StabilizationDecisionComparisonProfile>;
  readonly recent_survivability: ReadonlyArray<RollbackSurvivabilityComparison>;
  readonly recent_tradeoffs: ReadonlyArray<ContinuityTradeoffProfile>;
  readonly recent_archaeology: ReadonlyArray<RecoveryArchaeologyReplayTrace>;
  readonly recent_walkthroughs: ReadonlyArray<RecoveryNarrativeWalkthrough>;
  readonly recent_governance: ReadonlyArray<DecisionGovernanceAttribution>;
  readonly current_foresight_tier: DecisionForesightTier;
  readonly trust_surface: RecoveryForesightTrustSurface;
  readonly built_at: string;
}

// ─── Replay bundle ──────────────────────────────────────────────────

export interface RecoveryForesightReplayBundle {
  readonly organization_id: string;
  readonly recent_traces: ReadonlyArray<StabilizationDecisionReplayTrace>;
  readonly determinism_attribution: DecisionReplayDeterminismAttribution;
  readonly determinism_bounds: RecoveryForesightDeterminismBounds;
  readonly boundary_proof_chain: DecisionBoundaryProofChain;
  readonly built_at: string;
}

// ─── Health surface ─────────────────────────────────────────────────

export interface RecoveryForesightHealthScores {
  readonly comparison_neutrality: number;                      // structural — always 100
  readonly survivability_visibility: number;
  readonly tradeoff_clarity: number;
  readonly archaeology_integrity: number;
  readonly guidance_advisory_safety: number;                   // structural — always 100
  readonly decision_governance_trust: number;                  // structural — always 100
}

export interface RecoveryForesightSummarySnapshot {
  readonly node_id: string;
  readonly recent_comparisons_24h: number;
  readonly recent_survivability_24h: number;
  readonly recent_tradeoffs_24h: number;
  readonly recent_archaeology_24h: number;
  readonly recent_walkthroughs_24h: number;
  readonly recent_governance_decisions_24h: number;
  readonly current_foresight_tier: DecisionForesightTier;
  readonly health_scores: RecoveryForesightHealthScores;
  readonly last_updated: string;
}

// ─── Forbidden registry types (addendum #13) ────────────────────────

export type ForbiddenForesightActionKind =
  | 'autonomous_recovery_selection'
  | 'automatic_archetype_ranking'
  | 'probabilistic_stabilization_weighting'
  | 'dynamic_recovery_prioritization'
  | 'cross_org_decision_propagation'
  | 'self_evolving_decision_guidance'
  | 'hidden_recovery_weighting'
  | 'operator_replacing_stabilization_logic'
  | 'decision_optimization';

export interface ForbiddenForesightActionRegistry {
  readonly forbidden_actions: ReadonlyArray<ForbiddenForesightActionKind>;
  readonly forbidden_explanations: Readonly<Record<ForbiddenForesightActionKind, string>>;
  readonly registry_hash: string;
}

// ─── Architectural caps ─────────────────────────────────────────────

export const MAX_COMPARISONS_PER_PARTITION = 200;
export const MAX_SURVIVABILITY_PER_PARTITION = 200;
export const MAX_TRADEOFFS_PER_PARTITION = 200;
export const MAX_ARCHAEOLOGY_PER_PARTITION = 200;
export const MAX_WALKTHROUGHS_PER_PARTITION = 100;
export const MAX_GUIDANCE_PER_PARTITION = 100;
export const MAX_GOVERNANCE_PER_PARTITION = 200;
export const MAX_REPLAY_TRACES_PER_PARTITION = 200;
export const FORESIGHT_CONFIDENCE_CAP = 80;                    // heuristic humility
export const COMPARISON_TIER_CONFIDENCE_THRESHOLD = 70;       // for 'clear' tier
