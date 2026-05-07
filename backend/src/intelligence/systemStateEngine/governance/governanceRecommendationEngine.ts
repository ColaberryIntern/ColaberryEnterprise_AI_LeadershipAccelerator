/**
 * governanceRecommendationEngine — pure scorer that emits operator-
 * facing recommendations from the current cognitive + remediation +
 * governance state.
 *
 * Recommendations carry stable shapes (priority, requires_review_within_min,
 * type, rationale, projected_outcomes, risk_level) so the dashboard can
 * present them consistently. The engine is pure: callers persist the
 * resulting recommendations to the GovernanceRecommendation table and
 * dispatch via the audit + bus surfaces.
 *
 * Phase 12 §A.2.
 */

import type { GovernanceRecommendationType, GovernanceRiskLevel } from '../../../models/GovernanceRecommendation';

export interface GovernanceRecommendationInputs {
  readonly cognitive_health_score: number;
  readonly cognitive_health_tier: 'healthy' | 'cautious' | 'degraded' | 'critical';
  readonly remediation_health_score: number;
  readonly pressure_tier: 'calm' | 'elevated' | 'urgent' | 'critical';
  readonly unresolved_error_incidents: number;
  readonly recent_regression_count: number;
  readonly active_clusters: number;
  readonly regression_prone_signatures: ReadonlyArray<string>;
  readonly override_velocity: number;
  readonly unsafe_pattern_signatures: ReadonlyArray<string>;
  readonly automation_confidence: number;       // 0-100 from automationConfidenceGate
}

export interface GovernanceRecommendation {
  readonly type: GovernanceRecommendationType;
  readonly recommendation_text: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly risk_level: GovernanceRiskLevel;
  readonly priority: number;                     // 1=top, 99=bottom
  readonly requires_review_within_min: number;
  readonly supporting_evidence: Readonly<Record<string, unknown>>;
  readonly projected_outcomes: Readonly<Record<string, unknown>>;
}

export function generateGovernanceRecommendations(input: GovernanceRecommendationInputs): GovernanceRecommendation[] {
  const out: GovernanceRecommendation[] = [];

  // 1. Critical cognitive health → escalate
  if (input.cognitive_health_tier === 'critical' || input.cognitive_health_score < 50) {
    out.push({
      type: 'request_operator_review',
      recommendation_text: `Operator review required — cognitive health is ${input.cognitive_health_tier} (${input.cognitive_health_score}/100).`,
      rationale: `When cognitive health is critical, autonomous adjustments tend to amplify problems. Pause for human triage before further changes.`,
      confidence: 90,
      risk_level: 'high',
      priority: 1,
      requires_review_within_min: 15,
      supporting_evidence: { cognitive_health_score: input.cognitive_health_score, cognitive_health_tier: input.cognitive_health_tier },
      projected_outcomes: { hold_changes_until_reviewed: true },
    });
  }

  // 2. Pressure critical → pause orchestration
  if (input.pressure_tier === 'critical' && input.unresolved_error_incidents > 0) {
    out.push({
      type: 'pause_orchestration',
      recommendation_text: `Pause autonomous orchestration. Pressure is critical and ${input.unresolved_error_incidents} error incident(s) are unresolved.`,
      rationale: 'Continuing orchestration under critical pressure with unresolved errors risks compounding failures.',
      confidence: 85,
      risk_level: 'high',
      priority: 2,
      requires_review_within_min: 30,
      supporting_evidence: { pressure_tier: input.pressure_tier, unresolved_error_incidents: input.unresolved_error_incidents },
      projected_outcomes: { orchestration_paused: true, expected_pressure_decay_min: 30 },
    });
  }

  // 3. Active regressions → escalate remediation
  if (input.recent_regression_count >= 2) {
    out.push({
      type: 'escalate_remediation',
      recommendation_text: `Escalate remediation — ${input.recent_regression_count} regression(s) detected recently.`,
      rationale: 'Regressions indicate previous fixes are unstable. Surface the affected clusters for explicit operator review.',
      confidence: 75,
      risk_level: 'elevated',
      priority: 3,
      requires_review_within_min: 60,
      supporting_evidence: { recent_regression_count: input.recent_regression_count, regression_prone_signatures: input.regression_prone_signatures.slice(0, 5) },
      projected_outcomes: { affected_clusters_surfaced: input.regression_prone_signatures.length },
    });
  }

  // 4. Unsafe patterns + active clusters → tighten governance
  if (input.unsafe_pattern_signatures.length > 0 && input.active_clusters > 0) {
    out.push({
      type: 'tighten_governance_threshold',
      recommendation_text: `Tighten governance threshold. ${input.unsafe_pattern_signatures.length} unsafe pattern(s) detected with ${input.active_clusters} active cluster(s).`,
      rationale: 'Unsafe patterns recurring while clusters are active suggests automation is operating outside the safe envelope.',
      confidence: 70,
      risk_level: 'moderate',
      priority: 5,
      requires_review_within_min: 120,
      supporting_evidence: { unsafe_pattern_count: input.unsafe_pattern_signatures.length, active_clusters: input.active_clusters },
      projected_outcomes: { confidence_floor_increase: 10, expected_recommendation_volume_drop_pct: 30 },
    });
  }

  // 5. Override storm signal → request review
  if (input.override_velocity >= 4) {
    out.push({
      type: 'request_operator_review',
      recommendation_text: `Operator override velocity is high (${input.override_velocity} in last 30 min).`,
      rationale: 'Frequent overrides indicate the recommendation engine is not aligned with operator intent. Pause and recalibrate.',
      confidence: 80,
      risk_level: 'elevated',
      priority: 4,
      requires_review_within_min: 30,
      supporting_evidence: { override_velocity: input.override_velocity },
      projected_outcomes: { recommendation_engine_paused: true },
    });
  }

  // 6. Healthy state + clusters present → prepare a remediation plan (operator-approved)
  if (input.cognitive_health_tier === 'healthy' && input.active_clusters > 0
      && input.automation_confidence >= 60 && input.override_velocity < 2) {
    out.push({
      type: 'prepare_remediation_plan',
      recommendation_text: `Prepare an autonomous remediation plan for review. ${input.active_clusters} cluster(s) await fixing under stable conditions.`,
      rationale: 'Cognitive health is healthy, automation confidence is high, override velocity is low — ideal conditions for staged remediation.',
      confidence: input.automation_confidence,
      risk_level: 'low',
      priority: 20,
      requires_review_within_min: 240,
      supporting_evidence: { active_clusters: input.active_clusters, automation_confidence: input.automation_confidence },
      projected_outcomes: { plan_drafts_to_create: Math.min(3, input.active_clusters) },
    });
  }

  // 7. Sustained healthy + high confidence + no overrides → loosen threshold
  if (input.cognitive_health_tier === 'healthy' && input.automation_confidence >= 80
      && input.override_velocity === 0 && input.unsafe_pattern_signatures.length === 0) {
    out.push({
      type: 'loosen_governance_threshold',
      recommendation_text: 'Consider loosening the governance threshold to allow more autonomous action.',
      rationale: 'Sustained healthy state, high automation confidence, zero overrides, and no unsafe patterns — the system is operating within the safe envelope.',
      confidence: 65,
      risk_level: 'low',
      priority: 60,
      requires_review_within_min: 1440,
      supporting_evidence: { automation_confidence: input.automation_confidence, override_velocity: 0 },
      projected_outcomes: { confidence_floor_decrease: 5, expected_recommendation_volume_increase_pct: 15 },
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}
