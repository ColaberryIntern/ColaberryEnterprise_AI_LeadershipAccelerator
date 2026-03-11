import { findRelevantKnowledge } from '../../admissionsKnowledgeService';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsKnowledgeAgent';

/**
 * RAG retrieval from AdmissionsKnowledgeEntry.
 * Trigger: on_demand (called during message processing).
 */
export async function runAdmissionsKnowledgeAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const query = config.query || '';
    const pageCategory = config.page_category || '';

    const entries = await findRelevantKnowledge({ query, pageCategory, limit: 5 });

    actions.push({
      campaign_id: '',
      action: 'knowledge_retrieved',
      reason: `Retrieved ${entries.length} entries for query: "${query.slice(0, 80)}"`,
      confidence: 0.85,
      before_state: null,
      after_state: {
        entries_found: entries.length,
        categories: entries.map((e) => e.category),
        titles: entries.map((e) => e.title),
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'knowledge_retrieval',
      result: 'success',
      details: { query: query.slice(0, 100), entries_found: entries.length },
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
    entities_processed: 1,
  };
}
