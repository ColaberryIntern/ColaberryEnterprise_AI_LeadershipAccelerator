/**
 * federatedLearningTypes — Phase 20. Bounded federated organizational
 * learning refinement + organizational effectiveness intelligence.
 *
 * Architectural commitment (per the Phase 20 stress-test + addendum):
 *   - Effectiveness + reliability evolution are DETERMINISTIC update
 *     rules over observed outcomes. NO ML, NO probabilistic models.
 *   - Persistent broker is an ADAPTER INTERFACE; v1 ships an in-memory
 *     default. Real Redis/DB adapters are Phase 21+ deliverables.
 *   - Federated learning is INFORMATIONAL — refines confidence,
 *     stabilization rankings, and replay visibility, but never mutates
 *     local governance directly. Local governance still flows through
 *     Phase 18 calibration proposals + operator approval.
 *   - Policy evolution mirrors Phase 18: engine proposes, operator
 *     approves. NO timeout-based auto-approval, NO threshold-triggered
 *     mutation.
 *   - Organizational learning stays bounded — aggregated observations
 *     only. NO cross-project trust blending, NO shared governance
 *     authority, NO topology convergence.
 *   - Hard architectural vetoes remain absolute.
 */

import type { ArchetypeKind } from '../federation/federationTypes';

// ─── Hard architectural caps ───────────────────────────────────────────

export const MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE = 200;
export const MAX_RELIABILITY_HISTORY_PER_ARCHETYPE = 50;
export const MAX_DIFFUSION_REPLAY_ENTRIES = 200;
export const MAX_POLICY_PROPOSALS_PER_ORG = 20;
export const RELIABILITY_DELTA_PER_OBSERVATION = 5;     // 0-100 scale; bounded per-observation impact
export const DRIFT_DETECTION_WINDOW_MS = 24 * 60 * 60 * 1000;     // 24h
export const VISIBILITY_REPLAY_DEFAULT_WINDOW_HOURS = 168;        // 7d
export const VISIBILITY_REPLAY_MAX_WINDOW_HOURS = 720;            // 30d

// ─── Archetype reliability tiers ──────────────────────────────────────

export type ArchetypeReliabilityTier =
  | 'emerging'        // <5 observations; insufficient evidence to classify
  | 'stable'          // moderate confidence; observations in expected range
  | 'trusted'         // high confidence; consistent positive outcomes
  | 'cautionary'      // mixed signals; operator review suggested
  | 'degraded'        // sustained negative outcomes; lower influence
  | 'suppressed';     // operator-frozen; no influence

// ─── Effectiveness refinement ────────────────────────────────────────

export type RefinementSignal =
  | 'local_application_net_improvement'
  | 'local_application_net_regression'
  | 'local_application_neutral'
  | 'anomaly_amplification'
  | 'stabilization_consistency_growth'
  | 'repeated_regression';

export interface FederatedEffectivenessObservation {
  readonly archetype_signature: string;
  readonly observed_at: string;
  readonly signal: RefinementSignal;
  readonly stabilization_delta: number;       // -100..+100; observed change in stabilization confidence
  readonly propagation_reduction: number;     // -100..+100; observed change in propagation
  readonly recovery_succeeded: boolean;
  readonly anomaly_observed: boolean;
}

/**
 * Required by the Phase 20 addendum — every refinement carries an
 * explanation so operators can replay HOW archetype confidence evolved.
 */
export interface FederatedLearningAttribution {
  readonly archetype_signature: string;
  readonly refinement_reason: string;
  readonly observed_inputs: {
    readonly observation_count: number;
    readonly net_improvement_count: number;
    readonly net_regression_count: number;
    readonly anomaly_count: number;
    readonly stabilization_consistency_score: number;     // 0-100
  };
  readonly reliability_delta: number;                    // -100..+100
  readonly stabilization_delta: number;                  // -100..+100
  readonly anomaly_impact: number;                       // 0-100
  readonly confidence_shift: { readonly from: number; readonly to: number };
}

export interface FederatedEffectivenessProfile {
  readonly archetype_signature: string;
  readonly observed_stabilization_delta: number;         // moving avg, -100..+100
  readonly propagation_reduction: number;                // moving avg
  readonly recovery_success_rate: number;                // 0-100
  readonly anomaly_frequency: number;                    // 0-100
  readonly organizational_consistency: number;           // 0-100
  readonly confidence_evolution: ReadonlyArray<{ readonly recorded_at: string; readonly value: number }>;
  readonly built_at: string;
}

// ─── Archetype reliability evolution ──────────────────────────────────

export interface ArchetypeReliabilityProfile {
  readonly archetype_signature: string;
  readonly current_tier: ArchetypeReliabilityTier;
  readonly current_score: number;                        // 0-100
  readonly observation_count: number;
  readonly net_improvement_count: number;
  readonly net_regression_count: number;
  readonly stabilization_consistency: number;            // 0-100
  readonly anomaly_pressure: number;                     // 0-100
  readonly replay_reliability: number;                   // 0-100
  readonly organizational_usefulness: number;            // 0-100
  readonly history: ReadonlyArray<{
    readonly recorded_at: string;
    readonly tier: ArchetypeReliabilityTier;
    readonly score: number;
    readonly reason: string;
  }>;
  readonly last_attribution: FederatedLearningAttribution | null;
}

// ─── Organizational stabilization intelligence ──────────────────────

export interface OrganizationalStabilizationInsight {
  readonly archetype_signature: string;
  readonly archetype_kind: ArchetypeKind;
  readonly stabilization_score: number;                  // 0-100; aggregated effectiveness
  readonly fastest_stabilization_minutes: number;
  readonly avg_propagation_reduction: number;            // 0-100
  readonly total_observations: number;
  readonly unique_consumer_count: number;
  readonly notes: string;
}

export interface OrganizationalStabilizationReport {
  readonly organization_id: string;
  readonly insights: ReadonlyArray<OrganizationalStabilizationInsight>;
  readonly worst_recurring_drift_signature: string | null;
  readonly built_at: string;
}

// ─── Federated impact diffusion replay ──────────────────────────────

export interface DiffusionReplayEntry {
  readonly index: number;
  readonly archetype_signature: string;
  readonly source_project: string;
  readonly consumer_projects: ReadonlyArray<string>;
  readonly local_calibrations_generated: number;
  readonly stabilization_improved_count: number;
  readonly stabilization_regressed_count: number;
  readonly observed_at: string;
  readonly summary: string;
}

export interface FederatedImpactDiffusionReplay {
  readonly organization_id: string;
  readonly archetype_signature: string | null;          // null = whole-org replay
  readonly entries: ReadonlyArray<DiffusionReplayEntry>;
  readonly truncated: boolean;
  readonly built_at: string;
}

// ─── Federation drift ────────────────────────────────────────────────

export type FederationDriftTier =
  | 'stable'          // no detected drift
  | 'monitoring'      // mild signals
  | 'fragmenting'     // moderate org-level drift
  | 'unstable';       // strong drift signals require operator review

export type FederationDriftSignalKind =
  | 'archetype_propagation_volatility'
  | 'replay_instability'
  | 'anomaly_clustering'
  | 'routing_divergence'
  | 'policy_inconsistency'
  | 'visibility_fragmentation';

export interface FederationDriftSignal {
  readonly kind: FederationDriftSignalKind;
  readonly score: number;                                // 0-100
  readonly explanation: string;
  readonly observed_at: string;
}

export interface FederationDriftProfile {
  readonly organization_id: string;
  readonly tier: FederationDriftTier;
  readonly signals: ReadonlyArray<FederationDriftSignal>;
  readonly drift_pressure_score: number;                 // 0-100 composite
  readonly built_at: string;
}

// ─── Federation visibility replay ────────────────────────────────────

export interface VisibilityReplayEntry {
  readonly index: number;
  readonly archetype_signature: string;
  readonly visible_to_projects: ReadonlyArray<string>;
  readonly consumed_by_projects: ReadonlyArray<string>;
  readonly local_calibrations_generated: ReadonlyArray<{ project: string; proposal_id: string }>;
  readonly stabilization_change_summary: string;
  readonly governance_drift_summary: string;
  readonly observed_at: string;
}

export interface FederationVisibilityReplay {
  readonly organization_id: string;
  readonly entries: ReadonlyArray<VisibilityReplayEntry>;
  readonly truncated: boolean;
  readonly window_start: string;
  readonly window_end: string;
  readonly built_at: string;
}

// ─── Federation policy evolution ─────────────────────────────────────

export type PolicyEvolutionKind =
  | 'tighten_share_permissions'
  | 'broaden_share_permissions'
  | 'adjust_visibility_inheritance'
  | 'adjust_archetype_kind_scope'
  | 'adjust_organizational_partitioning'
  | 'adjust_replay_permissions';

export type PolicyProposalStatus =
  | 'pending_operator'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'rolled_back';

/**
 * Required by the Phase 20 addendum — every policy proposal carries
 * impact bounds so operators avoid false certainty in federation
 * governance evolution.
 */
export interface PolicyEvolutionImpactBounds {
  readonly expected_federation_impact: number;          // 0-100
  readonly organizational_visibility_impact: number;    // 0-100
  readonly stabilization_influence_estimate: number;    // 0-100
  readonly rollback_confidence: number;                 // 0-100
  readonly uncertainty_drivers: ReadonlyArray<string>;
}

export interface FederationPolicyEvolutionProposal {
  readonly proposal_id: string;
  readonly organization_id: string;
  readonly project_id: string;                         // proposing project
  readonly evolution_kind: PolicyEvolutionKind;
  readonly proposed_change: Readonly<Record<string, unknown>>;
  readonly rationale: string;
  readonly impact_bounds: PolicyEvolutionImpactBounds;
  readonly forecasted_impact: ReadonlyArray<string>;
  readonly rollback_path: ReadonlyArray<string>;
  readonly operator_required: true;
  readonly created_at: string;
  readonly status: PolicyProposalStatus;
  readonly decided_at: string | null;
  readonly decided_by: string | null;
}

// ─── Federated health surfaces ───────────────────────────────────────

export interface FederatedLearningHealthScores {
  readonly federated_effectiveness: number;             // 0-100
  readonly organizational_stabilization: number;        // 0-100
  readonly federation_drift_pressure: number;           // 0-100; LOWER = better
  readonly archetype_reliability: number;               // 0-100; mean reliability
  readonly federation_visibility_integrity: number;     // 0-100
  readonly policy_evolution_stability: number;          // 0-100
}

// ─── Engine surface ──────────────────────────────────────────────────

export interface FederatedLearningSummarySnapshot {
  readonly archetypes_tracked: number;
  readonly archetypes_trusted: number;
  readonly archetypes_degraded: number;
  readonly active_drift_signals: number;
  readonly drift_tier: FederationDriftTier;
  readonly pending_policy_proposals: number;
  readonly approved_policies_24h: number;
  readonly rejected_policies_24h: number;
  readonly health_scores: FederatedLearningHealthScores;
}

// ─── Re-exports ──────────────────────────────────────────────────────

export type { ArchetypeKind };
