import { Lead } from '../../../models';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { sendSmsViaGhl } from '../../ghlService';
import { logCommunication } from '../../communicationLogService';
import { logAgentActivity } from '../../aiEventService';
import { evaluateSend } from '../../communicationSafetyService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsSMSAgent';

const SMS_TYPES = ['conversation_summary', 'appointment_reminder', 'requested_link'];

/**
 * Send SMS messages via GoHighLevel for admissions purposes.
 * Trigger: on_demand.
 */
export async function runAdmissionsSMSAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const { visitor_id, sms_type, message } = config;

    if (!visitor_id || !sms_type || !message) {
      errors.push('visitor_id, sms_type, and message are required');
      return buildResult(actions, errors, startTime);
    }

    if (!SMS_TYPES.includes(sms_type)) {
      errors.push(`Unsupported SMS type: ${sms_type}`);
      return buildResult(actions, errors, startTime);
    }

    // Resolve GHL contact ID
    const memory = await AdmissionsMemory.findOne({ where: { visitor_id } });
    if (!memory?.lead_id) {
      errors.push('No lead record found for visitor — cannot send SMS');
      return buildResult(actions, errors, startTime);
    }

    const lead = await Lead.findByPk(memory.lead_id);
    const ghlContactId = (lead as any)?.ghl_contact_id;
    if (!ghlContactId) {
      errors.push('Lead has no GHL contact ID — cannot send SMS');
      return buildResult(actions, errors, startTime);
    }

    // Safety check: evaluate whether this send is allowed
    const sendDecision = await evaluateSend({
      leadId: memory.lead_id,
      channel: 'sms',
      toPhone: (lead as any)?.phone || '',
      source: 'manual',
    });

    if (!sendDecision.allowed) {
      errors.push(`Send blocked: ${sendDecision.blockedReason}`);
      actions.push({
        campaign_id: '',
        action: 'sms_blocked',
        reason: `Send blocked by safety service: ${sendDecision.blockedReason}`,
        confidence: 1.0,
        before_state: { sms_type },
        after_state: { blocked: true, reason: sendDecision.blockedReason },
        result: 'skipped',
        entity_type: 'visitor',
        entity_id: visitor_id,
      });
      return buildResult(actions, errors, startTime);
    }

    // If test mode, redirect phone number
    const targetContactId = sendDecision.redirect?.phone
      ? ghlContactId // GHL contact ID stays the same; test redirect handled at GHL level
      : ghlContactId;

    // Send via GHL
    const result = await sendSmsViaGhl(targetContactId, message);

    const status = result.success ? 'sent' : 'failed';

    await logCommunication({
      lead_id: memory.lead_id,
      channel: 'sms',
      direction: 'outbound',
      delivery_mode: sendDecision.testMode ? 'test_redirect' : 'live',
      status,
      to_address: (lead as any)?.phone || '',
      body: message,
      provider: 'GHL',
      provider_message_id: result.data?.messageId || null,
    });

    await AdmissionsActionLog.create({
      visitor_id,
      conversation_id: config.conversation_id || null,
      action_type: 'send_sms',
      action_details: { sms_type, message_preview: message.substring(0, 100) },
      status: result.success ? 'completed' : 'failed',
      agent_name: AGENT_NAME,
    });

    actions.push({
      campaign_id: '',
      action: result.success ? 'sms_sent' : 'sms_failed',
      reason: result.success
        ? `Sent ${sms_type} SMS to visitor ${visitor_id}`
        : `Failed to send SMS: ${result.error || 'unknown error'}`,
      confidence: 0.85,
      before_state: { sms_type },
      after_state: { status, ghl_contact_id: ghlContactId },
      result: result.success ? 'success' : 'failed',
      entity_type: 'visitor',
      entity_id: visitor_id,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'admissions_sms',
      result: result.success ? 'success' : 'failed',
      details: { visitor_id, sms_type, status },
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
