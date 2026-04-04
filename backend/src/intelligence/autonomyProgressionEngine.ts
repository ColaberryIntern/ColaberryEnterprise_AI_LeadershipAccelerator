/**
 * Autonomy Progression Engine
 * Tracks process maturity and recommends autonomy level changes.
 */
import Capability from '../models/Capability';
import IntelligenceDecision from '../models/IntelligenceDecision';
import AiAgent from '../models/AiAgent';
import { Op } from 'sequelize';

export interface AutonomyAssessment {
  current_level: string;
  recommended_level: string;
  recommendation_reason: string;
  eligible_for_promotion: boolean;
  metrics: { success_rate_30d: number; failure_rate_30d: number; manual_override_count: number; approval_dependency_pct: number; avg_confidence: number; total_executions: number };
  risk_flags: string[];
}

const THRESHOLDS: Record<string, { success: number; failure: number; min_executions: number }> = {
  'manual_to_assisted': { success: 0.70, failure: 0.15, min_executions: 10 },
  'assisted_to_supervised': { success: 0.85, failure: 0.08, min_executions: 30 },
  'supervised_to_autonomous': { success: 0.95, failure: 0.03, min_executions: 100 },
};

const LEVELS = ['manual', 'assisted', 'supervised', 'autonomous'];

export async function assessAutonomy(processId: string): Promise<AutonomyAssessment> {
  const process = await Capability.findByPk(processId);
  if (!process) throw new Error('Process not found');

  const currentLevel = process.autonomy_level || 'manual';
  const currentIdx = LEVELS.indexOf(currentLevel);

  // Gather metrics from linked agents
  const agentNames = process.linked_agents || [];
  let totalExecutions = 0, successes = 0, failures = 0, overrides = 0;
  let totalConfidence = 0, decisionCount = 0;

  // Count from IntelligenceDecision (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const decisions = await IntelligenceDecision.findAll({
    where: { created_at: { [Op.gte]: thirtyDaysAgo } } as any,
    attributes: ['execution_status', 'confidence_score'],
  });

  for (const d of decisions) {
    totalExecutions++;
    const status = (d as any).execution_status;
    if (status === 'completed' || status === 'executed') successes++;
    if (status === 'failed' || status === 'rolled_back') failures++;
    if (status === 'rejected') overrides++;
    if ((d as any).confidence_score) { totalConfidence += (d as any).confidence_score; decisionCount++; }
  }

  const successRate = totalExecutions > 0 ? successes / totalExecutions : 0;
  const failureRate = totalExecutions > 0 ? failures / totalExecutions : 0;
  const approvalPct = totalExecutions > 0 ? overrides / totalExecutions : 1;
  const avgConfidence = decisionCount > 0 ? totalConfidence / decisionCount : 0;

  // Determine recommendation
  let recommendedLevel = currentLevel;
  let reason = 'Maintaining current level';
  let eligible = false;
  const riskFlags: string[] = [];

  // Check for promotion
  if (currentIdx < LEVELS.length - 1) {
    const nextLevel = LEVELS[currentIdx + 1];
    const key = `${currentLevel}_to_${nextLevel}`;
    const threshold = THRESHOLDS[key];
    if (threshold && successRate >= threshold.success && failureRate <= threshold.failure && totalExecutions >= threshold.min_executions) {
      recommendedLevel = nextLevel;
      reason = `Success rate ${(successRate * 100).toFixed(0)}% exceeds ${(threshold.success * 100).toFixed(0)}% threshold with ${totalExecutions} executions`;
      eligible = true;
    }
  }

  // Check for demotion
  if (failureRate > 0.20) {
    recommendedLevel = LEVELS[Math.max(0, currentIdx - 1)];
    reason = `Failure rate ${(failureRate * 100).toFixed(0)}% exceeds 20% — recommend demotion`;
    riskFlags.push('High failure rate');
  }

  // Update process metrics
  process.success_rate = successRate;
  process.failure_rate = failureRate;
  process.confidence_score = avgConfidence;
  process.approval_dependency_pct = approvalPct;
  await process.save();

  return {
    current_level: currentLevel,
    recommended_level: recommendedLevel,
    recommendation_reason: reason,
    eligible_for_promotion: eligible,
    metrics: { success_rate_30d: successRate, failure_rate_30d: failureRate, manual_override_count: overrides, approval_dependency_pct: approvalPct, avg_confidence: avgConfidence, total_executions: totalExecutions },
    risk_flags: riskFlags,
  };
}

export async function applyAutonomyChange(processId: string, newLevel: string, reason: string): Promise<void> {
  const process = await Capability.findByPk(processId);
  if (!process) throw new Error('Process not found');
  if (!LEVELS.includes(newLevel)) throw new Error('Invalid autonomy level');

  const history = process.autonomy_history || [];
  history.push({ from: process.autonomy_level, to: newLevel, reason, timestamp: new Date().toISOString(), triggered_by: 'admin' });

  process.autonomy_level = newLevel;
  process.autonomy_history = history;
  await process.save();
}
