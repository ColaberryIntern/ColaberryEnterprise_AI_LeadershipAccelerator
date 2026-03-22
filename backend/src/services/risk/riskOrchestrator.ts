import { Project, ProjectRisk, AnomalyLog } from '../../models';
import { getProjectByEnrollment } from '../projectService';
import { analyzeRisks, RiskAssessment } from './riskAnalysisService';
import { detectAnomalies, Anomaly } from './anomalyDetectionService';
import { computeHealth, HealthMetrics } from './projectHealthService';

export interface RiskSummary {
  risks: RiskAssessment[];
  anomalies: Anomaly[];
  health: HealthMetrics;
}

export async function evaluateProjectRisk(enrollmentId: string): Promise<RiskSummary> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  // Run all analyses in parallel
  const [risks, anomalies] = await Promise.all([
    analyzeRisks(project.id, enrollmentId),
    detectAnomalies(project.id, enrollmentId),
  ]);

  // Health depends on anomaly count
  const health = await computeHealth(project.id, enrollmentId, anomalies.length);

  // Store risks
  for (const risk of risks) {
    await ProjectRisk.create({
      project_id: project.id,
      risk_level: risk.risk_level,
      risk_type: risk.risk_type,
      reason: risk.reason,
      confidence: risk.confidence,
      suggested_action: risk.suggested_action,
    });
  }

  // Store anomalies
  for (const anomaly of anomalies) {
    await AnomalyLog.create({
      project_id: project.id,
      anomaly_type: anomaly.anomaly_type,
      details: anomaly.details,
      severity: anomaly.severity,
    });
  }

  // Update project health scores
  project.health_score = health.health_score;
  project.velocity_score = health.velocity_score;
  project.stability_score = health.stability_score;
  await project.save();

  console.log(
    `[RiskEngine] ${risks.length} risks, ${anomalies.length} anomalies. Health: ${health.health_score}, Velocity: ${health.velocity_score}, Stability: ${health.stability_score}`
  );

  return { risks, anomalies, health };
}
