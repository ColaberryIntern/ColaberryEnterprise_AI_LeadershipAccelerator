import { Lead } from '../../../models';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { logCommunication } from '../../communicationLogService';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsEmailAgent';

const EMAIL_TYPES = ['follow_up', 'materials', 'appointment_confirmation', 'admissions_update'];

/**
 * Send admissions-related emails (follow-ups, materials, confirmations).
 * Trigger: on_demand.
 */
export async function runAdmissionsEmailAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const { visitor_id, email_type, subject, body } = config;

    if (!visitor_id || !email_type || !subject || !body) {
      errors.push('visitor_id, email_type, subject, and body are required');
      return buildResult(actions, errors, startTime);
    }

    if (!EMAIL_TYPES.includes(email_type)) {
      errors.push(`Unsupported email type: ${email_type}`);
      return buildResult(actions, errors, startTime);
    }

    // Resolve recipient
    const memory = await AdmissionsMemory.findOne({ where: { visitor_id } });
    if (!memory?.lead_id) {
      errors.push('No lead record found for visitor — cannot send email');
      return buildResult(actions, errors, startTime);
    }

    const lead = await Lead.findByPk(memory.lead_id);
    const email = lead?.getDataValue('email');
    if (!email) {
      errors.push('Lead has no email address');
      return buildResult(actions, errors, startTime);
    }

    // Log communication (actual sending delegated to emailService)
    await logCommunication({
      lead_id: memory.lead_id,
      channel: 'email',
      direction: 'outbound',
      delivery_mode: 'live',
      status: 'sent',
      to_address: email,
      subject,
      body,
      provider: 'smtp',
    });

    await AdmissionsActionLog.create({
      visitor_id,
      conversation_id: config.conversation_id || null,
      action_type: 'send_email',
      action_details: { email_type, subject, to: email },
      status: 'completed',
      agent_name: AGENT_NAME,
    });

    actions.push({
      campaign_id: '',
      action: 'email_sent',
      reason: `Sent ${email_type} email to ${email}`,
      confidence: 0.9,
      before_state: { email_type },
      after_state: { status: 'sent', to: email },
      result: 'success',
      entity_type: 'visitor',
      entity_id: visitor_id,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'admissions_email',
      result: 'success',
      details: { visitor_id, email_type, to: email },
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
