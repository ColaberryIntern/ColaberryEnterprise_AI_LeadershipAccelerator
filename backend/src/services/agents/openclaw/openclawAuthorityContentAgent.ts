import { Op } from 'sequelize';
import OpenclawSignal from '../../../models/OpenclawSignal';
import OpenclawLearning from '../../../models/OpenclawLearning';
import AuthorityContent from '../../../models/AuthorityContent';
import { generateContent } from './openclawAiHelper';
import type { AgentExecutionResult, AgentAction } from '../types';
import crypto from 'crypto';

/**
 * AuthorityContentAgent -generates daily LinkedIn thought-leadership posts
 * by synthesizing recent signals and top-performing learnings.
 *
 * Schedule: 0 8 * * * (daily 8am UTC)
 */
export async function runAuthorityContentAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxPosts = config.max_posts_per_run || 2;
  const signalWindowHours = config.signal_window_hours || 48;
  const baseUrl = config.base_url || 'https://enterprise.colaberry.ai';

  try {
    // 1. Gather recent signals (48h window)
    const since = new Date(Date.now() - signalWindowHours * 60 * 60 * 1000);
    const recentSignals = await OpenclawSignal.findAll({
      where: {
        created_at: { [Op.gte]: since },
        status: { [Op.in]: ['scored', 'response_generated', 'completed'] },
      },
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    if (recentSignals.length < 3) {
      actions.push({
        campaign_id: null,
        action: 'skip',
        reason: `Only ${recentSignals.length} recent signals -need at least 3 for synthesis`,
        confidence: 1.0,
        before_state: {},
        after_state: {},
        result: 'skipped',
        entity_type: 'authority_content',
      });
      return {
        agent_name: 'AuthorityContentAgent',
        campaigns_processed: 0,
        actions_taken: actions,
        errors,
        duration_ms: Date.now() - start,
        entities_processed: 0,
      };
    }

    // 2. Group signals by topic tags to find trending themes
    const topicMap: Record<string, typeof recentSignals> = {};
    for (const sig of recentSignals) {
      const tags: string[] = (sig as any).topic_tags || [];
      for (const tag of tags) {
        if (!topicMap[tag]) topicMap[tag] = [];
        topicMap[tag].push(sig);
      }
    }

    // Sort topics by signal count descending
    const trendingTopics = Object.entries(topicMap)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, maxPosts);

    // 3. Query learnings for best-performing tones
    const topLearnings = await OpenclawLearning.findAll({
      where: { learning_type: { [Op.in]: ['tone_effectiveness', 'topic_performance'] } },
      order: [['confidence', 'DESC']],
      limit: 10,
    });

    const bestTone = topLearnings.find((l: any) => l.learning_type === 'tone_effectiveness');
    const recommendedTone = bestTone ? ((bestTone as any).insight?.recommended_tone || 'professional') : 'professional';

    // 4. Generate authority posts
    let postsCreated = 0;
    for (const [topic, signals] of trendingTopics) {
      const signalSummaries = signals.slice(0, 5).map((s: any) => {
        return `- [${s.platform}] ${s.title || s.url}: ${(s.ai_summary || '').slice(0, 200)}`;
      }).join('\n');

      const prompt = `You are a thought leader in enterprise AI and leadership development. Write a LinkedIn post (150-250 words) that synthesizes these recent industry signals into an authoritative insight:

Topic: ${topic}
Signals:
${signalSummaries}

Tone: ${recommendedTone}
Requirements:
- Open with a bold, counterintuitive take
- Reference specific data points from the signals
- End with a question that invites executive-level discussion
- Do NOT mention "Colaberry" anywhere
- Do NOT include any URLs or links
- Write in first person`;

      try {
        const result = await generateContent(prompt, 'gpt-4o');
        const content = result.body;

        // Generate tracking identifiers
        const shortId = `oc-auth-${crypto.randomBytes(4).toString('hex')}`;
        const trackedUrl = `${baseUrl}/i/${shortId}`;

        // Safety: strip any accidental Colaberry mentions
        const safeContent = content.replace(/colaberry/gi, '[company]');

        const post = await AuthorityContent.create({
          source_type: 'signal_synthesis',
          source_signal_ids: signals.map((s: any) => s.id),
          platform: 'linkedin',
          title: `${topic} -Authority Insight`,
          content: safeContent,
          tone: recommendedTone,
          short_id: shortId,
          tracked_url: trackedUrl,
          utm_params: { utm_source: 'linkedin', utm_medium: 'organic', utm_campaign: 'openclaw_authority' },
          status: 'draft',
        });

        postsCreated++;
        actions.push({
          campaign_id: null,
          action: 'create_authority_content',
          reason: `Synthesized ${signals.length} signals on topic "${topic}" into LinkedIn draft`,
          confidence: 0.85,
          before_state: { signals_count: signals.length, topic },
          after_state: { authority_content_id: post.id, short_id: shortId, status: 'draft' },
          result: 'success',
          entity_type: 'authority_content',
          entity_id: post.id,
        });
      } catch (genErr: any) {
        errors.push(`Failed to generate authority content for topic "${topic}": ${genErr.message}`);
      }
    }

    actions.push({
      campaign_id: null,
      action: 'summary',
      reason: `Authority content generation complete`,
      confidence: 1.0,
      before_state: { total_signals: recentSignals.length, trending_topics: trendingTopics.length },
      after_state: { posts_created: postsCreated },
      result: 'success',
      entity_type: 'authority_content',
    });
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: 'AuthorityContentAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter(a => a.action === 'create_authority_content').length,
  };
}
