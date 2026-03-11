// ─── Risk Evaluator Agent ────────────────────────────────────────────────────
// Deterministic risk + confidence scoring for autonomous action gating.
// Gate: risk_score < 40 AND confidence_score > 70 for auto-execution.

import { registerAgent } from './agentRegistry';
import type { ActionRecommendation } from './ActionPlannerAgent';
import type { ImpactEstimate } from './ImpactEstimatorAgent';
import type { RootCauseResult } from './RootCauseAgent';
import type { RiskTier } from '../../models/IntelligenceDecision';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RiskEvaluation {
  risk_score: number;      // 0-100
  confidence_score: number; // 0-100
  risk_tier: RiskTier;
  auto_executable: boolean;
  reasoning: string[];
  breakdown: {
    blast_radius: number;     // 0-40
    reversibility: number;    // 0-30
    data_confidence: number;  // 0-30
    data_quality: number;     // 0-40
    pattern_match: number;    // 0-30
    historical_success: number; // 0-30
  };
}

// ─── Blast Radius Scoring ────────────────────────────────────────────────────

const ACTION_BLAST_RADIUS: Record<string, number> = {
  update_agent_config: 5,       // Single agent, fully reversible
  modify_agent_schedule: 8,     // Single agent timing
  adjust_lead_scoring: 15,      // Affects lead prioritization
  launch_ab_test: 10,           // Limited traffic split
  update_campaign_config: 20,   // Affects active campaign
  pause_campaign: 35,           // Stops campaign activity
};

// ─── Reversibility Scoring ───────────────────────────────────────────────────

const ACTION_REVERSIBILITY: Record<string, number> = {
  update_agent_config: 2,       // Instant rollback via before_state
  modify_agent_schedule: 3,     // Revert schedule
  launch_ab_test: 5,            // Can stop test
  adjust_lead_scoring: 8,       // Revert weights
  update_campaign_config: 10,   // Revert config, but messages already sent
  pause_campaign: 15,           // Resume, but lost time
};

// ─── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Evaluate risk and confidence for a proposed action.
 */
export function evaluateRisk(
  recommendation: ActionRecommendation,
  impact: ImpactEstimate,
  rootCause: RootCauseResult,
): RiskEvaluation {
  const reasoning: string[] = [];

  // ── Risk Score (0-100) ──
  // blast_radius(0-40) + reversibility(0-30) + data_confidence(0-30)

  const blastRadius = ACTION_BLAST_RADIUS[recommendation.action] ?? 20;
  reasoning.push(`Blast radius: ${blastRadius}/40 (${recommendation.action})`);

  const reversibility = recommendation.reversible
    ? (ACTION_REVERSIBILITY[recommendation.action] ?? 10)
    : 25;
  reasoning.push(`Reversibility: ${reversibility}/30 (${recommendation.reversible ? 'reversible' : 'NOT reversible'})`);

  // Data confidence penalty: higher penalty when impact estimate is low-confidence
  const dataConfidencePenalty = Math.round((1 - impact.confidence) * 30);
  reasoning.push(`Data confidence penalty: ${dataConfidencePenalty}/30 (impact basis: ${impact.basis})`);

  const riskScore = Math.min(100, blastRadius + reversibility + dataConfidencePenalty);

  // ── Confidence Score (0-100) ──
  // data_quality(0-40) + pattern_match(0-30) + historical_success(0-30)

  const dataQuality = Math.round(rootCause.confidence * 40);
  reasoning.push(`Data quality: ${dataQuality}/40 (root cause confidence: ${Math.round(rootCause.confidence * 100)}%)`);

  const patternMatch = rootCause.similar_past_cases.length > 0
    ? Math.round(rootCause.similar_past_cases[0].similarity * 30)
    : 5;
  reasoning.push(`Pattern match: ${patternMatch}/30 (${rootCause.similar_past_cases.length} similar case(s))`);

  const historicalSuccess = recommendation.past_success_rate !== undefined
    ? Math.round(recommendation.past_success_rate * 30)
    : 10;
  reasoning.push(`Historical success: ${historicalSuccess}/30 (${recommendation.past_success_rate !== undefined ? `${Math.round(recommendation.past_success_rate * 100)}%` : 'no history'})`);

  const confidenceScore = Math.min(100, dataQuality + patternMatch + historicalSuccess);

  // ── Risk Tier ──
  let riskTier: RiskTier;
  if (riskScore < 25) riskTier = 'safe';
  else if (riskScore < 50) riskTier = 'moderate';
  else if (riskScore < 75) riskTier = 'risky';
  else riskTier = 'dangerous';

  // ── Auto-execution gate ──
  const autoExecutable = riskScore < 40 && confidenceScore > 70;
  reasoning.push(`Gate: risk=${riskScore} < 40 AND confidence=${confidenceScore} > 70 → ${autoExecutable ? 'AUTO-EXECUTE' : 'PROPOSE ONLY'}`);

  return {
    risk_score: riskScore,
    confidence_score: confidenceScore,
    risk_tier: riskTier,
    auto_executable: autoExecutable,
    reasoning,
    breakdown: {
      blast_radius: blastRadius,
      reversibility,
      data_confidence: dataConfidencePenalty,
      data_quality: dataQuality,
      pattern_match: patternMatch,
      historical_success: historicalSuccess,
    },
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'RiskEvaluatorAgent',
  category: 'operations',
  description: 'Deterministic risk + confidence scoring for action gating',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    return {
      agent_name: 'RiskEvaluatorAgent',
      campaigns_processed: 0,
      actions_taken: [],
      errors: [],
      duration_ms: Date.now() - start,
    };
  },
});
