import { RequirementsMap, ProgressionLog, VerificationLog } from '../../models';
import { getConnection } from '../githubService';
import { Op } from 'sequelize';

export interface HealthMetrics {
  health_score: number;
  velocity_score: number;
  stability_score: number;
}

export async function computeHealth(
  projectId: string,
  enrollmentId: string,
  anomalyCount: number
): Promise<HealthMetrics> {
  // Velocity: progression rate (decisions per day, recent activity)
  const velocity_score = await computeVelocity(projectId, enrollmentId);

  // Stability: inverse of failure/block rate
  const stability_score = await computeStability(projectId, anomalyCount);

  // Verification confidence average
  const avgConfidence = await computeAvgConfidence(projectId);

  // Health = weighted combination
  const health_score = Math.round(
    (avgConfidence * 0.4 + velocity_score * 0.3 + stability_score * 0.3) * 100
  ) / 100;

  return {
    health_score: Math.max(0, Math.min(1, health_score)),
    velocity_score: Math.round(velocity_score * 100) / 100,
    stability_score: Math.round(stability_score * 100) / 100,
  };
}

async function computeVelocity(projectId: string, enrollmentId: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Count recent progression decisions
  const recentDecisions = await ProgressionLog.count({
    where: { project_id: projectId, created_at: { [Op.gte]: sevenDaysAgo } },
  });

  // Check GitHub activity
  const connection = await getConnection(enrollmentId);
  const recentCommits = (connection?.commit_summary_json || []).filter((c: any) =>
    new Date(c.date) > sevenDaysAgo
  );

  // Normalize: 1 decision/day + 1 commit/day = 1.0 velocity
  const decisionRate = Math.min(1.0, recentDecisions / 7);
  const commitRate = Math.min(1.0, recentCommits.length / 7);

  return (decisionRate + commitRate) / 2;
}

async function computeStability(projectId: string, anomalyCount: number): Promise<number> {
  const recentLogs = await ProgressionLog.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  if (recentLogs.length === 0) return 0.5; // neutral

  const blockedCount = recentLogs.filter((l) => l.decision_type === 'blocked').length;
  const successCount = recentLogs.filter((l) =>
    l.decision_type === 'advanced' || l.decision_type === 'auto_advanced'
  ).length;

  // Stability penalized by blocks and anomalies
  const blockPenalty = blockedCount / recentLogs.length;
  const anomalyPenalty = Math.min(0.3, anomalyCount * 0.1);
  const successBonus = successCount / recentLogs.length;

  return Math.max(0, Math.min(1, 0.5 + successBonus * 0.5 - blockPenalty * 0.5 - anomalyPenalty));
}

async function computeAvgConfidence(projectId: string): Promise<number> {
  const reqs = await RequirementsMap.findAll({
    where: { project_id: projectId },
    attributes: ['verification_confidence'],
  });

  if (reqs.length === 0) return 0;

  const sum = reqs.reduce((acc, r) => acc + (r.verification_confidence || 0), 0);
  return sum / reqs.length;
}
