/**
 * operatorGovernanceTypes — Phase 18. Human-calibrated adaptive
 * governance cognition.
 *
 * Architectural commitment (per the Phase 18 stress-test + addendum):
 *   - Specialization routing is SOFT bias, NOT validator exclusion.
 *     RoutingAttribution explains every bias.
 *   - Recovery orchestration is OPERATOR-GATED. Engine waits between
 *     steps; operator clicks approve/skip/abort.
 *   - Calibration is OPERATOR-CLICKED. No timeout-based auto-approval,
 *     no threshold-triggered auto-apply, no silent governance evolution.
 *   - Forecast tuning is EMPIRICAL bound-widening, NOT ML retraining.
 *   - Topology mapping is a STRUCTURED PAYLOAD, NOT a graph viz library.
 *   - Hard architectural vetoes remain absolute and unaffected by routing.
 */

import type {
  ValidatorRole, MutationIntent,
} from '../causality/causalityTypes';
import type {
  ValidatorStabilityTier, ForecastSignal,
} from '../adaptiveGovernance/adaptiveGovernanceTypes';

// ─── Hard architectural caps ───────────────────────────────────────────

export const MAX_ACTIVE_PROPOSALS_PER_PROJECT = 20;
export const MAX_ACTIVE_RECOVERY_SESSIONS_PER_PROJECT = 5;
export const FORECAST_TUNING_OBSERVATIONS_FLOOR = 5;
export const FORECAST_BOUNDS_WIDEN_FACTOR = 1.25;
export const FORECAST_BOUNDS_TIGHTEN_FACTOR = 0.9;
export const ROUTING_BIAS_MIN = 0.5;
export const ROUTING_BIAS_MAX = 1.5;
export const TOPOLOGY_MAX_NODES = 50;
export const TRANSPARENCY_REPLAY_MAX_ENTRIES = 100;

// ─── Operator calibration ─────────────────────────────────────────────

export type CalibrationType =
  | 'validator_suppression'
  | 'validator_restoration'
  | 'specialization_adjustment'
  | 'reliability_decay_correction'
  | 'arbitration_tuning'
  | 'forecast_tuning'
  | 'routing_override';

export type CalibrationStatus =
  | 'pending_operator'      // proposed, awaiting operator click
  | 'approved'              // operator approved + applied
  | 'rejected'              // operator rejected
  | 'expired'               // operator-marked expired (manual; no timeout)
  | 'rolled_back';          // approved + later rolled back

/**
 * Confidence bounds attached to every calibration proposal — required
 * by the Phase 18 addendum to avoid false certainty.
 */
export interface CalibrationConfidenceBounds {
  readonly low: number;                          // 0-100; lower bound on expected impact
  readonly high: number;                         // 0-100; upper bound
  readonly confidence_range: number;             // high - low; smaller = more confident
  readonly uncertainty_drivers: ReadonlyArray<string>;
  readonly expected_governance_impact: number;   // 0-100; central estimate
  readonly rollback_confidence: number;          // 0-100; how confident we can roll this back
}

export interface GovernanceCalibrationProposal {
  readonly proposal_id: string;
  readonly project_id: string;
  readonly calibration_type: CalibrationType;
  /** Domain-specific payload — e.g., for validator_suppression:
   *  { validator_role: 'mutation_validator', reason: 'unstable for 6 obs' } */
  readonly proposed_change: Readonly<Record<string, unknown>>;
  readonly rationale: string;
  readonly bounds: CalibrationConfidenceBounds;
  /** Concrete steps the engine will run on operator approval. */
  readonly forecasted_impact: ReadonlyArray<string>;
  /** Concrete steps the engine will run on rollback. */
  readonly rollback_path: ReadonlyArray<string>;
  /** Always true in v1 — calibrations are NEVER auto-applied. */
  readonly operator_required: true;
  readonly created_at: string;
  readonly status: CalibrationStatus;
  readonly decided_at: string | null;
  readonly decided_by: string | null;          // operator id when decided
}

// ─── Specialization routing ───────────────────────────────────────────

export type RoutingStabilityTier =
  | 'stable'        // routing decisions consistent across recent arbitrations
  | 'adaptive'      // small healthy adjustments
  | 'volatile'      // large frequent shifts → low confidence
  | 'suppressed'    // operator-frozen routing
  | 'overridden';   // operator-set fixed weights

export interface RoutingAttribution {
  readonly validator_role: ValidatorRole;
  readonly target_intent: MutationIntent | null;
  readonly applied_bias: number;             // multiplier to weight, in [ROUTING_BIAS_MIN, ROUTING_BIAS_MAX]
  /** Why we biased this validator's weight for this domain. */
  readonly reason: string;
  /** Concrete inputs that drove the bias. */
  readonly inputs: {
    readonly domain_accuracy: number;
    readonly domain_observations: number;
    readonly validator_drift_tier: ValidatorStabilityTier;
    readonly is_strong_in_domain: boolean;
    readonly is_weak_in_domain: boolean;
  };
  /** Set when an operator override is in effect for this validator. */
  readonly operator_override?: { fixed_bias: number; set_by: string; set_at: string };
}

export interface SpecializationRoutingDecision {
  readonly project_id: string;
  readonly target_intent: MutationIntent;
  readonly attributions: ReadonlyArray<RoutingAttribution>;
  /** Soft weight overrides — feed straight into Phase 16 arbitrate(weight_overrides). */
  readonly weight_overrides: Readonly<Partial<Record<ValidatorRole, number>>>;
  readonly stability_tier: RoutingStabilityTier;
  readonly built_at: string;
}

// ─── Forecast tuning ──────────────────────────────────────────────────

export interface ForecastOutcomeObservation {
  readonly signal: ForecastSignal;
  readonly predicted_value: number;
  readonly predicted_low: number;
  readonly predicted_high: number;
  readonly actual_value: number;
  readonly observed_at: string;
  /** True iff actual value fell within predicted [low, high]. */
  readonly within_bounds: boolean;
}

export interface ForecastCalibrationProfile {
  readonly project_id: string;
  readonly per_signal: Readonly<Record<ForecastSignal, {
    readonly observations: number;
    readonly within_bounds_rate: number;       // 0-100
    readonly mean_abs_error: number;
    readonly bound_widen_factor: number;       // accumulated multiplier on uncertainty
    readonly recommended_action: 'widen' | 'tighten' | 'hold';
    readonly notes: ReadonlyArray<string>;
  }>>;
  readonly built_at: string;
}

// ─── Recovery orchestration ───────────────────────────────────────────

export type RecoveryStepStatus =
  | 'pending_operator'
  | 'approved'
  | 'skipped'
  | 'aborted'
  | 'completed';

export interface InteractiveRecoveryStep {
  readonly index: number;
  readonly kind: 'contain_root' | 'rollback_target' | 'recalibrate_trust' | 'reenable_governance' | 'suppress_propagation_branch' | 'monitor_only';
  readonly subject: string;
  readonly forecast_impact: { low: number; high: number; uncertainty_drivers: ReadonlyArray<string> };
  readonly rollback_consequence: string;
  readonly trust_recovery_estimate: number;          // 0-100
  readonly propagation_suppression_estimate: number; // 0-100
  readonly stabilization_confidence: number;         // 0-100
  readonly blast_radius_implication: number;         // 0-100
  readonly api_path: string | null;
  readonly status: RecoveryStepStatus;
}

export interface InteractiveRecoverySession {
  readonly session_id: string;
  readonly project_id: string;
  readonly trigger_summary: string;
  readonly steps: ReadonlyArray<InteractiveRecoveryStep>;
  readonly current_step_index: number;
  readonly created_at: string;
  readonly last_action_at: string;
  readonly status: 'active' | 'completed' | 'aborted';
  readonly operator_actions: ReadonlyArray<{
    readonly step_index: number;
    readonly action: 'approve' | 'skip' | 'abort';
    readonly operator_id: string | null;
    readonly recorded_at: string;
  }>;
}

// ─── Recovery optimization ────────────────────────────────────────────

export interface RecoveryDecisionAttribution {
  readonly recovery_step: string;       // step kind + subject
  readonly ordering_reason: string;     // why this step came at this position
  readonly optimization_inputs: {
    readonly historical_success_rate: number;
    readonly avg_minutes_to_stabilize: number;
    readonly observed_count: number;
  };
  readonly stabilization_expectation: 'low' | 'moderate' | 'high';
  readonly operator_override?: { reason: string; operator_id: string };
}

export interface RecoveryArchetype {
  readonly archetype_id: string;
  readonly step_sequence: ReadonlyArray<string>;        // canonical ordering
  readonly observed_count: number;
  readonly success_rate: number;                         // 0-100
  readonly avg_minutes_to_stabilize: number;
  readonly notes: string;
}

export interface RecoveryOptimizationInsights {
  readonly project_id: string;
  readonly archetypes: ReadonlyArray<RecoveryArchetype>;
  readonly recommended_ordering: ReadonlyArray<string>;
  readonly attributions: ReadonlyArray<RecoveryDecisionAttribution>;
  readonly built_at: string;
}

// ─── Governance topology ──────────────────────────────────────────────

export type TopologyNodeKind =
  | 'validator'
  | 'arbitration'
  | 'specialization_zone'
  | 'trust_cluster'
  | 'stabilization_hub'
  | 'bottleneck';

export interface TopologyNode {
  readonly node_id: string;
  readonly kind: TopologyNodeKind;
  readonly label: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface TopologyEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: 'influences' | 'depends_on' | 'specializes_in' | 'propagates_through' | 'stabilizes';
  readonly strength: number;        // 0-100
}

export interface GovernanceTopologyMap {
  readonly project_id: string;
  readonly nodes: ReadonlyArray<TopologyNode>;
  readonly edges: ReadonlyArray<TopologyEdge>;
  readonly identified_bottlenecks: ReadonlyArray<string>;     // node ids
  readonly identified_hubs: ReadonlyArray<string>;            // node ids
  readonly built_at: string;
}

// ─── Governance transparency replay ──────────────────────────────────

export type TransparencyReplayKind =
  | 'weight_change'
  | 'drift_event'
  | 'specialization_shift'
  | 'routing_change'
  | 'forecast_recalibration'
  | 'operator_intervention';

export interface TransparencyReplayEntry {
  readonly index: number;
  readonly kind: TransparencyReplayKind;
  readonly summary: string;
  readonly recorded_at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface GovernanceTransparencyReplay {
  readonly project_id: string;
  readonly entries: ReadonlyArray<TransparencyReplayEntry>;
  readonly truncated: boolean;
  readonly built_at: string;
}

// ─── Governance health surfaces ──────────────────────────────────────

export interface GovernanceHealthScores {
  readonly calibration_stability: number;        // 0-100; recent calibration approval/rejection volatility
  readonly routing_stability: number;            // 0-100; from RoutingStabilityTier
  readonly recovery_optimization: number;        // 0-100; from observed success rates
  readonly forecast_reliability: number;         // 0-100; from within_bounds_rate
  readonly governance_transparency: number;      // 0-100; from attribution coverage
}

// ─── Engine surface ──────────────────────────────────────────────────

export interface GovernanceEvolutionSummarySnapshot {
  readonly pending_calibration_proposals: number;
  readonly approved_calibrations_24h: number;
  readonly rejected_calibrations_24h: number;
  readonly active_recovery_sessions: number;
  readonly forecast_signals_widened: number;
  readonly routing_stability: RoutingStabilityTier;
  readonly health_scores: GovernanceHealthScores;
}

// ─── Re-exports ──────────────────────────────────────────────────────

export type { ValidatorRole, MutationIntent, ValidatorStabilityTier, ForecastSignal };
