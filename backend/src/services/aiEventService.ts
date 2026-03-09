import AiSystemEvent from '../models/AiSystemEvent';
import AiAgentActivityLog from '../models/AiAgentActivityLog';
import type { AgentActivityResult } from '../models/AiAgentActivityLog';

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
  });
}
