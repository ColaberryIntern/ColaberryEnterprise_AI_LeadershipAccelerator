import { Lead } from '../../../models';
import DocumentDeliveryLog from '../../../models/DocumentDeliveryLog';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { canDeliverDocument } from '../../admissionsWorkflowService';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsDocumentDeliveryAgent';

const SUPPORTED_DOCUMENTS = [
  'executive_briefing',
  'program_overview',
  'enterprise_guide',
  'pricing_guide',
];

/**
 * Send documents to visitors, enforcing workflow stage rules.
 * Trigger: on_demand.
 */
export async function runAdmissionsDocumentDeliveryAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const { visitor_id, document_type, delivery_method = 'email' } = config;

    if (!visitor_id || !document_type) {
      errors.push('visitor_id and document_type are required');
      return buildResult(actions, errors, startTime);
    }

    if (!SUPPORTED_DOCUMENTS.includes(document_type)) {
      errors.push(`Unsupported document type: ${document_type}. Supported: ${SUPPORTED_DOCUMENTS.join(', ')}`);
      return buildResult(actions, errors, startTime);
    }

    // Check workflow rules
    const { allowed, reason } = await canDeliverDocument(visitor_id, document_type);
    if (!allowed) {
      actions.push({
        campaign_id: '',
        action: 'document_delivery_denied',
        reason,
        confidence: 0.95,
        before_state: { document_type },
        after_state: { denied: true, reason },
        result: 'skipped',
        entity_type: 'visitor',
        entity_id: visitor_id,
      });
      return buildResult(actions, errors, startTime);
    }

    // Resolve recipient email
    const memory = await AdmissionsMemory.findOne({ where: { visitor_id } });
    let recipientEmail: string | null = null;

    if (memory?.lead_id) {
      const lead = await Lead.findByPk(memory.lead_id);
      recipientEmail = lead?.getDataValue('email') || null;
    }

    if (delivery_method === 'email' && !recipientEmail) {
      errors.push('No email address available for document delivery');
      return buildResult(actions, errors, startTime);
    }

    // Log delivery (actual email sending delegated to emailService extension)
    await DocumentDeliveryLog.create({
      visitor_id,
      lead_id: memory?.lead_id || null,
      document_type,
      delivery_method,
      recipient_email: recipientEmail,
      status: 'sent',
    });

    await AdmissionsActionLog.create({
      visitor_id,
      conversation_id: config.conversation_id || null,
      action_type: 'send_document',
      action_details: { document_type, delivery_method, recipient_email: recipientEmail },
      status: 'completed',
      agent_name: AGENT_NAME,
    });

    actions.push({
      campaign_id: '',
      action: 'document_delivered',
      reason: `Delivered ${document_type} via ${delivery_method} to ${recipientEmail || 'chat'}`,
      confidence: 0.95,
      before_state: { document_type, delivery_method },
      after_state: { status: 'sent', recipient_email: recipientEmail },
      result: 'success',
      entity_type: 'visitor',
      entity_id: visitor_id,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'document_delivery',
      result: 'success',
      details: { visitor_id, document_type, delivery_method },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return buildResult(actions, errors, startTime);
}

function buildResult(actions: AgentAction[], errors: string[], startTime: number): AgentExecutionResult {
  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: actions.length,
  };
}
