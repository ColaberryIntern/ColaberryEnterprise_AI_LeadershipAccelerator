/**
 * cognitiveCompressionTypes — Phase 24. Types for deterministic
 * operational truth compression.
 *
 * Architectural commitment (per the Phase 24 stress-test):
 *   - Phase 24 COMPRESSES operational truth; it does NOT generate it.
 *   - No LLM calls anywhere. No free-form prose. Templates only.
 *   - Every block in every narrative MUST carry source_attributions[].
 *     No citations → no narrative. Empty list = generation refused.
 *   - Confidence is INHERITED from existing *ConfidenceBounds; never
 *     widened, narrowed, or invented.
 *   - Operator guidance ranks ONLY existing operator-clickable actions
 *     from Phases 21/22/23. Phase 24 changes the order, not the menu.
 */

// ─── Source phases the compressor reads from ─────────────────────────

export type CompressionSourcePhase =
  | 'phase_15_mutation'
  | 'phase_16_causality'
  | 'phase_17_calibration'
  | 'phase_18_governance_calibration'
  | 'phase_19_federation'
  | 'phase_20_federated_learning'
  | 'phase_21_runtime'
  | 'phase_22_topology'
  | 'phase_23_execution_substrate';

// ─── Narrative citation (addendum #1) ────────────────────────────────

/**
 * Every block in every narrative carries at least one citation.
 * No citation → narrative is not generated.
 */
export interface NarrativeCitation {
  readonly source_kind: string;             // e.g., 'topology_replay_attribution', 'execution_worker_envelope'
  readonly source_id: string;               // attribution row id / envelope worker_id / chain_id
  readonly source_phase: CompressionSourcePhase;
  readonly recorded_at: string;
  readonly fragment_quoted: string;         // verbatim quote of the source field rendered into the narrative
}

// ─── Narrative confidence bounds (addendum #2) ───────────────────────

/**
 * Confidence is INHERITED from existing *ConfidenceBounds. The
 * `inherited_from_*` fields make the inheritance traceable. Phase 24
 * may aggregate bounds from multiple sources by taking their min/max,
 * but never invents new values.
 */
export interface NarrativeConfidenceBounds {
  readonly low: number;                     // 0..100, inherited
  readonly high: number;                    // 0..100, inherited
  readonly drivers: ReadonlyArray<string>;  // inherited uncertainty drivers
  readonly inherited_from_source_id: string;
  readonly inherited_from_phase: CompressionSourcePhase;
  readonly aggregation_rule?: 'single_source' | 'min_low_max_high' | 'narrowest_band';
}

// ─── Narrative density tier (addendum: OperationalNarrativeTier) ─────

export type OperationalNarrativeTier =
  | 'atomic'        // 1 block, raw attribution-to-text mapping
  | 'summarized'    // 2-3 blocks, condensed
  | 'compressed'    // 4-6 blocks, multi-event summary
  | 'executive';    // 1-2 blocks, highest-level summary

// ─── Narrative compression bounds (addendum: NarrativeCompressionBounds) ─

export interface NarrativeCompressionBounds {
  readonly source_event_count: number;
  readonly rendered_block_count: number;
  readonly omitted_low_priority_events: number;
  readonly compression_ratio: number;       // rendered / source, in [0..1]
  readonly bounded_reason?: string;
}

// ─── Determinism attribution (addendum: NarrativeDeterminismAttribution) ─

export interface NarrativeDeterminismAttribution {
  readonly template_id: string;
  readonly selection_rule: string;          // which deterministic rule picked this template
  readonly rendered_from: ReadonlyArray<string>;  // ordered list of source_ids
  readonly deterministic_hash: string;      // hash of the rendered text — same inputs → same hash
  readonly replayable: boolean;
}

// ─── Narrative block ─────────────────────────────────────────────────

export interface NarrativeBlock {
  readonly block_id: string;
  readonly template_id: string;             // FK to a template in the registry
  readonly rendered_text: string;           // deterministic, never freeform
  readonly source_attributions: ReadonlyArray<NarrativeCitation>;
  readonly determinism: NarrativeDeterminismAttribution;
  readonly confidence?: NarrativeConfidenceBounds;
}

// ─── Operational narrative (top-level container) ─────────────────────

export type OperationalNarrativeKind =
  | 'execution_continuity'
  | 'rollback_event'
  | 'topology_degradation'
  | 'recovery_sequencing'
  | 'stabilization_propagation'
  | 'fragmentation_recovery'
  | 'execution_isolation'
  | 'causal_replay'
  | 'continuity_restoration';

export interface OperationalNarrative {
  readonly narrative_id: string;
  readonly organization_id: string;
  readonly kind: OperationalNarrativeKind;
  readonly tier: OperationalNarrativeTier;
  readonly blocks: ReadonlyArray<NarrativeBlock>;
  readonly compression: NarrativeCompressionBounds;
  readonly aggregate_confidence?: NarrativeConfidenceBounds;
  readonly built_at: string;
}

// ─── Causal story replay ─────────────────────────────────────────────

export interface CausalStoryReplay {
  readonly story_id: string;
  readonly organization_id: string;
  readonly kind: 'isolation_chain' | 'mutation_chain' | 'topology_chain' | 'execution_chain';
  readonly narrative: OperationalNarrative;
  readonly causal_chain: ReadonlyArray<{
    readonly step_index: number;
    readonly source_phase: CompressionSourcePhase;
    readonly source_id: string;
    readonly summary: string;
    readonly observed_at: string;
  }>;
  readonly bounded_reason?: string;
  readonly built_at: string;
}

// ─── Rollback narrative replay ───────────────────────────────────────

export interface RollbackNarrativeReplay {
  readonly narrative: OperationalNarrative;
  readonly rollback_chain_ids: ReadonlyArray<string>;
  readonly source_phase_breakdown: Readonly<Record<CompressionSourcePhase, number>>;
  readonly outcome_summary: 'all_full' | 'partial' | 'mixed' | 'failed' | 'unknown';
  readonly built_at: string;
}

// ─── Continuity narrative ────────────────────────────────────────────

export interface ContinuityNarrative {
  readonly narrative: OperationalNarrative;
  readonly interrupted_worker_count: number;
  readonly stalled_worker_count: number;
  readonly restored_worker_count: number;
  readonly built_at: string;
}

// ─── Topology narrative replay ───────────────────────────────────────

export interface TopologyNarrativeReplay {
  readonly narrative: OperationalNarrative;
  readonly fragmentation_tier: 'cohesive' | 'partial' | 'fragmented' | 'shattered';
  readonly fragmentation_pressure_score: number;
  readonly active_isolation_count: number;
  readonly built_at: string;
}

// ─── Operational trust surface ───────────────────────────────────────

export interface OperationalTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;                   // human-readable band name
    readonly score: number;                   // 0..100
    readonly inherited_from_phase: CompressionSourcePhase;
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;           // 0..100
  readonly built_at: string;
}

// ─── Cognitive load (addendum: CognitiveLoadTier) ────────────────────

export type CognitiveLoadTier = 'light' | 'moderate' | 'dense' | 'overloaded';

export interface CognitiveLoadProfile {
  readonly organization_id: string;
  readonly tier: CognitiveLoadTier;
  readonly load_score: number;                // 0..100
  readonly drivers: ReadonlyArray<{
    readonly metric: string;
    readonly observed_value: number;
    readonly contribution: number;            // 0..100
  }>;
  readonly observable_signals: {
    readonly pending_propagations: number;
    readonly active_broker_isolations: number;
    readonly active_execution_isolations: number;
    readonly recent_failures_24h: number;
    readonly recovery_plan_count: number;
    readonly fragmentation_pressure: number;
    readonly replay_backlog: number;
  };
  readonly built_at: string;
}

// ─── Operator guidance (addendum: GuidanceRankingAttribution) ────────

export type GuidanceActionKind =
  | 'lift_broker_isolation'                   // Phase 21
  | 'lift_execution_isolation'                // Phase 23
  | 'build_topology_recovery_plan'            // Phase 22
  | 'execute_topology_recovery_step'          // Phase 22
  | 'build_distributed_recovery_plan'         // Phase 21
  | 'execute_distributed_recovery_step'       // Phase 21
  | 'build_rollback_execution_plan'           // Phase 23
  | 'force_continuity_replay'                 // Phase 21
  | 'review_governance_decision';             // Phase 12+

export type GuidanceRankingRule =
  | 'broker_isolation_blocks_partition'
  | 'topology_fragmented_above_pressure_threshold'
  | 'execution_kind_isolated_blocks_workers'
  | 'recent_worker_failures_burst'
  | 'replay_backlog_above_threshold'
  | 'pending_recovery_plan_already_exists'
  | 'no_active_signal_default_floor';

export interface GuidanceRankingAttribution {
  readonly guidance_id: string;
  readonly action_kind: GuidanceActionKind;
  readonly urgency_score: number;             // 0..100
  readonly ranked_by_rule: GuidanceRankingRule;
  readonly source_attributions: ReadonlyArray<NarrativeCitation>;
  readonly operator_clickable_phase: CompressionSourcePhase;
  readonly ranking_reason: string;
}

export interface GuidanceItem {
  readonly attribution: GuidanceRankingAttribution;
  readonly description: string;               // deterministic template-rendered text
  readonly target_namespace?: string;
  readonly target_kind?: string;
  readonly target_organization_id: string;
  readonly target_endpoint_hint: string;      // operator-facing route hint
}

export interface OperatorGuidancePlan {
  readonly plan_id: string;
  readonly organization_id: string;
  readonly items: ReadonlyArray<GuidanceItem>;
  readonly bounded_reason: string;
  readonly built_at: string;
}

// ─── Health scores ───────────────────────────────────────────────────

export interface CognitiveCompressionHealthScores {
  readonly operational_clarity: number;          // 0..100
  readonly replay_comprehensibility: number;     // 0..100
  readonly rollback_explainability: number;      // 0..100
  readonly continuity_visibility: number;        // 0..100
  readonly topology_understandability: number;   // 0..100
  readonly operator_trust: number;               // 0..100
}

export interface CognitiveCompressionSummarySnapshot {
  readonly node_id: string;
  readonly recent_narratives_24h: number;
  readonly recent_compressed_replays_24h: number;
  readonly recent_guidance_plans_24h: number;
  readonly current_load_tier: CognitiveLoadTier;
  readonly current_load_score: number;
  readonly health_scores: CognitiveCompressionHealthScores;
  readonly last_updated: string;
}

// ─── Architectural caps ──────────────────────────────────────────────

export const MAX_NARRATIVES_PER_PARTITION = 200;
export const MAX_BLOCKS_PER_NARRATIVE = 12;
export const MAX_CITATIONS_PER_BLOCK = 8;
export const MAX_GUIDANCE_ITEMS_PER_PLAN = 10;
export const MAX_GUIDANCE_PLANS_PER_PARTITION = 20;
export const MAX_TEMPLATE_REGISTRY_SIZE = 64;
export const MAX_RENDERED_TEXT_CHARS = 600;
export const MAX_CAUSAL_CHAIN_DEPTH = 16;
export const COMPRESSION_RATIO_DENSE_THRESHOLD = 0.4;
export const COMPRESSION_RATIO_EXECUTIVE_THRESHOLD = 0.15;
