import AiSystemEvent from '../models/AiSystemEvent';
import AiAgentActivityLog from '../models/AiAgentActivityLog';
import type { AgentActivityResult } from '../models/AiAgentActivityLog';
import { emitAlert } from './alertService';

/**
 * Log an AI system event (campaign scans, agent triggers, repairs, failures, etc.)
 */
export async function logAiEvent(
  source: string,
  event_type: string,
  entity_type?: string,
  entity_id?: string,
  details?: Record<string, any>,
): Promise<AiSystemEvent> {
  return AiSystemEvent.create({
    source,
    event_type,
    entity_type: entity_type || undefined,
    entity_id: entity_id || undefined,
    details: details || undefined,
  });
}

/**
 * Log an AI agent activity (decision, action, repair, optimization, etc.)
 */
export async function logAgentActivity(params: {
  agent_id: string;
  campaign_id?: string;
  action: string;
  reason?: string;
  confidence?: number;
  before_state?: Record<string, any>;
  after_state?: Record<string, any>;
  result: AgentActivityResult;
  details?: Record<string, any>;
  // Observability fields
  trace_id?: string;
  duration_ms?: number;
  execution_context?: Record<string, any>;
  stack_trace?: string;
  retry_of?: string;
}): Promise<AiAgentActivityLog> {
  return AiAgentActivityLog.create({
    agent_id: params.agent_id,
    campaign_id: params.campaign_id || undefined,
    action: params.action,
    reason: params.reason || undefined,
    confidence: params.confidence || undefined,
    before_state: params.before_state || undefined,
    after_state: params.after_state || undefined,
    result: params.result,
    details: params.details || undefined,
    trace_id: params.trace_id || undefined,
    duration_ms: params.duration_ms || undefined,
    execution_context: params.execution_context || undefined,
    stack_trace: params.stack_trace || undefined,
    retry_of: params.retry_of || undefined,
  });
}

/**
 * Emit an alert from an agent into the Alert Intelligence Engine.
 * This is the standard way any agent creates an alert.
 */
export async function emitAgentAlert(params: {
  agentId: string;
  type: 'info' | 'insight' | 'opportunity' | 'warning' | 'critical';
  title: string;
  description: string;
  impactArea: string;
  confidence?: number;
  urgency?: 'low' | 'medium' | 'high' | 'immediate';
  departmentId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const severityMap: Record<string, number> = {
      info: 1,
      insight: 2,
      opportunity: 3,
      warning: 4,
      critical: 5,
    };

    await emitAlert({
      type: params.type,
      severity: severityMap[params.type] || 3,
      title: params.title,
      description: params.description,
      sourceAgentId: params.agentId,
      sourceType: 'agent',
      impactArea: params.impactArea,
      departmentId: params.departmentId || null,
      confidence: params.confidence ?? null,
      urgency: params.urgency || 'medium',
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      metadata: params.metadata || {},
    });
  } catch (err: any) {
    console.error(`[emitAgentAlert] Failed for agent ${params.agentId}:`, err.message);
  }
}
