import { Op } from 'sequelize';
import OpenclawConversation from '../../../models/OpenclawConversation';
import { detectStalledConversations, linkOrphanedEvents } from './openclawConversationTrackingService';
import { updateLeadAndOpportunityScore } from './openclawLeadScoringService';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * ConversationSyncAgent -safety net for conversation integrity.
 *
 * 1. Link orphaned EngagementEvents (conversation_id IS NULL)
 * 2. Detect stalled conversations (48h+ silence at stage >= 2)
 * 3. Re-score active conversation leads
 * 4. Log metrics
 *
 * Schedule: 0 *\/2 * * * (every 2 hours)
 */
export async function runConversationSyncAgent(
  _agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // 1. Link orphaned events
    let orphansLinked = 0;
    try {
      orphansLinked = await linkOrphanedEvents();
      if (orphansLinked > 0) {
        actions.push({
          campaign_id: null,
          action: 'link_orphans',
          reason: `Linked ${orphansLinked} orphaned engagement events to conversations`,
          confidence: 1.0,
          before_state: { orphans: orphansLinked },
          after_state: { linked: orphansLinked },
          result: 'success',
          entity_type: 'engagement_event',
        });
      }
    } catch (err: any) {
      errors.push(`Orphan linking failed: ${err.message}`);
    }

    // 2. Detect stalled conversations
    let stallsDetected = 0;
    try {
      stallsDetected = await detectStalledConversations();
      if (stallsDetected > 0) {
        actions.push({
          campaign_id: null,
          action: 'detect_stalls',
          reason: `Detected ${stallsDetected} stalled conversations (48h+ silence at stage >= 2)`,
          confidence: 1.0,
          before_state: {},
          after_state: { stalls_detected: stallsDetected },
          result: 'success',
          entity_type: 'openclaw_conversation',
        });
      }
    } catch (err: any) {
      errors.push(`Stall detection failed: ${err.message}`);
    }

    // 3. Re-score active conversation leads
    let leadsRescored = 0;
    try {
      const activeConversations = await OpenclawConversation.findAll({
        where: {
          status: { [Op.in]: ['active', 'stalled'] },
          lead_id: { [Op.ne]: null as any },
        },
        attributes: ['lead_id'],
        group: ['lead_id'],
        raw: true,
      });

      const uniqueLeadIds = [...new Set(activeConversations.map((c: any) => c.lead_id))];

      for (const leadId of uniqueLeadIds) {
        try {
          await updateLeadAndOpportunityScore(leadId);
          leadsRescored++;
        } catch (scoreErr: any) {
          errors.push(`Failed to re-score lead ${leadId}: ${scoreErr.message}`);
        }
      }

      if (leadsRescored > 0) {
        actions.push({
          campaign_id: null,
          action: 'rescore_leads',
          reason: `Re-scored ${leadsRescored} leads with active conversations`,
          confidence: 1.0,
          before_state: { leads_to_score: uniqueLeadIds.length },
          after_state: { leads_rescored: leadsRescored },
          result: 'success',
          entity_type: 'lead',
        });
      }
    } catch (err: any) {
      errors.push(`Lead re-scoring failed: ${err.message}`);
    }

    // 4. Metrics summary
    const totalConversations = await OpenclawConversation.count();
    const activeCount = await OpenclawConversation.count({ where: { status: 'active' } });
    const stalledCount = await OpenclawConversation.count({ where: { status: 'stalled' } });
    const convertedCount = await OpenclawConversation.count({ where: { status: 'converted' } });

    actions.push({
      campaign_id: null,
      action: 'summary',
      reason: `Conversation sync complete`,
      confidence: 1.0,
      before_state: {},
      after_state: {
        orphans_linked: orphansLinked,
        stalls_detected: stallsDetected,
        leads_rescored: leadsRescored,
        metrics: { total: totalConversations, active: activeCount, stalled: stalledCount, converted: convertedCount },
      },
      result: 'success',
      entity_type: 'openclaw_conversation',
    });
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: 'ConversationSyncAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter(a => a.action !== 'summary').length,
  };
}
