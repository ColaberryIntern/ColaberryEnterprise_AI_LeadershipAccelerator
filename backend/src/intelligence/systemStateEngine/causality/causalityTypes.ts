/**
 * causalityTypes — Phase 16. Type definitions for causal operational
 * reasoning. Every causality module imports from this file; no
 * competing definitions are allowed elsewhere in the engine.
 *
 * Architectural commitment (per the Phase 16 stress-test):
 *   - Validators are PURE FUNCTIONS, not separate processes/agents.
 *   - "Distributed cognition" = N scoring algorithms voting on the
 *     same evidence, NOT N processes/sub-Claudes.
 *   - "Operational epidemiology" = temporal+spatial clustering of
 *     contradictions/failures, NOT an SIR model.
 *   - Replay is a structured backend trace; rendering is the UI's job.
 *   - Hard caps on depth (5) + decay (0.5/gen) prevent runaway propagation.
 */

import type { MutationIntent, MutationEnvelope } from '../mutation/mutationTypes';
import type { ContradictionFlag, ContradictionKind } from '../types/systemState.types';

// ─── Hard architectural caps ───────────────────────────────────────────

export const MAX_LINEAGE_DEPTH = 5;
export const TRUST_DECAY_PER_GENERATION = 0.5;
export const MAX_PROPAGATION_HOPS = 5;
export const MAX_REPLAY_TRACE_NODES = 200;
export const PROPAGATION_TEMPORAL_WINDOW_MS = 30 * 60 * 1000;   // 30 min

// ─── Operational lineage graph ─────────────────────────────────────────

export type LineageNodeKind =
  | 'mutation'              // Phase 15 envelope
  | 'contradiction'         // contradictionDetector flag
  | 'rollback'              // rollback completion event
  | 'remediation'           // Phase 11 cluster resolution
  | 'governance_decision'   // automation mode change, policy nudge
  | 'stabilization';        // containment workflow

export interface LineageNode {
  readonly node_id: string;            // canonical id (mutation_id / contradiction kind+ts / etc.)
  readonly kind: LineageNodeKind;
  readonly project_id: string;
  readonly subject_id: string | null;  // capability id / cluster signature / etc.
  readonly timestamp: string;          // ISO
  readonly summary: string;            // short human-readable description
  readonly severity: 'info' | 'warning' | 'error';
  /** Domain-specific payload — mutation envelope, contradiction flag, etc. */
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface LineageEdge {
  readonly from: string;     // node_id
  readonly to: string;       // node_id (the descendant)
  readonly relation: 'caused' | 'amplified' | 'contained' | 'rolled_back' | 'remediated' | 'co_occurred';
  readonly confidence: number;     // 0-100; how confident we are this edge is causal
  /** Why we think this edge exists — short, replay-safe sentence. */
  readonly evidence: string;
}

export interface OperationalLineageGraph {
  readonly project_id: string;
  readonly nodes: ReadonlyArray<LineageNode>;
  readonly edges: ReadonlyArray<LineageEdge>;
  readonly root_node_ids: ReadonlyArray<string>;        // nodes with no incoming edges
  readonly leaf_node_ids: ReadonlyArray<string>;        // nodes with no outgoing edges
  readonly max_observed_depth: number;
  readonly built_at: string;
}

// ─── Contradiction propagation ─────────────────────────────────────────

export interface ContradictionCluster {
  readonly cluster_id: string;
  readonly anchor_kind: ContradictionKind;
  readonly project_id: string;
  readonly window_start: string;
  readonly window_end: string;
  /** Subset of contradictions that landed in this cluster. */
  readonly members: ReadonlyArray<ContradictionFlag>;
  /** Capability ids / cluster signatures the cluster touched. */
  readonly affected_subjects: ReadonlyArray<string>;
  /** Ratio of cluster size to project total contradictions in the window. */
  readonly density: number;
}

export interface ContradictionPropagationProfile {
  readonly project_id: string;
  readonly clusters: ReadonlyArray<ContradictionCluster>;
  readonly total_contradictions_in_window: number;
  readonly hotspots: ReadonlyArray<{
    readonly subject_id: string;
    readonly count: number;
    readonly worst_severity: 'info' | 'warning' | 'error';
  }>;
  readonly built_at: string;
}

// ─── Causal trust propagation ──────────────────────────────────────────

export interface CausalTrustPropagationEntry {
  readonly node_id: string;
  readonly mutation_intent: MutationIntent | null;
  readonly own_trust_score: number;        // 0-100; the node's local trust at evaluation time
  readonly inherited_trust_decay: number;  // 0-100; cumulative decay inherited from ancestors
  readonly effective_trust: number;        // own_trust * (1 - inherited_decay/100)
  readonly ancestry_depth: number;
}

export interface CausalTrustPropagationMap {
  readonly project_id: string;
  readonly entries: ReadonlyArray<CausalTrustPropagationEntry>;
  readonly worst_inherited_decay: number;
  readonly built_at: string;
}

// ─── Distributed validation harness ────────────────────────────────────

export type ValidatorRole =
  | 'mutation_validator'
  | 'rollback_validator'
  | 'trust_validator'
  | 'containment_validator'
  | 'blast_radius_validator';

export type ValidatorRecommendation = 'apply' | 'reject' | 'monitor' | 'rollback' | 'contain';

export interface ValidatorVerdict {
  readonly validator_type: ValidatorRole;
  readonly confidence: number;                                  // 0-100
  readonly recommendation: ValidatorRecommendation;
  /** Replay-safe deterministic explanation of this verdict. */
  readonly rationale: string;
  /** Concrete signals the validator looked at (telemetry deltas, blast tier, etc.). */
  readonly evidence: Readonly<Record<string, unknown>>;
  /** Specific concerns this validator wants the arbitration engine to weigh. */
  readonly disagreement_flags: ReadonlyArray<string>;
  /** Things the validator thinks could propagate; consumed by stabilization engine. */
  readonly propagation_concerns: ReadonlyArray<string>;
  /** Optional remediations the validator suggests. */
  readonly stabilization_recommendations: ReadonlyArray<string>;
}

export interface ValidationArbitrationResult {
  readonly mutation_id: string;
  readonly verdicts: ReadonlyArray<ValidatorVerdict>;
  readonly consensus_recommendation: ValidatorRecommendation;
  readonly consensus_confidence: number;        // 0-100, weighted avg
  readonly confidence_range: { readonly min: number; readonly max: number };
  /** Set when at least one validator's verdict diverges materially. */
  readonly minority_warning: string | null;
  /** Score 0-100; higher = more risky to act on consensus alone. */
  readonly arbitration_risk: number;
  readonly escalation_required: boolean;
  readonly built_at: string;
}

export interface ValidatorDisagreementProfile {
  readonly validator_pair: readonly [ValidatorRole, ValidatorRole];
  readonly disagreement_rate: number;                             // 0-100 over the window
  readonly disagreement_topics: ReadonlyArray<string>;
  readonly confidence_divergence: number;                          // average |Δ| in confidence
  readonly arbitration_frequency: number;                          // how often this pair forced arbitration
  readonly escalation_rate: number;                                // 0-100; subset of arbitrations that escalated
}

export interface ValidatorTrustEntry {
  readonly validator_type: ValidatorRole;
  readonly trust_score: number;          // 0-100 calibrated; cold-start 70
  readonly agreement_rate: number;       // 0-100, vs the eventual consensus
  readonly observations: number;
  readonly drift_signal: 'stable' | 'over_triggering' | 'under_detecting' | 'inconsistent';
}

export interface ValidatorTrustProfile {
  readonly project_id: string;
  readonly entries: ReadonlyArray<ValidatorTrustEntry>;
  readonly disagreement_profiles: ReadonlyArray<ValidatorDisagreementProfile>;
  readonly built_at: string;
}

// ─── Root-cause analysis ──────────────────────────────────────────────

export interface CausalConfidenceAttribution {
  readonly node_id: string;
  /** 0-100; how confident we are this node is the originating root. */
  readonly root_cause_confidence: number;
  /** Short replay-safe sentences listing the supporting evidence. */
  readonly supporting_evidence: ReadonlyArray<string>;
  /** 0-100; how strongly instability propagated from this node. */
  readonly propagation_strength: number;
  /** 0-100; how concentrated contradictions are around this node + descendants. */
  readonly contradiction_density: number;
  /** 0-100; how much validators agree this is the root. */
  readonly validator_agreement: number;
  /** Penalty for being deep in the lineage (deeper = less likely the root). */
  readonly lineage_depth_penalty: number;
}

export interface RootCauseAnalysis {
  readonly project_id: string;
  readonly target_mutation_id: string | null;
  readonly identified_roots: ReadonlyArray<{
    readonly node: LineageNode;
    readonly attribution: CausalConfidenceAttribution;
    readonly ancestry: ReadonlyArray<LineageNode>;
    readonly descendants_count: number;
    readonly stabilization_recommendation: string;
    readonly rollback_targeting_suggestion: string;
  }>;
  readonly built_at: string;
}

// ─── Stabilization priority + classification ──────────────────────────

export type OperationalSpreadClassification =
  | 'localized'        // contained to a single subject; no fanout
  | 'branching'        // 2-3 descendants in lineage; bounded fanout
  | 'cascading'        // ≥4 descendants; fast spread
  | 'recurrent'        // same root reappears in successive windows
  | 'isolated'         // already contained by Phase 15 containment
  | 'suppressed';      // operator-frozen / paused

export interface StabilizationPriorityScore {
  readonly node_id: string;
  readonly score: number;                                  // 0-100 composite
  readonly propagation_risk: number;
  readonly contradiction_density: number;
  readonly validator_consensus: number;
  readonly trust_decay_impact: number;
  readonly classification: OperationalSpreadClassification;
}

export interface CausalStabilizationPlan {
  readonly project_id: string;
  readonly priorities: ReadonlyArray<StabilizationPriorityScore>;
  readonly recommended_actions: ReadonlyArray<{
    readonly node_id: string;
    readonly action: 'contain_root' | 'contain_descendants' | 'monitor' | 'rollback_targeted' | 'noop';
    readonly reason: string;
  }>;
  readonly built_at: string;
}

// ─── Operational epidemiology ─────────────────────────────────────────

export interface OperationalEpidemiologyMap {
  readonly project_id: string;
  readonly window_start: string;
  readonly window_end: string;
  readonly classified_spreads: ReadonlyArray<{
    readonly anchor_subject: string;
    readonly classification: OperationalSpreadClassification;
    readonly affected_subjects: ReadonlyArray<string>;
    readonly contradiction_count: number;
    readonly mutation_count: number;
    readonly worst_severity: 'info' | 'warning' | 'error';
  }>;
  readonly diffusion_score: number;            // 0-100; how spread out the project is right now
  readonly built_at: string;
}

// ─── Causality replay ─────────────────────────────────────────────────

export interface ReplayTraceStep {
  readonly index: number;
  readonly node: LineageNode;
  readonly parent_id: string | null;
  readonly depth: number;
  readonly annotation: string;
}

export interface CausalityReplayTrace {
  readonly project_id: string;
  readonly target_node_id: string;
  readonly steps: ReadonlyArray<ReplayTraceStep>;
  readonly truncated: boolean;
  readonly built_at: string;
}

// ─── AuthoritativeSystemState surface ─────────────────────────────────

export interface CausalitySummarySnapshot {
  readonly active_root_causes: number;
  readonly unstable_branches: number;
  readonly validator_conflicts: number;
  readonly trust_propagation_alerts: number;
  readonly contradiction_clusters: number;
}

// ─── Re-exports for convenience ───────────────────────────────────────

export type { MutationIntent, MutationEnvelope, ContradictionFlag, ContradictionKind };
