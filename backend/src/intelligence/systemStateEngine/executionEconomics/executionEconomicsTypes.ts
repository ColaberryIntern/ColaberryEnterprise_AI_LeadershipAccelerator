/**
 * executionEconomicsTypes — Phase 28. All types for the bounded
 * deterministic operational resource governance substrate.
 *
 * Architectural commitment (per stress-test + 4 required additions):
 *   - Phase 28 OBSERVES, CLASSIFIES, BUDGETS, CONSTRAINS.
 *     It does NOT optimize, allocate dynamically, reprioritize execution,
 *     rebalance topology, expand authority, infer execution desirability,
 *     or auto-govern runtime economics.
 *   - Quotas are STATIC OPERATOR-SET CAPS. No runtime-derived caps,
 *     no auto-expansion, no inferred safe capacity.
 *   - Quota gate is INTEGRATED INTO Phase 27's `evaluateIssuance` —
 *     single source of truth, no parallel gates, no route-level prefilter.
 *   - Pressure derives from OBSERVABLE COUNTERS ONLY (Phase 21/22/23/27).
 *     No inferred operator intent, no probabilistic prediction,
 *     no behavioral heuristics.
 *   - Topology load distribution is RECOMMENDATION-ONLY
 *     (`recommendation_only: true` typed-as-literal). No auto-migration.
 *   - Rollback forecasting is HEURISTIC ONLY with explicit
 *     `uncertainty_bounds` and `inherited_confidence_lineage`. No ML.
 *   - Narratives are PHASE 24-COMPLIANT (static templates, citations
 *     required, deterministic SHA-256, no LLM).
 *   - Cross-organization isolation is ABSOLUTE.
 *   - Phase 28 NEVER alters execution priority. Classify, never prioritize.
 */

import type { CompressionSourcePhase } from '../cognitiveCompression/cognitiveCompressionTypes';

// ─── 5-tier classifications (deterministic) ─────────────────────────

/** Classification of delegated execution pressure. */
export type DelegatedPressureTier =
  | 'low'
  | 'moderate'
  | 'elevated'
  | 'critical'
  | 'saturated';

/** Composite execution-economics tier (addendum #9 from operator). */
export type ExecutionEconomicsTier =
  | 'stable'
  | 'constrained'
  | 'elevated'
  | 'saturated'
  | 'exhausted';

// ─── Quota types (addendum #1, #2, #10, #11) ────────────────────────

/** Quota resource keys — fixed enumeration, NOT runtime-derived. */
export type QuotaResourceKey =
  | 'envelopes_per_24h'
  | 'executions_per_24h'
  | 'rollback_chains_per_24h'
  | 'topology_recovery_steps_per_24h'
  | 'continuity_replays_per_24h'
  | 'concurrent_executions';

/**
 * ExecutionQuotaProfile — per-org per-resource caps + consumed + remaining.
 * Caps are STATIC OPERATOR-SET. Defaults below are conservative; operator
 * mutates via `setQuotaLimit` which records `QuotaGovernanceAttribution`.
 */
export interface ExecutionQuotaProfile {
  readonly organization_id: string;
  readonly limits: Readonly<Record<QuotaResourceKey, number>>;
  readonly consumed: Readonly<Record<QuotaResourceKey, number>>;
  readonly remaining: Readonly<Record<QuotaResourceKey, number>>;
  readonly any_exhausted: boolean;
  readonly exhausted_keys: ReadonlyArray<QuotaResourceKey>;
  readonly built_at: string;
  readonly deterministic_hash: string;
}

/** Operator-driven quota mutation lineage (operator brief addendum #10). */
export interface QuotaGovernanceAttribution {
  readonly attribution_id: string;
  readonly organization_id: string;
  readonly quota_key: QuotaResourceKey;
  readonly previous_limit: number;
  readonly updated_limit: number;
  readonly updated_by: string;            // operator_id
  readonly reason: string;                // human-readable
  readonly recorded_at: string;
  readonly deterministic_hash: string;
}

/** Quota exhaustion attribution — recorded when a Phase 27 envelope is refused on quota. */
export interface QuotaExhaustionAttribution {
  readonly organization_id: string;
  readonly quota_key: QuotaResourceKey;
  readonly attempted_envelope_id?: string;
  readonly limit: number;
  readonly consumed_at_check: number;
  readonly recorded_at: string;
  readonly deterministic_hash: string;
}

/**
 * QuotaExhaustionFinalityProof (operator brief addendum #11) — every
 * exhausted quota MUST surface this so silent overrun is impossible.
 */
export interface QuotaExhaustionFinalityProof {
  readonly quota_key: QuotaResourceKey;
  readonly exhaustion_timestamp: string;
  readonly blocking_envelope_id?: string;
  readonly exhaustion_scope: 'partition' | 'organization';
  readonly replayable: true;              // typed-as-true: replay always available
  readonly bounded_reason: string;        // explicit human-readable cause
  readonly finality_hash: string;
}

// ─── Runtime pressure (addendum #3) ─────────────────────────────────

/**
 * RuntimePressureProfile — observable-counter-derived 5-tier classification.
 * Sources are explicitly enumerated; the profile carries which counters
 * contributed to the score.
 */
export interface RuntimePressureProfile {
  readonly organization_id: string;
  readonly tier: DelegatedPressureTier;
  readonly score: number;                 // 0–100 deterministic
  readonly observed_counters: Readonly<{
    envelopes_24h: number;
    executions_24h: number;
    refusals_24h: number;
    timeouts_24h: number;
    expirations_24h: number;
    broker_isolations_active: number;
    topology_fragmentations_active: number;
    execution_worker_failures_24h: number;
  }>;
  readonly sample_hash: string;           // deterministic from observed_counters
  readonly recorded_at: string;
}

// ─── Topology load distribution (addendum #4) ───────────────────────

/**
 * TopologyLoadDistributionProfile — RECOMMENDATION-ONLY advisory.
 * The engine NEVER auto-migrates execution. `recommendation_only: true`
 * typed-as-literal is the structural commitment.
 */
export interface TopologyLoadDistributionProfile {
  readonly organization_id: string;
  readonly partitions: ReadonlyArray<{
    readonly partition_key: string;       // namespace or partition id
    readonly load_score: number;          // 0–100 deterministic
    readonly tier: DelegatedPressureTier;
    readonly observed_envelope_count: number;
    readonly observed_execution_count: number;
  }>;
  readonly imbalance_score: number;       // 0–100 (range across partitions)
  readonly advisory_recommendation?: string; // human-readable, advisory only
  readonly recommendation_only: true;     // typed-as-true: structural
  readonly never_auto_migrates: true;     // typed-as-true: structural
  readonly distribution_hash: string;
  readonly built_at: string;
}

// ─── Rollback resource forecast (addendum #5) ───────────────────────

/**
 * RollbackResourceForecast — heuristic linear extrapolation. Exposes
 * uncertainty + inherited confidence lineage. NO ML, NO probabilistic
 * authority expansion.
 */
export interface RollbackResourceForecast {
  readonly organization_id: string;
  readonly forecast_horizon_ms: number;
  readonly estimated_rollback_chains: number;
  readonly estimated_replay_duration_ms: number;
  readonly uncertainty_bounds: Readonly<{
    low: number;
    expected: number;
    high: number;
  }>;
  readonly inherited_confidence: Readonly<{
    score: number;                        // 0–100
    source_phase: CompressionSourcePhase | 'phase_28_economics';
    drivers: ReadonlyArray<string>;
  }>;
  readonly heuristic_only: true;          // typed-as-true: structural
  readonly forecast_hash: string;
  readonly built_at: string;
}

// ─── Replay determinism attribution (addendum #7) ───────────────────

export interface EconomicsReplayDeterminismAttribution {
  readonly organization_id: string;
  readonly counter_snapshot_hash: string;
  readonly quota_snapshot_hash: string;
  readonly pressure_sample_hash: string;
  readonly load_snapshot_hash: string;
  readonly forecast_snapshot_hash: string;
  readonly composite_hash: string;
  readonly recorded_at: string;
}

// ─── Boundary proof chain (operator brief addendum #8) ──────────────

/**
 * ExecutionEconomicsBoundaryProofChain — operators verify same operational
 * inputs == same economic classification outputs.
 */
export interface ExecutionEconomicsBoundaryProofChain {
  readonly quota_hash: string;
  readonly pressure_hash: string;
  readonly topology_load_hash: string;
  readonly rollback_forecast_hash: string;
  readonly replay_hash: string;
}

// ─── Narratives (addendum #8 from v1, Phase 24 inheritance) ─────────

export interface EconomicsCompressionNarrativeBlock {
  readonly block_id: string;
  readonly template_id: string;
  readonly rendered_text: string;
  readonly citations: ReadonlyArray<{
    readonly source_kind: string;
    readonly source_id: string;
    readonly source_phase: CompressionSourcePhase | 'phase_28_economics';
  }>;
  readonly deterministic_hash: string;
}

export interface ExecutionEconomicsNarrative {
  readonly narrative_id: string;
  readonly organization_id: string;
  readonly blocks: ReadonlyArray<EconomicsCompressionNarrativeBlock>;
  readonly built_at: string;
}

// ─── Replay bundle ──────────────────────────────────────────────────

export interface ExecutionEconomicsReplay {
  readonly organization_id: string;
  readonly quota_profile: ExecutionQuotaProfile;
  readonly pressure_profile: RuntimePressureProfile;
  readonly topology_load: TopologyLoadDistributionProfile;
  readonly rollback_forecast: RollbackResourceForecast;
  readonly recent_quota_governance: ReadonlyArray<QuotaGovernanceAttribution>;
  readonly recent_quota_exhaustions: ReadonlyArray<QuotaExhaustionAttribution>;
  readonly determinism_attribution: EconomicsReplayDeterminismAttribution;
  readonly boundary_proof_chain: ExecutionEconomicsBoundaryProofChain;
  readonly built_at: string;
}

// ─── Trust surface ──────────────────────────────────────────────────

export interface ExecutionEconomicsTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;
    readonly score: number;
    readonly inherited_from_phase: CompressionSourcePhase | 'phase_28_economics';
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;
  readonly built_at: string;
}

// ─── Health surface ─────────────────────────────────────────────────

export interface ExecutionEconomicsHealthScores {
  readonly budget_reliability: number;
  readonly rollback_cost_certainty: number;
  readonly pressure_classification_confidence: number;
  readonly topology_load_integrity: number;
  readonly quota_safety: number;
  readonly replay_integrity: number;
}

export interface ExecutionEconomicsSummarySnapshot {
  readonly node_id: string;
  readonly recent_quota_exhaustions_24h: number;
  readonly recent_quota_governance_changes_24h: number;
  readonly recent_pressure_samples_24h: number;
  readonly recent_load_classifications_24h: number;
  readonly recent_forecasts_24h: number;
  readonly current_economics_tier: ExecutionEconomicsTier;
  readonly health_scores: ExecutionEconomicsHealthScores;
  readonly last_updated: string;
}

// ─── Visibility composite ───────────────────────────────────────────

export interface ExecutionEconomicsVisibilityReplay {
  readonly organization_id: string;
  readonly quota_profile: ExecutionQuotaProfile;
  readonly pressure_profile: RuntimePressureProfile;
  readonly topology_load: TopologyLoadDistributionProfile;
  readonly rollback_forecast: RollbackResourceForecast;
  readonly recent_quota_governance: ReadonlyArray<QuotaGovernanceAttribution>;
  readonly recent_quota_exhaustions: ReadonlyArray<QuotaExhaustionAttribution>;
  readonly recent_narratives: ReadonlyArray<ExecutionEconomicsNarrative>;
  readonly economics_tier: ExecutionEconomicsTier;
  readonly trust_surface: ExecutionEconomicsTrustSurface;
  readonly built_at: string;
}

// ─── Forbidden registry types ───────────────────────────────────────

/** 8 explicit forbidden actions — defense-in-depth anti-authority-creep. */
export type ForbiddenEconomicsActionKind =
  | 'auto_quota_expansion'
  | 'auto_topology_rebalancing'
  | 'cross_org_resource_pooling'
  | 'hidden_execution_prioritization'
  | 'probabilistic_quota_allocation'
  | 'dynamic_authority_expansion'
  | 'runtime_self_governance'
  | 'economic_authority_escalation';

export interface ForbiddenEconomicsActionRegistry {
  readonly forbidden_actions: ReadonlyArray<ForbiddenEconomicsActionKind>;
  readonly forbidden_explanations: Readonly<Record<ForbiddenEconomicsActionKind, string>>;
  readonly registry_hash: string;
}

// ─── Architectural caps ─────────────────────────────────────────────

/** Default static quota caps — operator-mutable via setQuotaLimit. */
export const DEFAULT_QUOTA_LIMITS: Readonly<Record<QuotaResourceKey, number>> = {
  envelopes_per_24h: 50,
  executions_per_24h: 30,
  rollback_chains_per_24h: 20,
  topology_recovery_steps_per_24h: 10,
  continuity_replays_per_24h: 10,
  concurrent_executions: 1,
};

export const MAX_QUOTA_LIMIT = 10_000;             // operator cannot raise above this
export const MIN_QUOTA_LIMIT = 0;                  // 0 = action disabled
export const MAX_QUOTA_GOVERNANCE_PER_PARTITION = 200;
export const MAX_QUOTA_EXHAUSTIONS_PER_PARTITION = 200;
export const MAX_PRESSURE_SAMPLES_PER_PARTITION = 500;
export const MAX_FORECASTS_PER_PARTITION = 200;
export const MAX_LOAD_CLASSIFICATIONS_PER_PARTITION = 200;
export const MAX_NARRATIVES_PER_PARTITION = 100;
export const FORECAST_HORIZON_MS = 24 * 60 * 60_000;   // 24h forecast window
export const PRESSURE_SCORE_LOW = 25;
export const PRESSURE_SCORE_MODERATE = 50;
export const PRESSURE_SCORE_ELEVATED = 75;
export const PRESSURE_SCORE_CRITICAL = 90;
// Saturated = >= CRITICAL with quota exhaustion.
