/**
 * automationConfidenceGate — Phase 12 confidence-gating for automation
 * actions. Distinct from safeLearningGuardrails (which gates priority-
 * weight proposals) — this one gates governance/automation decisions
 * (recommendations, prepared plans, override-driven actions).
 *
 * Pure scorer. Combines:
 *   - OrchestrationConfidence (Phase 10 calibrator)
 *   - RemediationHealthIndex (Phase 10.5)
 *   - recent operator-override count (governanceMemory.override_velocity)
 *   - per-project policy floors
 *   - unsafe pattern matches
 *
 * Returns AutomationConfidence — used by both the recommendation engine
 * (to mark recommendations as "automation_ready") and the dashboard
 * (to show the operator why automation is or isn't allowed).
 *
 * Phase 12 §A.3.
 */

import { decideByMode, type AutomationMode, type AutomationModeDecision } from '../policy/automationModes';

export interface AutomationConfidenceInputs {
  readonly mode: AutomationMode;
  readonly orchestration_confidence: number;     // 0-100 (Phase 10 calibrator)
  readonly remediation_health_score: number;     // 0-100 (Phase 10.5)
  readonly override_velocity: number;            // count over last 30 min
  readonly unsafe_pattern_signatures: ReadonlyArray<string>;
  readonly proposed_signature?: string | null;   // signature being proposed
  readonly min_confidence_to_apply: number;      // policy floor (0-100)
  readonly recent_storm: boolean;                 // last override storm < 30 min ago
  readonly regression_risk: number;              // 0-100 (HIGH = bad)
}

export interface AutomationConfidence {
  readonly automation_allowed: boolean;
  readonly confidence: number;
  readonly tier: 'low' | 'moderate' | 'high';
  readonly blocking_reasons: ReadonlyArray<string>;
  readonly evidence_strength: number;
  readonly regression_risk: number;
  readonly governance_risk: number;
  readonly required_human_review: boolean;
  readonly mode_decision: AutomationModeDecision;
}

const OVERRIDE_VELOCITY_PENALTY_PER = 5;   // 5 points per recent override
const STORM_PENALTY = 25;
const UNSAFE_MATCH_PENALTY = 30;

export function evaluateAutomationConfidence(inputs: AutomationConfidenceInputs): AutomationConfidence {
  const blocking_reasons: string[] = [];

  // Compose a single 0-100 confidence:
  //   start from min(orchestration_confidence, remediation_health_score)
  //   subtract per-override penalty, storm penalty, unsafe-match penalty
  let confidence = Math.min(inputs.orchestration_confidence, inputs.remediation_health_score);
  confidence -= Math.min(40, inputs.override_velocity * OVERRIDE_VELOCITY_PENALTY_PER);
  if (inputs.recent_storm) {
    confidence -= STORM_PENALTY;
    blocking_reasons.push('Override storm detected within last 30 minutes.');
  }
  const unsafeMatch = inputs.proposed_signature
    && inputs.unsafe_pattern_signatures.includes(inputs.proposed_signature);
  if (unsafeMatch) {
    confidence -= UNSAFE_MATCH_PENALTY;
    blocking_reasons.push(`Proposed signature matches an unsafe pattern: ${inputs.proposed_signature}.`);
  }
  if (inputs.regression_risk > 70) {
    blocking_reasons.push(`Regression risk is high (${Math.round(inputs.regression_risk)}/100).`);
  }
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const evidence_strength = Math.round((inputs.orchestration_confidence + inputs.remediation_health_score) / 2);
  const governance_risk = Math.min(100, inputs.override_velocity * 8 + (inputs.recent_storm ? 30 : 0) + (unsafeMatch ? 20 : 0));

  const mode_decision = decideByMode({
    mode: inputs.mode,
    confidence,
    min_confidence_to_apply: inputs.min_confidence_to_apply,
    block_reasons: blocking_reasons,
    reject_reason_if_frozen: 'Automation mode is frozen.',
  });

  const automation_allowed = mode_decision.action === 'apply';
  const tier: AutomationConfidence['tier'] =
    confidence >= 70 ? 'high' :
    confidence >= 45 ? 'moderate' :
    'low';

  return {
    automation_allowed,
    confidence,
    tier,
    blocking_reasons,
    evidence_strength,
    regression_risk: Math.round(inputs.regression_risk),
    governance_risk,
    required_human_review: !automation_allowed,
    mode_decision,
  };
}
