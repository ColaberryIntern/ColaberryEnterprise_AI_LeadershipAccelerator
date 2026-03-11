import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { Visitor, Lead } from '../../../models';
import { classifyVisitorType, isCEO } from '../../admissionsMemoryService';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsVisitorIdentityAgent';

/**
 * Classify visitor_type on AdmissionsMemory from lead data, email domain, behavior.
 * Trigger: event_driven (called when a visitor is identified or lead is linked).
 */
export async function runAdmissionsVisitorIdentityAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Find all memory records that may need reclassification
    const memories = await AdmissionsMemory.findAll({ limit: 100 });

    for (const memory of memories) {
      const oldType = memory.visitor_type;
      const newType = await classifyVisitorType(memory.visitor_id);

      if (oldType !== newType) {
        await memory.update({ visitor_type: newType, last_updated: new Date() });

        actions.push({
          campaign_id: '',
          action: 'visitor_reclassified',
          reason: `Visitor ${memory.visitor_id} reclassified from ${oldType} to ${newType}`,
          confidence: 0.85,
          before_state: { visitor_type: oldType },
          after_state: { visitor_type: newType },
          result: 'success',
          entity_type: 'system',
          entity_id: memory.id,
        });
      }
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'identity_classification',
      result: 'success',
      details: { visitors_checked: memories.length, reclassified: actions.length },
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
