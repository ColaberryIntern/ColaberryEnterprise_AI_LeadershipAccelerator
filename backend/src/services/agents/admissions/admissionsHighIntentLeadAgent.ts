import { Op } from 'sequelize';
import { Visitor, Lead, IntentScore } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { logAgentActivity, logAiEvent } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsHighIntentLeadAgent';

const FREE_EMAIL_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'protonmail.com', 'mail.com',
];

/**
 * Flag enterprise prospects: corporate email, 3+ visits, enterprise pages visited.
 * Schedule: every 10 minutes.
 */
export async function runAdmissionsHighIntentLeadAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Find visitors with memory who aren't yet classified as enterprise
    const memories = await AdmissionsMemory.findAll({
      where: {
        visitor_type: { [Op.notIn]: ['enterprise', 'ceo'] },
        conversation_count: { [Op.gte]: 2 },
      },
      limit: 100,
    });

    for (const memory of memories) {
      const visitor = await Visitor.findByPk(memory.visitor_id);
      if (!visitor?.lead_id) continue;

      const lead = await Lead.findByPk(visitor.lead_id);
      if (!lead?.email) continue;

      const domain = lead.email.split('@')[1]?.toLowerCase() || '';
      const isCorporateEmail = !FREE_EMAIL_PROVIDERS.includes(domain) && domain.length > 0;

      // Check for enterprise interest signals
      const interests = memory.interests || [];
      const hasEnterpriseInterest = interests.some((i) =>
        ['enterprise', 'sponsorship', 'pricing'].includes(i)
      );

      // Qualify as enterprise prospect
      if (isCorporateEmail && (memory.conversation_count >= 3 || hasEnterpriseInterest)) {
        await memory.update({
          visitor_type: 'enterprise',
          recommended_next_action: `Enterprise prospect from ${domain} — proactively offer group rates and corporate sponsorship`,
          last_updated: new Date(),
        });

        actions.push({
          campaign_id: '',
          action: 'enterprise_lead_flagged',
          reason: `Visitor ${memory.visitor_id} flagged as enterprise: corporate email (${domain}), ${memory.conversation_count} conversations`,
          confidence: 0.85,
          before_state: { visitor_type: memory.visitor_type },
          after_state: { visitor_type: 'enterprise', domain },
          result: 'success',
          entity_type: 'lead',
          entity_id: String(lead.id),
        });
      }
    }

    if (actions.length > 0) {
      await logAiEvent('admissions_intelligence', 'enterprise_leads_flagged', 'system', undefined, {
        leads_flagged: actions.length,
      }).catch(() => {});
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'high_intent_lead_detection',
      result: 'success',
      details: { memories_checked: memories.length, flagged: actions.length },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: actions.length,
  };
}
