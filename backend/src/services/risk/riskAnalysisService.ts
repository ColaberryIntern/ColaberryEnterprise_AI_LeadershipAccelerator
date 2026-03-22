import { RequirementsMap, ProgressionLog, NextAction } from '../../models';
import { getConnection } from '../githubService';
import { Op } from 'sequelize';

export interface RiskAssessment {
  risk_level: 'low' | 'medium' | 'high';
  risk_type: string;
  reason: string;
  suggested_action: string;
  confidence: number;
}

export async function analyzeRisks(
  projectId: string,
  enrollmentId: string
): Promise<RiskAssessment[]> {
  const risks: RiskAssessment[] = [];

  const [stalledRisk, weakRisk, missingRisk, instabilityRisk] = await Promise.all([
    checkStalledProgress(projectId, enrollmentId),
    checkWeakImplementation(projectId),
    checkMissingCoreFeature(projectId),
    checkInstability(projectId),
  ]);

  if (stalledRisk) risks.push(stalledRisk);
  if (weakRisk) risks.push(weakRisk);
  if (missingRisk) risks.push(missingRisk);
  if (instabilityRisk) risks.push(instabilityRisk);

  return risks;
}

async function checkStalledProgress(projectId: string, enrollmentId: string): Promise<RiskAssessment | null> {
  const connection = await getConnection(enrollmentId);
  const lastCommits = connection?.commit_summary_json || [];
  const lastSync = connection?.last_sync_at;

  // Check if no commits in last 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCommits = lastCommits.filter((c: any) => new Date(c.date) > twentyFourHoursAgo);

  const incompleteReqs = await RequirementsMap.count({
    where: { project_id: projectId, verification_status: { [Op.in]: ['not_verified', 'verified_partial'] } },
  });

  if (recentCommits.length === 0 && incompleteReqs > 0) {
    return {
      risk_level: incompleteReqs > 3 ? 'high' : 'medium',
      risk_type: 'stalled_progress',
      reason: `No commits in the last 24 hours with ${incompleteReqs} incomplete requirements remaining.`,
      suggested_action: 'Resume development. Focus on the highest-priority incomplete requirement.',
      confidence: 0.8,
    };
  }
  return null;
}

async function checkWeakImplementation(projectId: string): Promise<RiskAssessment | null> {
  const partialReqs = await RequirementsMap.findAll({
    where: { project_id: projectId, verification_status: 'verified_partial' },
  });

  const weakCount = partialReqs.filter((r) => (r.verification_confidence || 0) < 0.7).length;

  if (weakCount >= 2) {
    return {
      risk_level: weakCount >= 4 ? 'high' : 'medium',
      risk_type: 'weak_implementation',
      reason: `${weakCount} requirements have partial verification with low confidence (<70%).`,
      suggested_action: 'Review and strengthen implementations. Focus on requirements with lowest confidence scores.',
      confidence: 0.75,
    };
  }
  return null;
}

async function checkMissingCoreFeature(projectId: string): Promise<RiskAssessment | null> {
  const notStarted = await RequirementsMap.findAll({
    where: { project_id: projectId, verification_status: 'not_verified' },
  });

  const hasOtherProgress = await RequirementsMap.count({
    where: { project_id: projectId, verification_status: { [Op.in]: ['verified_complete', 'verified_partial'] } },
  });

  if (notStarted.length > 0 && hasOtherProgress > 0) {
    return {
      risk_level: notStarted.length > 2 ? 'high' : 'medium',
      risk_type: 'missing_core_feature',
      reason: `${notStarted.length} requirements have not been started while other features are in progress.`,
      suggested_action: `Start working on: ${notStarted.slice(0, 2).map((r) => r.requirement_key).join(', ')}`,
      confidence: 0.7,
    };
  }
  return null;
}

async function checkInstability(projectId: string): Promise<RiskAssessment | null> {
  const recentLogs = await ProgressionLog.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  if (recentLogs.length < 3) return null;

  const blockedCount = recentLogs.filter((l) => l.decision_type === 'blocked').length;
  const softCompleteCount = recentLogs.filter((l) => l.decision_type === 'soft_complete').length;

  if (blockedCount >= 3 || (blockedCount >= 2 && softCompleteCount >= 2)) {
    return {
      risk_level: blockedCount >= 4 ? 'high' : 'medium',
      risk_type: 'instability',
      reason: `${blockedCount} blocked decisions and ${softCompleteCount} soft-completes in recent history. Project execution is unstable.`,
      suggested_action: 'Review foundational requirements. Consider simplifying approach or seeking guidance.',
      confidence: 0.7,
    };
  }
  return null;
}
