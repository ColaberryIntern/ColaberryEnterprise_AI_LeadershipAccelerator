/**
 * Human-in-the-Loop Engine
 * Configurable approval checkpoints per business process.
 */
import Capability from '../../models/Capability';
import IntelligenceDecision from '../../models/IntelligenceDecision';

export async function shouldRequireApproval(
  processId: string, checkpointType: string, riskScore: number, confidenceScore: number
): Promise<boolean> {
  const process = await Capability.findByPk(processId);
  if (!process || !process.hitl_config) return true; // default: require approval

  const config = process.hitl_config;
  const enabled = config[checkpointType] !== false;
  if (!enabled) return false;

  // Auto-approve if confidence above threshold AND risk below threshold
  const confThreshold = config.auto_approve_confidence_threshold || 0.9;
  const riskThreshold = config.auto_approve_risk_threshold || 0.3;
  if (confidenceScore >= confThreshold && riskScore <= riskThreshold) return false;

  return true;
}

export async function recordApproval(decisionId: string, approvedBy: string): Promise<void> {
  await IntelligenceDecision.update(
    { execution_status: 'approved', executed_by: approvedBy } as any,
    { where: { decision_id: decisionId, execution_status: 'proposed' } as any }
  );
}

export async function recordRejection(decisionId: string, rejectedBy: string, reason: string): Promise<void> {
  await IntelligenceDecision.update(
    { execution_status: 'rejected', executed_by: rejectedBy, reasoning: reason } as any,
    { where: { decision_id: decisionId } as any }
  );
}

export async function getApprovalHistory(processId: string, limit: number = 20): Promise<any[]> {
  const process = await Capability.findByPk(processId);
  if (!process) return [];
  const agentNames = process.linked_agents || [];
  if (agentNames.length === 0) return [];

  const decisions = await IntelligenceDecision.findAll({
    where: { execution_status: ['approved', 'rejected', 'proposed'] },
    order: [['created_at', 'DESC']],
    limit,
  });
  return decisions.map((d: any) => d.toJSON());
}

export async function updateHITLConfig(processId: string, config: Record<string, any>): Promise<void> {
  const process = await Capability.findByPk(processId);
  if (!process) throw new Error('Process not found');
  process.hitl_config = { ...(process.hitl_config || {}), ...config };
  await process.save();
}

export async function getHITLConfig(processId: string): Promise<Record<string, any> | null> {
  const process = await Capability.findByPk(processId);
  return process?.hitl_config || null;
}
