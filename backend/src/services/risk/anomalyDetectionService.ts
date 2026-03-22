import { VerificationLog, ProgressionLog } from '../../models';
import { getConnection } from '../githubService';
import { Op } from 'sequelize';

export interface Anomaly {
  anomaly_type: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high';
}

export async function detectAnomalies(
  projectId: string,
  enrollmentId: string
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  const [confDrop, repeatedFails, inactivity, inconsistent] = await Promise.all([
    detectConfidenceDrop(projectId),
    detectRepeatedFailures(projectId),
    detectInactivity(projectId, enrollmentId),
    detectInconsistentProgress(projectId),
  ]);

  if (confDrop) anomalies.push(confDrop);
  if (repeatedFails) anomalies.push(repeatedFails);
  if (inactivity) anomalies.push(inactivity);
  if (inconsistent) anomalies.push(inconsistent);

  return anomalies;
}

async function detectConfidenceDrop(projectId: string): Promise<Anomaly | null> {
  const logs = await VerificationLog.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  if (logs.length < 2) return null;

  // Check if latest confidence is significantly lower than previous average
  const latest = logs[0].confidence;
  const previous = logs.slice(1, 5);
  if (previous.length === 0) return null;

  const avgPrevious = previous.reduce((sum, l) => sum + l.confidence, 0) / previous.length;
  const drop = avgPrevious - latest;

  if (drop > 0.2) {
    return {
      anomaly_type: 'confidence_drop',
      details: { latest_confidence: latest, previous_avg: Math.round(avgPrevious * 100) / 100, drop: Math.round(drop * 100) / 100 },
      severity: drop > 0.4 ? 'high' : 'medium',
    };
  }
  return null;
}

async function detectRepeatedFailures(projectId: string): Promise<Anomaly | null> {
  const logs = await VerificationLog.findAll({
    where: { project_id: projectId, status: 'not_verified' },
    order: [['created_at', 'DESC']],
    limit: 20,
  });

  // Group by requirement_id and find those with 3+ failures
  const failCounts = new Map<string, number>();
  for (const log of logs) {
    const count = failCounts.get(log.requirement_id) || 0;
    failCounts.set(log.requirement_id, count + 1);
  }

  const repeatedFailures = Array.from(failCounts.entries()).filter(([, count]) => count >= 3);

  if (repeatedFailures.length > 0) {
    return {
      anomaly_type: 'repeated_failures',
      details: { failed_requirements: repeatedFailures.length, max_failures: Math.max(...repeatedFailures.map(([, c]) => c)) },
      severity: repeatedFailures.length >= 3 ? 'high' : 'medium',
    };
  }
  return null;
}

async function detectInactivity(projectId: string, enrollmentId: string): Promise<Anomaly | null> {
  const connection = await getConnection(enrollmentId);
  const lastSync = connection?.last_sync_at;

  const lastProgression = await ProgressionLog.findOne({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
  });

  const now = Date.now();
  const fortyEightHours = 48 * 60 * 60 * 1000;

  const noGitHub = !lastSync || (now - new Date(lastSync).getTime()) > fortyEightHours;
  const noProgression = !lastProgression || (now - new Date(lastProgression.created_at).getTime()) > fortyEightHours;

  if (noGitHub && noProgression) {
    return {
      anomaly_type: 'inactivity',
      details: { last_github_sync: lastSync?.toISOString() || null, last_progression: lastProgression?.created_at?.toISOString() || null },
      severity: 'medium',
    };
  }
  return null;
}

async function detectInconsistentProgress(projectId: string): Promise<Anomaly | null> {
  const logs = await ProgressionLog.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  if (logs.length < 4) return null;

  const softCompletes = logs.filter((l) => l.decision_type === 'soft_complete').length;
  const fullAdvances = logs.filter((l) => l.decision_type === 'advanced' || l.decision_type === 'auto_advanced').length;

  if (softCompletes >= 3 && fullAdvances <= 1) {
    return {
      anomaly_type: 'inconsistent_progress',
      details: { soft_completes: softCompletes, full_advances: fullAdvances, total_decisions: logs.length },
      severity: softCompletes >= 5 ? 'high' : 'medium',
    };
  }
  return null;
}
