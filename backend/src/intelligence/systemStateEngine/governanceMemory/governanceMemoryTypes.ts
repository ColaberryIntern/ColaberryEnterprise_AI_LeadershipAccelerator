/**
 * governanceMemoryTypes — Phase 31. All types for the replay-safe
 * governance memory and cognition continuity substrate.
 *
 * Architectural commitment (per stress-test):
 *   - Memory ≠ profiling. Records WHAT happened (timestamps + actions
 *     + outcomes — objective facts). NEVER infers WHO the operator is,
 *     what they prefer, or what they're likely to do next.
 *   - Per-organization append-only event log. Operators can filter by
 *     `operator_id` at read time, but the engine never derives behavior.
 *     NO per-operator confidence score, NO behavioral pattern field,
 *     NO operator-specific recommendations.
 *   - Population is operator-mediated POST only. Phase 31 never
 *     listens autonomously to Phase 14-30 events.
 *   - Append-only — events are immutable once recorded. Each event
 *     carries a `MemoryEventFinalityProof` with `cannot_be_modified` +
 *     `cannot_be_deleted` typed-as-literal.
 *   - Compression always emits `ReasoningCompressionOmissionAttribution`
 *     — no silent compression. Even a "no omissions" attribution is
 *     required so operators can verify the compression was lossless.
 *   - Cross-organization isolation is ABSOLUTE.
 *   - Narratives are PHASE 24-COMPLIANT.
 */

import type { CompressionSourcePhase } from '../cognitiveCompression/cognitiveCompressionTypes';

// ─── 5-tier classifications ─────────────────────────────────────────

/**
 * MemoryDensityTier — classification of how much memory has accumulated
 * for an organization. Descriptive only; NOT a ranking signal.
 */
export type MemoryDensityTier =
  | 'sparse' | 'partial' | 'developed' | 'dense' | 'compressed';

/** Session lifecycle states. */
export type StabilizationSessionLifecycle =
  | 'opened' | 'active' | 'closed' | 'expired';

/** Event kinds that operators can record in the timeline. */
export type StabilizationSessionEventKind =
  | 'session_opened'
  | 'archetype_viewed'
  | 'comparison_built'
  | 'survivability_reviewed'
  | 'tradeoff_reviewed'
  | 'archaeology_replayed'
  | 'walkthrough_generated'
  | 'guidance_built'
  | 'governance_evaluated'
  | 'archetype_applied'
  | 'session_closed'
  | 'note_recorded';

// ─── Stabilization session events (addendum #2, #3) ─────────────────

export interface StabilizationSessionEvent {
  readonly event_id: string;
  readonly session_id: string;
  readonly organization_id: string;
  readonly operator_id: string;                                // recorded for audit; NEVER used for derivation
  readonly event_kind: StabilizationSessionEventKind;
  readonly recorded_at: string;
  readonly subject_kind?: string;                              // e.g., 'archetype' / 'comparison'
  readonly subject_id?: string;                                // hash or id of the referenced entity
  readonly note?: string;                                      // operator-supplied context (free text)
  readonly deterministic_hash: string;
  readonly finality_proof: MemoryEventFinalityProof;
}

export interface StabilizationSessionTimeline {
  readonly organization_id: string;
  readonly events: ReadonlyArray<StabilizationSessionEvent>;
  readonly read_only: true;                                    // typed-as-true: structural
  readonly append_only: true;                                  // typed-as-true: structural
  readonly engine_never_profiles: true;                        // typed-as-true: structural
  readonly timeline_hash: string;
  readonly built_at: string;
}

// ─── Operator continuity profile (addendum #1) ──────────────────────

/**
 * OperatorContinuityProfile — per-organization aggregate of session
 * + event activity. Exposes counters + filterable events. NEVER:
 *   - per-operator confidence score
 *   - derived behavioral pattern field
 *   - operator-specific recommendations
 *   - operator ranking
 */
export interface OperatorContinuityProfile {
  readonly organization_id: string;
  readonly total_sessions: number;
  readonly active_sessions: number;
  readonly closed_sessions: number;
  readonly total_events: number;
  readonly events_by_kind: Readonly<Record<StabilizationSessionEventKind, number>>;
  readonly distinct_operator_count: number;                    // count only, NO per-operator data
  readonly distinct_operator_ids: ReadonlyArray<string>;       // raw list, no derived attributes
  readonly engine_never_profiles: true;                        // typed-as-true: structural
  readonly density_tier: MemoryDensityTier;
  readonly profile_hash: string;
  readonly built_at: string;
}

// ─── Session record ─────────────────────────────────────────────────

export interface StabilizationSession {
  readonly session_id: string;
  readonly organization_id: string;
  readonly operator_id: string;
  readonly opened_at: string;
  readonly closed_at?: string;
  readonly lifecycle_state: StabilizationSessionLifecycle;
  readonly note?: string;
  readonly deterministic_hash: string;
}

// ─── Governance archaeology (addendum #4) ───────────────────────────

export interface GovernanceArchaeologyReplay {
  readonly organization_id: string;
  readonly source_phase_summaries: Readonly<{
    readonly phase_27_envelope_count: number;
    readonly phase_27_governance_attribution_count: number;
    readonly phase_28_quota_governance_count: number;
    readonly phase_28_quota_exhaustion_count: number;
    readonly phase_29_governance_attribution_count: number;
    readonly phase_29_finality_proof_count: number;
    readonly phase_30_comparison_count: number;
    readonly phase_30_walkthrough_count: number;
    readonly phase_30_governance_count: number;
  }>;
  readonly read_only: true;                                    // typed-as-true: structural
  readonly cross_phase_archaeology: true;                      // typed-as-true: covers Phase 14-30
  readonly bounded_to_organization: true;                      // typed-as-true: org-local
  readonly archaeology_hash: string;
  readonly built_at: string;
}

// ─── Reasoning continuity replay (addendum #5) ──────────────────────

export interface ReasoningContinuityReplay {
  readonly organization_id: string;
  readonly events_replayed: number;
  readonly sessions_replayed: number;
  readonly oldest_event_recorded_at?: string;
  readonly newest_event_recorded_at?: string;
  readonly replay_window_ms?: number;
  readonly event_count_by_kind: Readonly<Record<StabilizationSessionEventKind, number>>;
  readonly deterministic: true;                                // typed-as-true: structural
  readonly read_only: true;                                    // typed-as-true: structural
  readonly replay_hash: string;
  readonly built_at: string;
}

// ─── Cognition timeline surface (addendum #6) ───────────────────────

export interface CognitionTimelinePoint {
  readonly recorded_at: string;
  readonly event_kind: StabilizationSessionEventKind;
  readonly subject_kind?: string;
  readonly subject_id?: string;
  readonly operator_id: string;
  readonly session_id: string;
  readonly deterministic_hash: string;
}

export interface CognitionTimelineSurface {
  readonly organization_id: string;
  readonly points: ReadonlyArray<CognitionTimelinePoint>;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly read_only: true;                                    // typed-as-true: structural
  readonly engine_never_ranks: true;                           // typed-as-true: structural
  readonly timeline_surface_hash: string;
  readonly built_at: string;
}

// ─── Governance memory attribution (addendum #7) ────────────────────

export type GovernanceMemoryDecision = 'permitted' | 'rejected' | 'flagged';

export type GovernanceMemorySupervisorRule =
  | 'organization_id_missing'
  | 'operator_id_missing'
  | 'cross_org_attempted'
  | 'session_id_not_found'
  | 'session_already_closed'
  | 'forbidden_memory_action'
  | 'operator_mediation_required_violated'
  | 'event_kind_invalid';

export interface GovernanceMemoryAttribution {
  readonly attribution_id: string;
  readonly organization_id: string;
  readonly session_id?: string;
  readonly operator_id: string;
  readonly decision: GovernanceMemoryDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: GovernanceMemorySupervisorRule;
  readonly operator_mediation_required: true;                  // typed-as-true: structural
  readonly no_operator_profiling: true;                        // typed-as-true: structural
  readonly recorded_at: string;
  readonly deterministic_hash: string;
}

// ─── Continuity narrative (addendum #8, Phase 24 inheritance) ───────

export interface ContinuityNarrativeBlock {
  readonly block_id: string;
  readonly template_id: string;
  readonly rendered_text: string;
  readonly citations: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase | 'phase_29_stabilization' | 'phase_30_foresight' | 'phase_31_memory';
  }>;
  readonly deterministic_hash: string;
}

export interface ContinuityNarrative {
  readonly narrative_id: string;
  readonly organization_id: string;
  readonly blocks: ReadonlyArray<ContinuityNarrativeBlock>;
  readonly built_at: string;
}

// ─── Reasoning compression + omission attribution (addendum #9, #10) ─

/**
 * ReasoningCompressionOmissionAttribution — when compression drops
 * events, the engine MUST surface what was dropped. No silent
 * compression. Even an empty omission attribution is required so
 * operators can verify the compression was lossless.
 */
export interface ReasoningCompressionOmissionAttribution {
  readonly compression_id: string;
  readonly total_events_observed: number;
  readonly events_retained: number;
  readonly events_omitted: number;
  readonly omitted_event_kinds: Readonly<Record<StabilizationSessionEventKind, number>>;
  readonly omitted_session_ids: ReadonlyArray<string>;
  readonly compression_window_start?: string;
  readonly compression_window_end?: string;
  readonly lossless: boolean;
  readonly bounded_reason: string;
  readonly deterministic_hash: string;
}

export interface OperatorReasoningCompression {
  readonly compression_id: string;
  readonly organization_id: string;
  readonly summary_blocks: ReadonlyArray<{
    readonly block_id: string;
    readonly event_kind: StabilizationSessionEventKind;
    readonly aggregated_count: number;
    readonly representative_session_ids: ReadonlyArray<string>;
    readonly deterministic_hash: string;
  }>;
  readonly omission_attribution: ReasoningCompressionOmissionAttribution;
  readonly compression_hash: string;
  readonly built_at: string;
}

// ─── Memory boundary proof chain (addendum #11) ─────────────────────

export interface MemoryBoundaryProofChain {
  readonly continuity_hash: string;
  readonly timeline_hash: string;
  readonly archaeology_hash: string;
  readonly replay_hash: string;
  readonly compression_hash: string;
}

// ─── Memory replay determinism attribution (addendum #12) ───────────

export interface MemoryReplayDeterminismAttribution {
  readonly continuity_hash: string;
  readonly timeline_hash: string;
  readonly archaeology_hash: string;
  readonly replay_hash: string;
  readonly compression_hash: string;
  readonly deterministic_composite_hash: string;
  readonly recorded_at: string;
}

// ─── Memory event finality proof (addendum #13) ─────────────────────

/**
 * MemoryEventFinalityProof — once an event is recorded it cannot be
 * modified or deleted. Replayable forever. Append-only is structural.
 */
export interface MemoryEventFinalityProof {
  readonly event_id: string;
  readonly recorded_at: string;
  readonly cannot_be_modified: true;                           // typed-as-true
  readonly cannot_be_deleted: true;                            // typed-as-true
  readonly replayable: true;                                   // typed-as-true
  readonly finality_hash: string;
}

// ─── Memory neutrality proof (addendum #14) ─────────────────────────

/**
 * MemoryNeutralityProof — operators verify the memory engine remained
 * STRUCTURALLY NEUTRAL: no operator profiling, no behavioral
 * prediction, no operator ranking.
 */
export interface MemoryNeutralityProof {
  readonly continuity_id: string;
  readonly no_operator_profiling: true;                        // typed-as-true
  readonly no_behavioral_prediction: true;                     // typed-as-true
  readonly no_operator_ranking: true;                          // typed-as-true
  readonly deterministic_hash: string;
  readonly recorded_at: string;
}

// ─── Trust surface ──────────────────────────────────────────────────

export interface GovernanceMemoryTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;
    readonly score: number;
    readonly inherited_from_phase: CompressionSourcePhase | 'phase_29_stabilization' | 'phase_30_foresight' | 'phase_31_memory';
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;
  readonly built_at: string;
}

// ─── Visibility composite + replay bundle ───────────────────────────

export interface GovernanceMemoryVisibilityReplay {
  readonly organization_id: string;
  readonly continuity_profile: OperatorContinuityProfile;
  readonly recent_timeline_points: ReadonlyArray<CognitionTimelinePoint>;
  readonly recent_archaeology: GovernanceArchaeologyReplay;
  readonly recent_narratives: ReadonlyArray<ContinuityNarrative>;
  readonly recent_governance: ReadonlyArray<GovernanceMemoryAttribution>;
  readonly current_density_tier: MemoryDensityTier;
  readonly trust_surface: GovernanceMemoryTrustSurface;
  readonly built_at: string;
}

export interface GovernanceMemoryReplayBundle {
  readonly organization_id: string;
  readonly determinism_attribution: MemoryReplayDeterminismAttribution;
  readonly boundary_proof_chain: MemoryBoundaryProofChain;
  readonly built_at: string;
}

// ─── Health surface ─────────────────────────────────────────────────

export interface GovernanceMemoryHealthScores {
  readonly memory_neutrality: number;                          // structural — always 100
  readonly continuity_integrity: number;
  readonly timeline_visibility: number;
  readonly archaeology_integrity: number;                      // structural — always 100
  readonly compression_transparency: number;                   // structural — always 100
  readonly replay_determinism: number;                         // structural — always 100
}

export interface GovernanceMemorySummarySnapshot {
  readonly node_id: string;
  readonly recent_sessions_24h: number;
  readonly recent_events_24h: number;
  readonly recent_archaeology_24h: number;
  readonly recent_replays_24h: number;
  readonly recent_compressions_24h: number;
  readonly recent_narratives_24h: number;
  readonly recent_governance_decisions_24h: number;
  readonly current_density_tier: MemoryDensityTier;
  readonly health_scores: GovernanceMemoryHealthScores;
  readonly last_updated: string;
}

// ─── Forbidden memory action registry (addendum #15) ────────────────

export type ForbiddenMemoryActionKind =
  | 'persistent_operator_profiling'
  | 'behavioral_operator_prediction'
  | 'decision_automation'
  | 'operator_preference_inference'
  | 'adaptive_operator_steering'
  | 'cross_org_cognition_propagation'
  | 'self_evolving_governance_memory'
  | 'hidden_cognition_weighting'
  | 'operator_ranking_emission';

export interface ForbiddenMemoryActionRegistry {
  readonly forbidden_actions: ReadonlyArray<ForbiddenMemoryActionKind>;
  readonly forbidden_explanations: Readonly<Record<ForbiddenMemoryActionKind, string>>;
  readonly registry_hash: string;
}

// ─── Architectural caps ─────────────────────────────────────────────

export const MAX_SESSIONS_PER_PARTITION = 500;
export const MAX_EVENTS_PER_PARTITION = 5000;
export const MAX_EVENTS_PER_SESSION = 200;
export const MAX_ARCHAEOLOGY_PER_PARTITION = 200;
export const MAX_REPLAYS_PER_PARTITION = 200;
export const MAX_COMPRESSIONS_PER_PARTITION = 200;
export const MAX_NARRATIVES_PER_PARTITION = 100;
export const MAX_GOVERNANCE_PER_PARTITION = 200;
export const MAX_NOTE_LENGTH = 1000;
export const SESSION_TTL_MS = 8 * 60 * 60_000;                 // 8h auto-expire
export const DENSITY_SPARSE_THRESHOLD = 25;
export const DENSITY_PARTIAL_THRESHOLD = 100;
export const DENSITY_DEVELOPED_THRESHOLD = 500;
export const DENSITY_DENSE_THRESHOLD = 2000;
