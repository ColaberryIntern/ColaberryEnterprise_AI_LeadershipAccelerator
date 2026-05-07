/**
 * governanceFoundation — read-only risk + recommendation surface for
 * deployment governance.
 *
 * V1 produces a structured `GovernanceAdvice` for any candidate deployment
 * action. The advice combines: cognitive health, prediction confidence,
 * pressure tier, and unresolved-incident severity. NO automated rollout
 * blocking yet — this is the foundation that Phase 11 will turn into
 * actionable gates.
 *
 * Phase 10 §18.
 */

export interface DeploymentRiskInputs {
  readonly cognitive_health_score: number;        // 0-100
  readonly cognitive_health_tier: 'healthy' | 'cautious' | 'degraded' | 'critical';
  readonly pressure_tier: 'calm' | 'elevated' | 'urgent' | 'critical';
  readonly unresolved_incidents: ReadonlyArray<{ severity: 'info' | 'warning' | 'error'; type: string; affected_routes: ReadonlyArray<string> }>;
  readonly prediction_confidence: number;          // 0-100
  readonly recent_regression_count: number;
}

export interface GovernanceAdvice {
  readonly risk_level: 'low' | 'moderate' | 'elevated' | 'high';
  readonly should_block_rollout: boolean;
  readonly recommendation: string;
  readonly contributing_factors: ReadonlyArray<string>;
  readonly required_human_approval: boolean;
  /** A list of route-prefixes the operator should watch closely post-deploy. */
  readonly watch_routes: ReadonlyArray<string>;
}

export function adviseDeploymentGovernance(input: DeploymentRiskInputs): GovernanceAdvice {
  const factors: string[] = [];
  let riskScore = 0;

  if (input.cognitive_health_tier === 'critical') {
    riskScore += 40;
    factors.push(`Cognitive health is CRITICAL (score ${input.cognitive_health_score}).`);
  } else if (input.cognitive_health_tier === 'degraded') {
    riskScore += 20;
    factors.push(`Cognitive health is DEGRADED (score ${input.cognitive_health_score}).`);
  } else if (input.cognitive_health_tier === 'cautious') {
    riskScore += 8;
  }

  if (input.pressure_tier === 'critical') {
    riskScore += 30;
    factors.push('Pressure tier is CRITICAL — operational stress is sustained.');
  } else if (input.pressure_tier === 'urgent') {
    riskScore += 18;
    factors.push('Pressure tier is URGENT.');
  } else if (input.pressure_tier === 'elevated') {
    riskScore += 6;
  }

  const errorIncidents = input.unresolved_incidents.filter(i => i.severity === 'error');
  const warningIncidents = input.unresolved_incidents.filter(i => i.severity === 'warning');
  if (errorIncidents.length > 0) {
    riskScore += Math.min(20, errorIncidents.length * 8);
    factors.push(`${errorIncidents.length} unresolved error-severity incident(s).`);
  }
  if (warningIncidents.length > 3) {
    riskScore += 8;
    factors.push(`${warningIncidents.length} unresolved warning-severity incidents.`);
  }

  if (input.prediction_confidence < 40) {
    riskScore += 10;
    factors.push(`Low prediction confidence (${input.prediction_confidence}/100) — outcomes are uncertain.`);
  }

  if (input.recent_regression_count > 0) {
    riskScore += Math.min(15, input.recent_regression_count * 5);
    factors.push(`${input.recent_regression_count} regression(s) detected recently.`);
  }

  let risk_level: GovernanceAdvice['risk_level'];
  let should_block_rollout: boolean;
  let recommendation: string;
  let required_human_approval: boolean;
  if (riskScore >= 60) {
    risk_level = 'high';
    should_block_rollout = true;
    required_human_approval = true;
    recommendation = 'BLOCK rollout. Triage error incidents + reduce pressure before proceeding.';
  } else if (riskScore >= 35) {
    risk_level = 'elevated';
    should_block_rollout = false;
    required_human_approval = true;
    recommendation = 'Require explicit operator approval. Monitor closely after deploy.';
  } else if (riskScore >= 15) {
    risk_level = 'moderate';
    should_block_rollout = false;
    required_human_approval = false;
    recommendation = 'Proceed with caution. Recommend canary or staged rollout.';
  } else {
    risk_level = 'low';
    should_block_rollout = false;
    required_human_approval = false;
    recommendation = 'Safe to proceed.';
  }

  // Watch routes: routes mentioned in current unresolved incidents.
  const watchSet = new Set<string>();
  for (const inc of input.unresolved_incidents) {
    for (const r of inc.affected_routes) watchSet.add(r);
  }

  return {
    risk_level,
    should_block_rollout,
    recommendation,
    contributing_factors: factors,
    required_human_approval,
    watch_routes: Array.from(watchSet),
  };
}
