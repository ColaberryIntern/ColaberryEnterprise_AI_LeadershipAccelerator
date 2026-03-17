import { Lead } from '../../../models';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { logCommunication } from '../../communicationLogService';
import { logAgentActivity } from '../../aiEventService';
import { evaluateSend } from '../../communicationSafetyService';
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

    // Safety check: evaluate whether this send is allowed
    const sendDecision = await evaluateSend({
      leadId: memory.lead_id,
      channel: 'email',
      toEmail: email,
      source: 'manual',
    });

    if (!sendDecision.allowed) {
      errors.push(`Email blocked: ${sendDecision.blockedReason}`);
      actions.push({
        campaign_id: '',
        action: 'email_blocked',
        reason: `Email blocked by safety service: ${sendDecision.blockedReason}`,
        confidence: 1.0,
        before_state: { email_type },
        after_state: { blocked: true, reason: sendDecision.blockedReason },
        result: 'skipped',
        entity_type: 'visitor',
        entity_id: visitor_id,
      });
      return buildResult(actions, errors, startTime);
    }

    const targetEmail = sendDecision.redirect?.email || email;

    // Log communication as "queued" — actual sending is delegated to emailService.
    // Status is "queued" (not "sent") since this agent does not call mailer.sendMail() directly.
    await logCommunication({
      lead_id: memory.lead_id,
      channel: 'email',
      direction: 'outbound',
      delivery_mode: sendDecision.testMode ? 'test_redirect' : 'live',
      status: 'queued',
      to_address: targetEmail,
      subject,
      body,
      provider: 'smtp',
    });

    await AdmissionsActionLog.create({
      visitor_id,
      conversation_id: config.conversation_id || null,
      action_type: 'send_email',
      action_details: { email_type, subject, to: targetEmail },
      status: 'completed',
      agent_name: AGENT_NAME,
    });

    actions.push({
      campaign_id: '',
      action: 'email_queued',
      reason: `Queued ${email_type} email to ${targetEmail}`,
      confidence: 0.9,
      before_state: { email_type },
      after_state: { status: 'queued', to: targetEmail },
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
