/**
 * adaptiveGovernanceTypes — Phase 17. Adaptive validator intelligence
 * + causal governance evolution.
 *
 * Architectural commitment (per the Phase 17 stress-test + addendum):
 *   - Validators are STATIC, deterministic, replayable. Specialization
 *     evolution = the system tracks WHERE validators are reliable; the
 *     code itself never mutates.
 *   - Adaptive weights are SOFT modulation. Hard architectural vetoes
 *     (containment confidence ≤ 20 → reject) remain absolute.
 *   - Forecasting is HEURISTIC PROJECTION over ≤4-hour horizon. Not ML.
 *   - Recovery chains ORCHESTRATE existing Phase 13-16 primitives. No
 *     new mutation classes.
 *   - Ancestry rollback is OPERATOR-ASSISTED. The engine plans; the
 *     operator executes.
 *   - Organizational learning stays PROJECT-LOCAL. Phase 13's federated
 *     trust profile is the only cross-project surface.
 */

import type { ValidatorRole, MutationIntent } from '../causality/causalityTypes';

// ─── Hard architectural caps ───────────────────────────────────────────

export const MAX_FORECAST_HORIZON_MS = 4 * 60 * 60 * 1000;     // 4 hours
export const RELIABILITY_WINDOW_MS = 24 * 60 * 60 * 1000;      // 24-hour rolling window
export const MIN_OBSERVATIONS_FOR_DRIFT = 5;                   // below = no signal
export const MAX_RECOVERY_CHAIN_STEPS = 6;
export const ROLE_WEIGHT_MIN = 0.3;
export const ROLE_WEIGHT_MAX = 2.5;
export const STATIC_ROLE_WEIGHT_DEFAULT = 1.0;

// ─── Reliability tracking ─────────────────────────────────────────────

export interface ValidatorReliabilityMetrics {
  readonly validator_role: ValidatorRole;
  readonly observations: number;
  readonly accuracy: number;                          // 0-100; agreement with eventual consensus
  readonly false_positive_rate: number;               // 0-100; over-rejected vs apply consensus
  readonly false_negative_rate: number;               // 0-100; under-detected vs reject consensus
  readonly rollback_prevention_rate: number;          // 0-100; flagged correctly before rollback
  readonly arbitration_agreement_quality: number;     // 0-100
  readonly stabilization_success_rate: number;        // 0-100
  readonly window_start: string;
  readonly window_end: string;
}

export interface ValidatorReliabilityProfile {
  readonly project_id: string;
  readonly metrics_by_role: Readonly<Record<ValidatorRole, ValidatorReliabilityMetrics>>;
  readonly built_at: string;
}

// ─── Drift detection ──────────────────────────────────────────────────

export type ValidatorStabilityTier =
  | 'stable'
  | 'cautionary'
  | 'drifting'
  | 'unstable'
  | 'suppressed';      // operator/policy-frozen

export interface ValidatorDriftSignal {
  readonly validator_role: ValidatorRole;
  readonly tier: ValidatorStabilityTier;
  readonly signals: ReadonlyArray<string>;             // human-readable drivers, e.g. "confidence inflation"
  readonly confidence_inflation_pct: number;           // 0-100
  readonly over_trigger_pct: number;                   // 0-100
  readonly under_detect_pct: number;                   // 0-100
  readonly disagreement_drift_pct: number;             // 0-100
  readonly recommended_action: 'monitor' | 'recalibrate' | 'suppress' | 'noop';
}

export interface ValidatorDriftProfile {
  readonly project_id: string;
  readonly signals: ReadonlyArray<ValidatorDriftSignal>;
  readonly worst_tier: ValidatorStabilityTier;
  readonly built_at: string;
}

// ─── Specialization analysis ──────────────────────────────────────────

/** A "domain" is a MutationIntent class — the natural axis along which
 *  validators can specialize. Validators may be reliable for one intent
 *  class and drifting for another. */
export interface ValidatorSpecializationEntry {
  readonly validator_role: ValidatorRole;
  readonly domain: MutationIntent;
  readonly observations: number;
  readonly accuracy_in_domain: number;          // 0-100
  readonly relative_strength: number;           // -100..+100; signed delta vs validator's overall accuracy
  readonly is_strong: boolean;                  // accuracy_in_domain ≥ overall + 10
  readonly is_weak: boolean;                    // accuracy_in_domain ≤ overall - 10
  readonly note: string;                        // short replay-safe description
}

export interface ValidatorSpecializationMap {
  readonly project_id: string;
  readonly entries: ReadonlyArray<ValidatorSpecializationEntry>;
  readonly strongest_per_domain: Readonly<Partial<Record<MutationIntent, ValidatorRole>>>;
  readonly weakest_per_domain: Readonly<Partial<Record<MutationIntent, ValidatorRole>>>;
  readonly built_at: string;
}

// ─── Adaptive weighting ───────────────────────────────────────────────

/**
 * The full attribution for a single validator's weight adjustment.
 * Required by the Phase 17 addendum so every adjustment is auditable
 * + replayable.
 */
export interface AdaptiveWeightAttribution {
  readonly validator_role: ValidatorRole;
  readonly prior_weight: number;
  readonly adjusted_weight: number;
  /** One-line explanation suitable for audit + dashboards. */
  readonly adjustment_reason: string;
  /** Concrete inputs that drove the adjustment. */
  readonly reliability_inputs: {
    readonly accuracy: number;
    readonly observations: number;
  };
  readonly drift_inputs: {
    readonly tier: ValidatorStabilityTier;
    readonly confidence_inflation_pct: number;
  };
  readonly specialization_inputs: {
    readonly strong_domains: ReadonlyArray<MutationIntent>;
    readonly weak_domains: ReadonlyArray<MutationIntent>;
  };
}

export interface AdaptiveWeightSet {
  readonly project_id: string;
  /** What the arbitration engine should use this round. Phase 16's
   *  arbitrate() reads these via its weight_overrides parameter. */
  readonly weights_by_role: Readonly<Record<ValidatorRole, number>>;
  readonly attributions: ReadonlyArray<AdaptiveWeightAttribution>;
  readonly built_at: string;
}

// ─── Causal forecasting (heuristic projection only) ──────────────────

export type ForecastSignal =
  | 'rollback_rate_trend'
  | 'validator_divergence_trend'
  | 'trust_decay_trajectory'
  | 'contradiction_amplification_trend'
  | 'arbitration_instability_projection';

export interface ForecastConfidenceBounds {
  readonly low: number;
  readonly high: number;
  readonly confidence_range: number;         // high - low; smaller = more confident
  readonly uncertainty_drivers: ReadonlyArray<string>;
}

export interface CausalStabilityForecastEntry {
  readonly signal: ForecastSignal;
  readonly current_value: number;
  readonly projected_value: number;
  readonly horizon_ms: number;               // ≤ MAX_FORECAST_HORIZON_MS
  readonly direction: 'improving' | 'flat' | 'degrading';
  readonly bounds: ForecastConfidenceBounds;
  /** Replay-safe deterministic explanation. */
  readonly rationale: string;
}

export interface CausalStabilityForecast {
  readonly project_id: string;
  readonly entries: ReadonlyArray<CausalStabilityForecastEntry>;
  readonly worst_signal: ForecastSignal | null;
  readonly built_at: string;
}

// ─── Ancestry rollback planning ──────────────────────────────────────

export interface AncestryRollbackStep {
  readonly index: number;
  readonly target_node_id: string;
  readonly node_kind: 'mutation' | 'rollback' | 'governance_decision' | 'stabilization';
  readonly mutation_intent: MutationIntent | null;
  readonly forecast: ForecastConfidenceBounds;
  readonly blast_score: number;
  readonly trust_recovery_estimate: number;   // 0-100
  readonly propagation_consequences: ReadonlyArray<string>;
  readonly rollback_command: string;          // operator-runnable curl/API path
}

export interface AncestryRollbackPlan {
  readonly project_id: string;
  readonly target_mutation_id: string;
  readonly steps: ReadonlyArray<AncestryRollbackStep>;
  readonly total_estimated_blast: number;
  readonly recommended_pacing_ms: number;     // suggested gap between steps
  readonly operator_action_required: string;  // e.g., "approve_chain | execute_step"
  readonly truncated: boolean;
  readonly built_at: string;
}

// ─── Validator meta-reasoning (analytical view OVER Phase 16) ────────

export interface ValidatorMetaReasoningSummary {
  readonly project_id: string;
  readonly highest_disagreement_pair: { pair: readonly [ValidatorRole, ValidatorRole]; rate: number } | null;
  readonly recurring_disagreement_topics: ReadonlyArray<string>;
  readonly arbitration_instability_score: number;   // 0-100 composite
  readonly consensus_fragility: number;             // 0-100
  readonly calibration_quality: number;             // 0-100
  readonly notes: ReadonlyArray<string>;
  readonly built_at: string;
}

// ─── Causal recovery chain ───────────────────────────────────────────

export type RecoveryStepKind =
  | 'contain_root'
  | 'rollback_target'
  | 'recalibrate_trust'
  | 'reenable_governance'
  | 'suppress_propagation_branch'
  | 'monitor_only';

export interface CausalRecoveryStep {
  readonly index: number;
  readonly kind: RecoveryStepKind;
  readonly subject: string;        // mutation_id / cluster_signature / intent_class
  readonly rationale: string;
  readonly api_path: string | null;   // operator-runnable when applicable
}

export interface CausalRecoveryChain {
  readonly project_id: string;
  readonly trigger_summary: string;
  readonly steps: ReadonlyArray<CausalRecoveryStep>;
  readonly total_steps: number;
  readonly estimated_recovery_minutes: number;
  readonly built_at: string;
}

// ─── Organizational causal intelligence (PROJECT-LOCAL) ──────────────

export type CausalArchetype =
  | 'recurring_contradiction_kind'
  | 'unstable_mutation_pattern'
  | 'governance_drift_signature'
  | 'rollback_failure_pattern'
  | 'propagation_archetype';

export interface OrganizationalArchetypeEntry {
  readonly archetype: CausalArchetype;
  readonly signature: string;          // canonical key for this pattern
  readonly occurrences: number;
  readonly last_observed_at: string;
  readonly project_id: string;         // explicit — never null, never cross-project
  readonly examples: ReadonlyArray<string>;
}

export interface OrganizationalCausalIntelligenceReport {
  readonly project_id: string;
  readonly entries: ReadonlyArray<OrganizationalArchetypeEntry>;
  readonly built_at: string;
}

// ─── Engine surface ──────────────────────────────────────────────────

export interface AdaptiveGovernanceSummarySnapshot {
  readonly drifting_validators: number;
  readonly suppressed_validators: number;
  readonly active_forecasts: number;
  readonly active_recovery_chains: number;
  readonly ancestry_rollbacks_recommended: number;
  readonly worst_validator_tier: ValidatorStabilityTier;
}

// ─── Re-exports ──────────────────────────────────────────────────────

export type { ValidatorRole, MutationIntent };
