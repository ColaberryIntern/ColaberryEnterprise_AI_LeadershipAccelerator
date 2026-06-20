import AiSystemEvent from '../models/AiSystemEvent';
import AiAgentActivityLog from '../models/AiAgentActivityLog';
import type { AgentActivityResult } from '../models/AiAgentActivityLog';
import AiEvent from '../models/AiEvent';
import type { AiEventOutcome } from '../models/AiEvent';
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

/**
 * Emit a unified AI event (TBI audit P1-1) into the ai_events table — the read model the
 * Trust Command Center queries for cost/traces/outcomes. Non-blocking and swallow-safe:
 * telemetry must never break the action it observes.
 */
export async function emitAiEvent(params: {
  event_type: string;
  outcome: AiEventOutcome;
  trace_id?: string | null;
  workflow_id?: string | null;
  agent_id?: string | null;
  actor_type?: string | null;
  user_id?: string | null;
  external_system?: string | null;
  model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  cost_usd?: number | null;
  duration_ms?: number | null;
  error_class?: string | null;
  cache_hit?: boolean;
  metadata?: Record<string, any> | null;
}): Promise<void> {
  try {
    await AiEvent.create({
      event_type: params.event_type,
      outcome: params.outcome,
      trace_id: params.trace_id ?? null,
      workflow_id: params.workflow_id ?? null,
      agent_id: params.agent_id ?? null,
      actor_type: params.actor_type ?? null,
      user_id: params.user_id ?? null,
      external_system: params.external_system ?? null,
      model: params.model ?? null,
      prompt_tokens: params.prompt_tokens ?? null,
      completion_tokens: params.completion_tokens ?? null,
      total_tokens: params.total_tokens ?? null,
      cost_usd: params.cost_usd ?? null,
      duration_ms: params.duration_ms ?? null,
      error_class: params.error_class ?? null,
      cache_hit: params.cache_hit ?? false,
      metadata: params.metadata ?? null,
    });
  } catch (err: any) {
    console.error('[emitAiEvent] Failed to persist ai_event:', err?.message);
  }
}
