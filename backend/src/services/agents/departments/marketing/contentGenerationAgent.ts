import { Op } from 'sequelize';
import { ChatConversation, ChatMessage } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptContentGenerationAgent';

export async function runDeptContentGenerationAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get recent visitor messages to extract common questions/topics
    const recentMessages = await ChatMessage.findAll({
      where: {
        role: 'visitor',
        timestamp: { [Op.gte]: sevenDaysAgo },
      },
      order: [['timestamp', 'DESC']],
      limit: 200,
    });

    entitiesProcessed = recentMessages.length;

    // Extract topic signals from visitor messages
    const topicCounts: Record<string, number> = {};
    const keywords: Record<string, string[]> = {
      'AI Strategy': ['ai strategy', 'artificial intelligence', 'ai roadmap', 'ai transformation'],
      'ROI & Investment': ['roi', 'investment', 'cost', 'pricing', 'worth it', 'value'],
      'Career Growth': ['career', 'promotion', 'leadership', 'advance', 'skills'],
      'Enterprise Training': ['enterprise', 'team', 'corporate', 'company training', 'group'],
      'Program Details': ['curriculum', 'session', 'deliverable', 'what do i get', 'program'],
      'Technology Trends': ['gpt', 'llm', 'machine learning', 'automation', 'chatbot'],
    };

    for (const msg of recentMessages) {
      const text = ((msg as any).content || '').toLowerCase();
      for (const [topic, kws] of Object.entries(keywords)) {
        if (kws.some(kw => text.includes(kw))) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }
    }

    const sortedTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1]);

    const contentIdeas = sortedTopics.slice(0, 5).map(([topic, count]) => ({
      topic,
      mention_count: count,
      blog_idea: `"How ${topic} Is Transforming Enterprise Leadership in 2026"`,
      linkedin_hook: `We analyzed ${count} conversations this week. The #1 question: ${topic}.`,
    }));

    // Always add evergreen suggestions
    contentIdeas.push({
      topic: 'Success Stories',
      mention_count: 0,
      blog_idea: '"From VP to AI Leader: A 5-Session Transformation"',
      linkedin_hook: 'What happens when a Fortune 500 VP dedicates 5 sessions to AI mastery?',
    });

    actions.push({
      campaign_id: '',
      action: 'content_ideas_generated',
      reason: `Analyzed ${entitiesProcessed} visitor messages for content themes`,
      confidence: 0.82,
      before_state: null,
      after_state: {
        messages_analyzed: entitiesProcessed,
        topics_detected: sortedTopics.length,
        content_ideas: contentIdeas,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'content_ideas_generated',
      result: 'success',
      details: { messages: entitiesProcessed, ideas: contentIdeas.length },
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
    entities_processed: entitiesProcessed,
  };
}
