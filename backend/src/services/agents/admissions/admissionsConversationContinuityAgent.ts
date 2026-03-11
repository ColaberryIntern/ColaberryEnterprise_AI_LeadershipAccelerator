import { Op } from 'sequelize';
import { ChatConversation } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsConversationContinuityAgent';

/**
 * Merge context from short consecutive conversations for the same visitor.
 * Schedule: every 5 minutes.
 */
export async function runAdmissionsConversationContinuityAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const since = new Date(Date.now() - 30 * 60 * 1000); // last 30 minutes

    // Find recently closed short conversations (< 3 messages)
    const shortConversations = await ChatConversation.findAll({
      where: {
        status: 'closed',
        ended_at: { [Op.gte]: since },
        visitor_message_count: { [Op.lt]: 3 },
      },
      order: [['ended_at', 'DESC']],
      limit: 50,
    });

    // Group by visitor
    const byVisitor = new Map<string, any[]>();
    for (const conv of shortConversations) {
      const vid = conv.visitor_id;
      if (!byVisitor.has(vid)) byVisitor.set(vid, []);
      byVisitor.get(vid)!.push(conv);
    }

    for (const [visitorId, convs] of byVisitor) {
      if (convs.length < 2) continue;

      // These are likely fragmented conversations — update memory to note continuity
      const memory = await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } });
      if (!memory) continue;

      const pageCategories = convs.map((c: any) => c.page_category).filter(Boolean);
      const uniquePages = [...new Set(pageCategories)];

      if (uniquePages.length > 1) {
        // Visitor navigated across pages with short conversations — likely browsing
        const note = `Visitor had ${convs.length} short conversations across pages: ${uniquePages.join(', ')} — likely comparing/browsing`;

        const existingNotes = memory.personality_notes || '';
        if (!existingNotes.includes(note.slice(0, 30))) {
          await memory.update({
            personality_notes: existingNotes ? `${existingNotes}\n${note}` : note,
            last_updated: new Date(),
          });

          actions.push({
            campaign_id: '',
            action: 'continuity_merged',
            reason: note,
            confidence: 0.7,
            before_state: null,
            after_state: { short_conversations: convs.length, pages: uniquePages },
            result: 'success',
            entity_type: 'system',
            entity_id: memory.id,
          });
        }
      }
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'conversation_continuity',
      result: 'success',
      details: { short_conversations: shortConversations.length, visitors_merged: actions.length },
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
