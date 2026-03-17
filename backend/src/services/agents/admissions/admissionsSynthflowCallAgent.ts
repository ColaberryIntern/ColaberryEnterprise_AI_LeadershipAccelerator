import { Lead } from '../../../models';
import CallContactLog from '../../../models/CallContactLog';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { triggerVoiceCall } from '../../synthflowService';
import { logCommunication } from '../../communicationLogService';
import { runAdmissionsCallGovernanceAgent } from './admissionsCallGovernanceAgent';
import { logAgentActivity } from '../../aiEventService';
import { evaluateSend } from '../../communicationSafetyService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsSynthflowCallAgent';

/**
 * Initiate Synthflow voice calls after governance approval.
 * Trigger: on_demand.
 */
export async function runAdmissionsSynthflowCallAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const { visitor_id, call_type = 'admissions_outreach', reason, campaign_source } = config;

    if (!visitor_id || !reason) {
      errors.push('visitor_id and reason are required');
      return buildResult(actions, errors, startTime);
    }

    // Step 1: Governance check
    const governanceResult = await runAdmissionsCallGovernanceAgent(agentId, {
      visitor_id,
      call_type,
      reason,
      requesting_agent: AGENT_NAME,
    });

    const approved = governanceResult.actions_taken.some(
      (a) => a.action === 'call_approved',
    );

    if (!approved) {
      const denyReason = governanceResult.actions_taken.find(
        (a) => a.action === 'call_denied',
      )?.reason || 'Governance denied call';

      // Log denial
      await CallContactLog.create({
        visitor_id,
        call_type,
        campaign_source: campaign_source || null,
        reason_for_call: reason,
        approved_by_agent: AGENT_NAME,
        call_status: 'denied',
      });

      actions.push({
        campaign_id: '',
        action: 'call_denied_by_governance',
        reason: denyReason,
        confidence: 0.95,
        before_state: { call_type, reason },
        after_state: { denied: true },
        result: 'skipped',
        entity_type: 'visitor',
        entity_id: visitor_id,
      });

      return buildResult(actions, errors, startTime);
    }

    // Step 2: Resolve lead info for the call
    const memory = await AdmissionsMemory.findOne({ where: { visitor_id } });
    if (!memory?.lead_id) {
      errors.push('No lead record — cannot place call');
      return buildResult(actions, errors, startTime);
    }

    const lead = await Lead.findByPk(memory.lead_id);
    const phone = (lead as any)?.phone;
    if (!phone) {
      errors.push('Lead has no phone number');
      return buildResult(actions, errors, startTime);
    }

    // Step 3: Communication safety check (test mode, unsubscribe, rate limit)
    const sendDecision = await evaluateSend({
      leadId: memory.lead_id,
      channel: 'voice',
      toPhone: phone,
      source: 'manual',
    });

    if (!sendDecision.allowed) {
      errors.push(`Call blocked: ${sendDecision.blockedReason}`);
      await CallContactLog.create({
        visitor_id,
        call_type,
        campaign_source: campaign_source || null,
        reason_for_call: reason,
        approved_by_agent: AGENT_NAME,
        call_status: 'blocked',
      });
      actions.push({
        campaign_id: '',
        action: 'call_blocked_by_safety',
        reason: `Call blocked by safety service: ${sendDecision.blockedReason}`,
        confidence: 1.0,
        before_state: { call_type, phone },
        after_state: { blocked: true, reason: sendDecision.blockedReason },
        result: 'skipped',
        entity_type: 'visitor',
        entity_id: visitor_id,
      });
      return buildResult(actions, errors, startTime);
    }

    // Use test redirect phone if in test mode
    const targetPhone = sendDecision.redirect?.phone || phone;

    // Step 4: Trigger Synthflow call
    const callResult = await triggerVoiceCall({
      name: lead?.getDataValue('name') || 'Prospect',
      phone: targetPhone,
      callType: 'interest',
      context: {
        lead_name: lead?.getDataValue('name') || '',
        lead_company: lead?.getDataValue('company') || undefined,
        lead_email: lead?.getDataValue('email') || undefined,
      },
    });

    const callStatus = callResult.success ? 'completed' : 'failed';

    // Step 4: Log everywhere
    const callLog = await CallContactLog.create({
      visitor_id,
      call_type,
      campaign_source: campaign_source || null,
      reason_for_call: reason,
      approved_by_agent: AGENT_NAME,
      call_status: callStatus,
      synthflow_call_id: callResult.data?.call_id || null,
    });

    await logCommunication({
      lead_id: memory.lead_id,
      channel: 'voice',
      direction: 'outbound',
      delivery_mode: sendDecision.testMode ? 'test_redirect' : 'live',
      status: callStatus,
      to_address: targetPhone,
      provider: 'synthflow',
      provider_message_id: callResult.data?.call_id || null,
      metadata: { call_type, reason },
    });

    await AdmissionsActionLog.create({
      visitor_id,
      conversation_id: config.conversation_id || null,
      action_type: 'synthflow_call',
      action_details: {
        call_type,
        call_log_id: callLog.id,
        synthflow_call_id: callResult.data?.call_id,
      },
      status: callResult.success ? 'completed' : 'failed',
      agent_name: AGENT_NAME,
    });

    actions.push({
      campaign_id: '',
      action: callResult.success ? 'call_placed' : 'call_failed',
      reason: callResult.success
        ? `Placed ${call_type} call to ${phone}`
        : `Call failed: ${callResult.error}`,
      confidence: 0.9,
      before_state: { call_type, phone },
      after_state: { call_status: callStatus, synthflow_call_id: callResult.data?.call_id },
      result: callResult.success ? 'success' : 'failed',
      entity_type: 'visitor',
      entity_id: visitor_id,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'synthflow_call',
      result: callResult.success ? 'success' : 'failed',
      details: { visitor_id, call_type, phone, call_status: callStatus },
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
