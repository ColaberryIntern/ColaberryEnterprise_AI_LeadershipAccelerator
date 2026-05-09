/**
 * federationTypes — Phase 19. Federated organizational governance
 * intelligence + consent-bound learning.
 *
 * Architectural commitment (per the Phase 19 stress-test + addendum):
 *   - Federation is per-organization, explicit opt-in, in-memory only.
 *     NO global state. NO centralized broker. NO cross-project trust
 *     mutation.
 *   - Anonymization strips project_id, capability ids, cluster
 *     signatures, free-text rationale. Shared archetypes carry only
 *     anonymized sequence patterns + outcome statistics.
 *   - Calibration impact replay = before/after delta over OBSERVED
 *     metrics, not predictive simulation.
 *   - Anomaly detection = heuristic z-score + rolling-window stddev.
 *     Not ML.
 *   - Federated archetypes are INFORMATIONAL only. Consumers must
 *     create a Phase 18 calibration proposal locally + operator-approve
 *     to actually apply anything.
 *   - Federation lineage is read-only. No write-back loops.
 *   - Hard architectural vetoes remain absolute.
 */

import type { ValidatorRole } from '../causality/causalityTypes';

// ─── Hard architectural caps ───────────────────────────────────────────

export const MAX_FEDERATED_ARCHETYPES_PER_ORG = 200;
export const MAX_LINEAGE_ENTRIES_PER_ARCHETYPE = 100;
export const MAX_DRIFT_REPLAY_ENTRIES = 200;
export const MAX_ANOMALY_OBSERVATIONS_PER_SIGNAL = 50;
export const ANOMALY_Z_SCORE_THRESHOLD = 2.0;
export const ANOMALY_MIN_OBSERVATIONS = 5;
export const CALIBRATION_IMPACT_DEFAULT_WINDOW_HOURS = 4;
export const CALIBRATION_IMPACT_MAX_WINDOW_HOURS = 24;

// ─── Federation isolation tiers ───────────────────────────────────────

export type FederationIsolationTier =
  | 'isolated'              // no federation; project does not share or consume
  | 'local_only'            // project shares within project boundary only (effectively isolated)
  | 'organizational'        // project shares + consumes within its organization
  | 'restricted'            // operator-restricted federation (specific archetype kinds only)
  | 'visibility_limited';   // consumer-only; project consumes but does not share back

// ─── Federation consent ───────────────────────────────────────────────

export type ArchetypeKind =
  | 'contradiction_archetype'
  | 'recovery_archetype'
  | 'routing_archetype'
  | 'governance_drift_signature'
  | 'stabilization_pattern';

export interface FederationConsentProfile {
  readonly project_id: string;
  /** The organization the project federates within. null = isolated. */
  readonly organization_id: string | null;
  /** Master switch — if false, no federation activity regardless of granular flags. */
  readonly federation_enabled: boolean;
  /** Per-archetype-kind sharing permissions. */
  readonly share_permissions: Readonly<Record<ArchetypeKind, boolean>>;
  /** Per-archetype-kind consumption permissions. */
  readonly consume_permissions: Readonly<Record<ArchetypeKind, boolean>>;
  /** Anonymization level — 'standard' = strip identifiers; 'strict' = also hash signatures. */
  readonly anonymization_level: 'standard' | 'strict';
  /** Read-only — derived from the master + permission flags. */
  readonly isolation_tier: FederationIsolationTier;
  readonly updated_at: string;
  readonly updated_by: string | null;
}

// ─── Federated archetype shape ────────────────────────────────────────

export interface AnonymizedArchetypePayload {
  readonly archetype_signature: string;       // hashed, anonymized
  readonly kind: ArchetypeKind;
  /** Anonymized step sequence — kinds only, no project-specific subjects. */
  readonly step_sequence: ReadonlyArray<string>;
  readonly observed_count: number;
  readonly success_rate: number;              // 0-100
  readonly avg_minutes_to_stabilize: number;
  /** Non-identifying notes only. */
  readonly notes: ReadonlyArray<string>;
}

/**
 * Confidence quality envelope per the Phase 19 addendum. Federated
 * archetypes expose CONFIDENCE QUALITY, not just existence.
 */
export interface FederatedArchetypeConfidence {
  readonly archetype_signature: string;
  readonly source_count: number;                // how many projects contributed
  readonly stabilization_consistency: number;   // 0-100; lower stddev across sources = higher consistency
  readonly replay_consistency: number;          // 0-100; reproducibility on re-fetch
  readonly anomaly_rate: number;                // 0-100; fraction of contributions that hit anomaly thresholds
  readonly confidence_range: { readonly low: number; readonly high: number };
}

export interface FederatedArchetype {
  readonly archetype: AnonymizedArchetypePayload;
  readonly confidence: FederatedArchetypeConfidence;
  readonly first_observed_at: string;
  readonly last_observed_at: string;
}

// ─── Calibration impact replay (observed delta) ─────────────────────

/**
 * Pure analytical view: state at calibration approval timestamp T,
 * compared with state at T+window_hours. NOT predictive simulation.
 */
export interface CalibrationImpactDelta {
  readonly metric: 'stabilization_confidence' | 'contradiction_count' | 'routing_volatility' | 'forecast_within_bounds_rate' | 'recovery_success_rate';
  readonly before_value: number;
  readonly after_value: number;
  readonly delta: number;
  readonly direction: 'improved' | 'unchanged' | 'degraded';
  readonly notes: ReadonlyArray<string>;
}

export interface CalibrationImpactReplay {
  readonly project_id: string;
  readonly proposal_id: string;
  readonly approval_timestamp: string;
  readonly window_hours: number;
  readonly deltas: ReadonlyArray<CalibrationImpactDelta>;
  readonly overall_assessment: 'net_improvement' | 'net_neutral' | 'net_regression';
  readonly built_at: string;
}

// ─── Anomaly-aware forecast tuning ──────────────────────────────────

export type ForecastAnomalyKind =
  | 'volatility_spike'
  | 'contradiction_spike'
  | 'routing_instability'
  | 'governance_fragmentation'
  | 'forecast_divergence';

export interface ForecastAnomalyEntry {
  readonly kind: ForecastAnomalyKind;
  readonly observed_value: number;
  readonly rolling_mean: number;
  readonly rolling_stddev: number;
  readonly z_score: number;
  readonly is_anomalous: boolean;
  readonly observed_at: string;
  readonly explanation: string;
}

export interface ForecastAnomalyProfile {
  readonly project_id: string;
  readonly entries: ReadonlyArray<ForecastAnomalyEntry>;
  readonly active_anomalies: number;
  readonly anomaly_pressure_score: number;     // 0-100
  readonly built_at: string;
}

// ─── Governance drift replay ────────────────────────────────────────

export type DriftReplayKind =
  | 'routing_volatility'
  | 'specialization_drift'
  | 'calibration_instability'
  | 'governance_fragmentation'
  | 'recovery_pattern_drift'
  | 'topology_instability';

export interface GovernanceDriftEntry {
  readonly index: number;
  readonly kind: DriftReplayKind;
  readonly observed_at: string;
  readonly summary: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly delta_from_baseline: number;
  readonly source_audit_kind: string;
}

export interface GovernanceDriftReplay {
  readonly project_id: string;
  readonly entries: ReadonlyArray<GovernanceDriftEntry>;
  readonly window_start: string;
  readonly window_end: string;
  readonly worst_kind: DriftReplayKind | null;
  readonly truncated: boolean;
  readonly built_at: string;
}

// ─── Federation lineage ─────────────────────────────────────────────

export interface FederationLineageNode {
  readonly node_id: string;
  readonly kind: 'source_project' | 'archetype' | 'consumer_project';
  readonly label: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface FederationLineageEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: 'shared' | 'consumed' | 'surfaced_to' | 'hashed_into';
  readonly recorded_at: string;
}

export interface FederationLineageGraph {
  readonly organization_id: string;
  readonly nodes: ReadonlyArray<FederationLineageNode>;
  readonly edges: ReadonlyArray<FederationLineageEdge>;
  readonly archetype_count: number;
  readonly source_project_count: number;
  readonly consumer_project_count: number;
  readonly built_at: string;
}

// ─── Federation consumption attribution ─────────────────────────────

/**
 * Required by the Phase 19 addendum — every time a federated archetype
 * INFLUENCES local governance, we record HOW the federation influenced
 * the operator's decision. Critical for replay + transparency.
 */
export interface FederationConsumptionAttribution {
  readonly consumer_project: string;
  readonly archetype_signature: string;
  /** What the consuming project saw and why (e.g., "high success rate in org"). */
  readonly surfaced_reason: string;
  /** What the operator did with this info: 'reviewed', 'rejected', 'approved_local_calibration'. */
  readonly operator_action: 'reviewed' | 'rejected' | 'approved_local_calibration' | 'no_action';
  /** When operator created a Phase 18 calibration proposal as a result. */
  readonly calibration_generated: { proposal_id: string } | null;
  /** True only if the operator subsequently approved that calibration locally. */
  readonly applied_locally: boolean;
  readonly recorded_at: string;
}

// ─── Federation visibility policy ───────────────────────────────────

export interface FederationVisibilityPolicy {
  readonly project_id: string;
  /** Per-archetype-kind override of share permissions. */
  readonly share_kind_overrides: Readonly<Partial<Record<ArchetypeKind, boolean>>>;
  /** Per-archetype-kind override of consume permissions. */
  readonly consume_kind_overrides: Readonly<Partial<Record<ArchetypeKind, boolean>>>;
  readonly replay_visibility: 'organization' | 'project_only' | 'none';
  readonly lineage_visibility: 'organization' | 'project_only' | 'none';
  readonly updated_at: string;
}

// ─── Organizational recovery intelligence ───────────────────────────

export interface OrganizationalRecoveryInsight {
  readonly archetype: AnonymizedArchetypePayload;
  readonly confidence: FederatedArchetypeConfidence;
  /** Whether this insight is recommended for the consuming project — true
   *  only if the consuming project has consume_permissions enabled for
   *  this archetype kind AND the org's confidence is meaningful. */
  readonly is_recommended: boolean;
  readonly recommendation_reason: string;
}

export interface OrganizationalRecoveryIntelligenceReport {
  readonly project_id: string;
  readonly organization_id: string | null;
  readonly insights: ReadonlyArray<OrganizationalRecoveryInsight>;
  readonly built_at: string;
}

// ─── Federation health surfaces ─────────────────────────────────────

export interface FederationHealthScores {
  readonly federation_stability: number;        // 0-100; consent + sharing volume stability
  readonly archetype_confidence: number;        // 0-100; avg confidence across registry
  readonly federation_drift: number;            // 0-100; from drift replay
  readonly anomaly_pressure: number;            // 0-100; from anomaly profile
  readonly visibility_integrity: number;        // 0-100; consent compliance score
}

// ─── Engine surface ─────────────────────────────────────────────────

export interface FederationSummarySnapshot {
  readonly federation_enabled: boolean;
  readonly isolation_tier: FederationIsolationTier;
  readonly archetypes_shared_24h: number;
  readonly archetypes_consumed_24h: number;
  readonly active_anomalies: number;
  readonly drift_events_detected: number;
  readonly health_scores: FederationHealthScores;
}

// ─── Re-exports for convenience ─────────────────────────────────────

export type { ValidatorRole };
