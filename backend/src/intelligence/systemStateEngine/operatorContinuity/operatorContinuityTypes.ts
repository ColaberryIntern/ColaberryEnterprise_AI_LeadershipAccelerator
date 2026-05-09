/**
 * operatorContinuityTypes — Phase 32. All types for the replay-safe
 * multi-operator governance continuity substrate.
 *
 * Architectural commitment (per stress-test + 4 required additions):
 *   - Multi-operator continuity is HANDOFF + TRANSFER + TIMELINE +
 *     ARCHAEOLOGY + REPLAY + COMPRESS + NARRATE.
 *   - It is NOT operator ranking / behavioral inference / collaboration
 *     scoring / capability prediction / adaptive routing / organizational
 *     behavioral intelligence.
 *   - Handoff = typed event, NOT trust transfer. The receiving operator
 *     inherits CONTEXT (read-only references), NEVER authority. Phase 27
 *     + Phase 28 + Phase 29 gates run independently on every action
 *     after the handoff. `authority_transfer_supported: false` typed-
 *     as-literal on every handoff profile.
 *   - The shared stabilization timeline is a VIEW over Phase 31's
 *     existing event log, NOT a parallel mutation surface.
 *   - Population is operator-mediated POST only. NEVER infers handoffs
 *     from observed Phase 31 events.
 *   - Cross-organization isolation is ABSOLUTE.
 */

import type { CompressionSourcePhase } from '../cognitiveCompression/cognitiveCompressionTypes';

// ─── 5-tier classifications ─────────────────────────────────────────

/**
 * Continuity density tier — descriptive aggregate over per-org handoff
 * count. Descriptive only, NOT a quality/effectiveness signal.
 */
export type HandoffDensityTier =
  | 'silent' | 'sparse' | 'paired' | 'frequent' | 'continuous';

/** Handoff lifecycle states. */
export type HandoffLifecycleState =
  | 'started' | 'acknowledged' | 'completed' | 'declined' | 'expired';

/** Handoff event kinds (operator-mediated POST only). */
export type HandoffEventKind =
  | 'handoff_started'
  | 'handoff_acknowledged'
  | 'handoff_completed'
  | 'handoff_declined'
  | 'handoff_expired';

// ─── Handoff event finality proof (addendum #13) ────────────────────

export interface HandoffEventFinalityProof {
  readonly event_id: string;
  readonly recorded_at: string;
  readonly cannot_be_modified: true;                       // typed-as-true
  readonly cannot_be_deleted: true;                        // typed-as-true
  readonly replayable: true;                               // typed-as-true
  readonly finality_hash: string;
}

// ─── GovernanceHandoffProfile (addendum #1) ─────────────────────────

/**
 * GovernanceHandoffProfile — typed handoff event with from/to/timestamp/
 * context_summary/lifecycle/finality_proof.
 *
 * `authority_transfer_supported: false` typed-as-literal — the receiving
 * operator inherits CONTEXT only, NEVER authority. Phase 27 + 28 + 29
 * gates still run independently on every action after the handoff.
 */
export interface GovernanceHandoffProfile {
  readonly handoff_id: string;
  readonly organization_id: string;
  readonly from_operator_id: string;
  readonly to_operator_id: string;
  readonly lifecycle_state: HandoffLifecycleState;
  readonly started_at: string;
  readonly acknowledged_at?: string;
  readonly completed_at?: string;
  readonly declined_at?: string;
  readonly expired_at?: string;
  readonly context_summary: string;
  readonly reason: string;
  readonly source_session_id?: string;                     // Phase 31 session id
  readonly transfer_bundle_id?: string;                    // Phase 32 transfer bundle id
  readonly authority_transfer_supported: false;            // typed-as-false: structural
  readonly engine_never_ranks: true;                       // typed-as-true: structural
  readonly deterministic_hash: string;
  readonly finality_proof: HandoffEventFinalityProof;
}

// ─── ContinuityTransferBundle (addendum #3) ─────────────────────────

/**
 * ContinuityTransferBundle — read-only references to Phase 27/29/30/31
 * entities the from-operator wants to surface for the to-operator.
 * Purely informational; `grants_authority: false` typed-as-literal.
 */
export interface ContinuityTransferBundle {
  readonly transfer_bundle_id: string;
  readonly organization_id: string;
  readonly from_operator_id: string;
  readonly to_operator_id: string;
  readonly built_at: string;
  readonly references: Readonly<{
    readonly phase_27_envelope_ids: ReadonlyArray<string>;
    readonly phase_29_archetype_ids: ReadonlyArray<string>;
    readonly phase_30_comparison_ids: ReadonlyArray<string>;
    readonly phase_31_session_ids: ReadonlyArray<string>;
    readonly phase_31_event_ids: ReadonlyArray<string>;
  }>;
  readonly grants_authority: false;                        // typed-as-false: structural
  readonly read_only: true;                                // typed-as-true: structural
  readonly engine_never_ranks: true;                       // typed-as-true: structural
  readonly transfer_hash: string;
}

// ─── SharedStabilizationTimeline (addendum #4) ──────────────────────

/**
 * SharedStabilizationTimeline — read-only chronological VIEW over
 * Phase 31 events filtered to handoff lineage + co-occurring activity.
 * NOT a parallel mutation surface.
 */
export interface SharedStabilizationTimelinePoint {
  readonly recorded_at: string;
  readonly event_kind: string;
  readonly operator_id: string;
  readonly session_id: string;
  readonly handoff_id?: string;                            // when this timeline point coincides with a handoff
  readonly subject_kind?: string;
  readonly subject_id?: string;
  readonly deterministic_hash: string;
}

export interface SharedStabilizationTimeline {
  readonly organization_id: string;
  readonly points: ReadonlyArray<SharedStabilizationTimelinePoint>;
  readonly handoff_count: number;
  readonly read_only: true;                                // typed-as-true: structural
  readonly engine_never_ranks: true;                       // typed-as-true: structural
  readonly derived_from_phase_31: true;                    // typed-as-true: structural
  readonly window_start?: string;
  readonly window_end?: string;
  readonly timeline_hash: string;
  readonly built_at: string;
}

// ─── OperatorHandoffArchaeologyReplay (addendum #5) ─────────────────

export interface OperatorHandoffArchaeologyReplay {
  readonly organization_id: string;
  readonly total_handoffs: number;
  readonly handoffs_by_lifecycle: Readonly<Record<HandoffLifecycleState, number>>;
  readonly distinct_from_operator_count: number;
  readonly distinct_to_operator_count: number;
  readonly oldest_handoff_at?: string;
  readonly newest_handoff_at?: string;
  readonly read_only: true;                                // typed-as-true
  readonly bounded_to_organization: true;                  // typed-as-true
  readonly engine_never_ranks: true;                       // typed-as-true
  readonly archaeology_hash: string;
  readonly built_at: string;
}

// ─── CollaborativeContinuityReplay (addendum #6) ────────────────────

export interface CollaborativeContinuityReplay {
  readonly organization_id: string;
  readonly handoffs_replayed: number;
  readonly transfer_bundles_replayed: number;
  readonly oldest_handoff_at?: string;
  readonly newest_handoff_at?: string;
  readonly replay_window_ms?: number;
  readonly handoff_count_by_kind: Readonly<Record<HandoffEventKind, number>>;
  readonly deterministic: true;                            // typed-as-true
  readonly read_only: true;                                // typed-as-true
  readonly replay_hash: string;
  readonly built_at: string;
}

// ─── HandoffGovernanceAttribution (addendum #7) ─────────────────────

export type HandoffGovernanceDecision = 'permitted' | 'rejected' | 'flagged';

export type HandoffGovernanceSupervisorRule =
  | 'organization_id_missing'
  | 'from_operator_id_missing'
  | 'to_operator_id_missing'
  | 'cross_org_attempted'
  | 'forbidden_handoff_action'
  | 'handoff_id_not_found'
  | 'handoff_already_terminal'
  | 'self_handoff_attempted'
  | 'operator_mediation_required_violated';

export interface HandoffGovernanceAttribution {
  readonly attribution_id: string;
  readonly organization_id: string;
  readonly handoff_id?: string;
  readonly from_operator_id: string;
  readonly to_operator_id?: string;
  readonly decision: HandoffGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: HandoffGovernanceSupervisorRule;
  readonly operator_mediation_required: true;              // typed-as-true: structural
  readonly no_operator_ranking: true;                      // typed-as-true: structural
  readonly no_collaboration_scoring: true;                 // typed-as-true: structural
  readonly recorded_at: string;
  readonly deterministic_hash: string;
}

// ─── ContinuityTransferNarrative (addendum #8, Phase 24 inheritance) ─

export interface ContinuityTransferNarrativeBlock {
  readonly block_id: string;
  readonly template_id: string;
  readonly rendered_text: string;
  readonly citations: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase:
      | CompressionSourcePhase
      | 'phase_29_stabilization'
      | 'phase_30_foresight'
      | 'phase_31_memory'
      | 'phase_32_handoff';
  }>;
  readonly deterministic_hash: string;
}

export interface ContinuityTransferNarrative {
  readonly narrative_id: string;
  readonly organization_id: string;
  readonly blocks: ReadonlyArray<ContinuityTransferNarrativeBlock>;
  readonly built_at: string;
}

// ─── OperatorCoordinationCompression (addendum #9, #10) ─────────────

/**
 * CoordinationCompressionOmissionAttribution — when compression drops
 * handoffs, the engine MUST surface what was dropped. No silent
 * compression. Even an empty omission attribution is required so
 * operators can verify the compression was lossless.
 */
export interface CoordinationCompressionOmissionAttribution {
  readonly compression_id: string;
  readonly total_handoffs_observed: number;
  readonly handoffs_retained: number;
  readonly handoffs_omitted: number;
  readonly omitted_handoff_kinds: Readonly<Record<HandoffEventKind, number>>;
  readonly omitted_handoff_ids: ReadonlyArray<string>;
  readonly compression_window_start?: string;
  readonly compression_window_end?: string;
  readonly lossless: boolean;
  readonly bounded_reason: string;
  readonly deterministic_hash: string;
}

export interface OperatorCoordinationCompression {
  readonly compression_id: string;
  readonly organization_id: string;
  readonly summary_blocks: ReadonlyArray<{
    readonly block_id: string;
    readonly handoff_kind: HandoffEventKind;
    readonly aggregated_count: number;
    readonly representative_handoff_ids: ReadonlyArray<string>;
    readonly deterministic_hash: string;
  }>;
  readonly omission_attribution: CoordinationCompressionOmissionAttribution;
  readonly compression_hash: string;
  readonly built_at: string;
}

// ─── HandoffBoundaryProofChain (addendum #11) ───────────────────────

export interface HandoffBoundaryProofChain {
  readonly handoff_hash: string;
  readonly transfer_hash: string;
  readonly timeline_hash: string;
  readonly archaeology_hash: string;
  readonly replay_hash: string;
}

// ─── HandoffReplayDeterminismAttribution (addendum #12) ─────────────

export interface HandoffReplayDeterminismAttribution {
  readonly handoff_hash: string;
  readonly transfer_hash: string;
  readonly timeline_hash: string;
  readonly archaeology_hash: string;
  readonly replay_hash: string;
  readonly deterministic_composite_hash: string;
  readonly recorded_at: string;
}

// ─── HandoffReplayNeutralityProof (addendum #14, operator addition) ─

/**
 * HandoffReplayNeutralityProof — operators verify the handoff engine
 * remained STRUCTURALLY NEUTRAL: no operator ranking, no collaboration
 * scoring, no behavioral inference, no capability prediction.
 */
export interface HandoffReplayNeutralityProof {
  readonly continuity_id: string;
  readonly no_operator_ranking: true;                      // typed-as-true
  readonly no_collaboration_scoring: true;                 // typed-as-true
  readonly no_behavioral_inference: true;                  // typed-as-true
  readonly no_capability_prediction: true;                 // typed-as-true
  readonly deterministic_hash: string;
  readonly recorded_at: string;
}

// ─── ContinuityTransferDeterminismBounds (operator addition #7) ─────

/**
 * ContinuityTransferDeterminismBounds — operators verify same continuity
 * inputs == same continuity outputs. 5-hash bounds.
 */
export interface ContinuityTransferDeterminismBounds {
  readonly transfer_hash: string;
  readonly replay_hash: string;
  readonly archaeology_hash: string;
  readonly timeline_hash: string;
  readonly deterministic_composite_hash: string;
  readonly recorded_at: string;
}

// ─── CollaborativeVisibilityAttribution (operator addition #8) ──────

/**
 * CollaborativeVisibilityAttribution — operators understand WHY each
 * continuity surface appeared exactly as shown.
 */
export interface CollaborativeVisibilityAttribution {
  readonly continuity_id: string;
  readonly surfaced_references: ReadonlyArray<string>;
  readonly surfaced_archaeology: ReadonlyArray<string>;
  readonly surfaced_timeline_events: ReadonlyArray<string>;
  readonly surfaced_compression_omissions: ReadonlyArray<string>;
  readonly deterministic_hash: string;
  readonly recorded_at: string;
}

// ─── Trust surface ──────────────────────────────────────────────────

export interface OperatorContinuityTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;
    readonly score: number;
    readonly inherited_from_phase:
      | CompressionSourcePhase
      | 'phase_29_stabilization'
      | 'phase_30_foresight'
      | 'phase_31_memory'
      | 'phase_32_handoff';
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;
  readonly built_at: string;
}

// ─── Visibility composite + replay bundle ───────────────────────────

export interface OperatorContinuityVisibilityReplay {
  readonly organization_id: string;
  readonly recent_handoffs: ReadonlyArray<GovernanceHandoffProfile>;
  readonly recent_transfer_bundles: ReadonlyArray<ContinuityTransferBundle>;
  readonly recent_timeline: SharedStabilizationTimeline;
  readonly recent_archaeology: OperatorHandoffArchaeologyReplay;
  readonly recent_narratives: ReadonlyArray<ContinuityTransferNarrative>;
  readonly recent_governance: ReadonlyArray<HandoffGovernanceAttribution>;
  readonly current_density_tier: HandoffDensityTier;
  readonly trust_surface: OperatorContinuityTrustSurface;
  readonly built_at: string;
}

export interface OperatorContinuityReplayBundle {
  readonly organization_id: string;
  readonly determinism_attribution: HandoffReplayDeterminismAttribution;
  readonly determinism_bounds: ContinuityTransferDeterminismBounds;
  readonly boundary_proof_chain: HandoffBoundaryProofChain;
  readonly built_at: string;
}

// ─── Health surface ─────────────────────────────────────────────────

export interface OperatorContinuityHealthScores {
  readonly handoff_neutrality: number;                     // structural — always 100
  readonly transfer_lineage_integrity: number;
  readonly timeline_visibility: number;
  readonly archaeology_integrity: number;                  // structural — always 100
  readonly compression_transparency: number;               // structural — always 100
  readonly replay_determinism: number;                     // structural — always 100
}

export interface OperatorContinuitySummarySnapshot {
  readonly node_id: string;
  readonly recent_handoffs_24h: number;
  readonly recent_transfer_bundles_24h: number;
  readonly recent_archaeology_24h: number;
  readonly recent_replays_24h: number;
  readonly recent_compressions_24h: number;
  readonly recent_narratives_24h: number;
  readonly recent_governance_decisions_24h: number;
  readonly current_density_tier: HandoffDensityTier;
  readonly health_scores: OperatorContinuityHealthScores;
  readonly last_updated: string;
}

// ─── Forbidden registry types (addendum #15) ────────────────────────

export type ForbiddenHandoffActionKind =
  | 'operator_ranking'
  | 'behavioral_operator_inference'
  | 'collaboration_scoring'
  | 'operator_trust_weighting'
  | 'organizational_behavioral_intelligence'
  | 'adaptive_operator_routing'
  | 'operator_capability_prediction'
  | 'cross_org_cognition_sharing'
  | 'hidden_collaboration_weighting'
  | 'operator_capability_inference'
  | 'autonomous_handoff_routing';

export interface ForbiddenHandoffActionRegistry {
  readonly forbidden_actions: ReadonlyArray<ForbiddenHandoffActionKind>;
  readonly forbidden_explanations: Readonly<Record<ForbiddenHandoffActionKind, string>>;
  readonly registry_hash: string;
}

// ─── Architectural caps ─────────────────────────────────────────────

export const MAX_HANDOFFS_PER_PARTITION = 500;
export const MAX_TRANSFER_BUNDLES_PER_PARTITION = 500;
export const MAX_ARCHAEOLOGY_PER_PARTITION = 200;
export const MAX_REPLAYS_PER_PARTITION = 200;
export const MAX_COMPRESSIONS_PER_PARTITION = 200;
export const MAX_NARRATIVES_PER_PARTITION = 100;
export const MAX_GOVERNANCE_PER_PARTITION = 200;
export const MAX_REFERENCES_PER_BUNDLE = 50;
export const MAX_CONTEXT_SUMMARY_LENGTH = 1000;
export const HANDOFF_TTL_MS = 24 * 60 * 60_000;            // 24h auto-expire
export const DENSITY_SILENT_THRESHOLD = 1;                 // < 1 = silent
export const DENSITY_SPARSE_THRESHOLD = 5;
export const DENSITY_PAIRED_THRESHOLD = 25;
export const DENSITY_FREQUENT_THRESHOLD = 100;
