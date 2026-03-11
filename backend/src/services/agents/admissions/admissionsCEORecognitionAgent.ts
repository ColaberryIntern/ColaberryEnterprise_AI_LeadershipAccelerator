import { Visitor, Lead } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { isCEO } from '../../admissionsMemoryService';
import { logAgentActivity, logAiEvent } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsCEORecognitionAgent';

/**
 * Detect CEO identity, set visitor_type='ceo', trigger executive greeting.
 * Trigger: event_driven (called when a lead is linked to a visitor).
 */
export async function runAdmissionsCEORecognitionAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const visitorId = config.visitor_id;
    const leadId = config.lead_id;

    if (!visitorId && !leadId) {
      // Scan all visitors with leads
      const visitors = await Visitor.findAll({
        where: { lead_id: { [require('sequelize').Op.ne]: null } },
        limit: 100,
      });

      for (const visitor of visitors) {
        if (!visitor.lead_id) continue;
        const lead = await Lead.findByPk(visitor.lead_id);
        if (!lead || !isCEO(lead)) continue;

        const memory = await AdmissionsMemory.findOne({ where: { visitor_id: visitor.id } });
        if (memory && memory.visitor_type === 'ceo') continue;

        if (memory) {
          await memory.update({ visitor_type: 'ceo', lead_id: visitor.lead_id, last_updated: new Date() });
        }

        actions.push({
          campaign_id: '',
          action: 'ceo_recognized',
          reason: `CEO identified: ${lead.name || 'Unknown'} (${lead.email})`,
          confidence: 0.95,
          before_state: { visitor_type: memory?.visitor_type || 'new' },
          after_state: { visitor_type: 'ceo' },
          result: 'success',
          entity_type: 'lead',
          entity_id: String(lead.id),
        });
      }
    } else {
      // Single visitor check
      const lead = leadId ? await Lead.findByPk(leadId) : null;
      if (lead && isCEO(lead)) {
        const [memory] = await AdmissionsMemory.findOrCreate({
          where: { visitor_id: visitorId },
          defaults: {
            visitor_id: visitorId,
            lead_id: lead.id,
            visitor_type: 'ceo',
            conversation_count: 0,
            conversation_summaries: [],
            interests: [],
            questions_asked: [],
          },
        });

        if (memory.visitor_type !== 'ceo') {
          await memory.update({ visitor_type: 'ceo', lead_id: lead.id, last_updated: new Date() });
        }

        actions.push({
          campaign_id: '',
          action: 'ceo_recognized',
          reason: `CEO identified: ${lead.name || 'Unknown'}`,
          confidence: 0.95,
          before_state: null,
          after_state: { visitor_type: 'ceo' },
          result: 'success',
          entity_type: 'lead',
          entity_id: String(lead.id),
        });
      }
    }

    if (actions.length > 0) {
      await logAiEvent('admissions_intelligence', 'ceo_recognized', 'lead', undefined, {
        count: actions.length,
      }).catch(() => {});
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'ceo_recognition',
      result: 'success',
      details: { recognized: actions.length },
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
