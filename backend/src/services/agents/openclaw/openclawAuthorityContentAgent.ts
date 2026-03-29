import { Op } from 'sequelize';
import OpenclawSignal from '../../../models/OpenclawSignal';
import OpenclawLearning from '../../../models/OpenclawLearning';
import AuthorityContent from '../../../models/AuthorityContent';
import { generateContent } from './openclawAiHelper';
import { ARTICLE_PROMPT_INSTRUCTIONS, STANDARD_SIGN_OFF, supportsArticles } from './openclawPlatformStrategy';
import type { AgentExecutionResult, AgentAction } from '../types';
import crypto from 'crypto';

const ARTICLE_PLATFORMS = ['devto', 'medium', 'hashnode'];
const LINKEDIN_POST_PLATFORM = 'linkedin';

/**
 * AuthorityContentAgent - generates daily thought-leadership content
 * by synthesizing recent signals and top-performing learnings.
 *
 * Generates content for multiple platforms:
 * - LinkedIn: short-form posts (150-250 words) with tracked links
 * - Dev.to, Medium, Hashnode: long-form articles (600-1200 words)
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
  const maxTopics = config.max_posts_per_run || 2;
  const maxArticlesPerPlatform = config.max_articles_per_platform_per_run || 1;
  const signalWindowHours = config.signal_window_hours || 48;
  const baseUrl = config.base_url || 'https://enterprise.colaberry.ai';
  const targetPlatforms: string[] = config.target_platforms || [LINKEDIN_POST_PLATFORM, ...ARTICLE_PLATFORMS];

  try {
    // 1. Gather recent signals (48h window)
    const since = new Date(Date.now() - signalWindowHours * 60 * 60 * 1000);
    const recentSignals = await OpenclawSignal.findAll({
      where: {
        created_at: { [Op.gte]: since },
        status: { [Op.in]: ['scored', 'response_generated', 'completed', 'responded', 'queued'] },
      },
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    if (recentSignals.length < 3) {
      actions.push({
        campaign_id: null,
        action: 'skip',
        reason: `Only ${recentSignals.length} recent signals - need at least 3 for synthesis`,
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

    const trendingTopics = Object.entries(topicMap)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, maxTopics);

    // 3. Query learnings for best-performing tones
    const topLearnings = await OpenclawLearning.findAll({
      where: { learning_type: { [Op.in]: ['tone_effectiveness', 'topic_performance'] } },
      order: [['confidence', 'DESC']],
      limit: 10,
    });

    const bestTone = topLearnings.find((l: any) => l.learning_type === 'tone_effectiveness');
    const recommendedTone = bestTone ? ((bestTone as any).insight?.recommended_tone || 'professional') : 'professional';

    // 4. Generate content for each topic across target platforms
    let postsCreated = 0;
    const articleCounts: Record<string, number> = {};

    for (const [topic, signals] of trendingTopics) {
      const signalSummaries = signals.slice(0, 5).map((s: any) => {
        return `- [${s.platform}] ${s.title || s.source_url}: ${((s as any).ai_summary || (s as any).content_excerpt || '').slice(0, 200)}`;
      }).join('\n');

      const signalIds = signals.map((s: any) => s.id);

      for (const platform of targetPlatforms) {
        // Respect per-platform daily cap
        if (!articleCounts[platform]) articleCounts[platform] = 0;
        if (platform !== LINKEDIN_POST_PLATFORM && articleCounts[platform] >= maxArticlesPerPlatform) continue;

        try {
          const isArticle = supportsArticles(platform);
          const content = isArticle
            ? await generateArticle(topic, signalSummaries, platform, recommendedTone)
            : await generateLinkedInPost(topic, signalSummaries, recommendedTone, baseUrl);

          const shortId = `oc-${isArticle ? platform.slice(0, 4) : 'auth'}-${crypto.randomBytes(4).toString('hex')}`;
          const trackedUrl = `${baseUrl}/i/${shortId}`;
          const safeContent = content.replace(/colaberry/gi, '[company]');

          const wordCount = safeContent.split(/\s+/).filter(Boolean).length;

          const post = await AuthorityContent.create({
            source_type: 'signal_synthesis',
            source_signal_ids: signalIds,
            platform,
            title: `${topic} - ${isArticle ? 'Article' : 'Authority Insight'}`,
            content: safeContent,
            tone: recommendedTone,
            short_id: shortId,
            tracked_url: trackedUrl,
            utm_params: {
              utm_source: platform,
              utm_medium: 'organic',
              utm_campaign: isArticle ? 'openclaw_article' : 'openclaw_authority',
            },
            status: 'draft',
          });

          postsCreated++;
          articleCounts[platform]++;
          actions.push({
            campaign_id: null,
            action: isArticle ? 'create_article' : 'create_authority_content',
            reason: `Generated ${isArticle ? 'article' : 'LinkedIn post'} for ${platform} on topic "${topic}" (${wordCount} words)`,
            confidence: 0.85,
            before_state: { signals_count: signals.length, topic, platform },
            after_state: { authority_content_id: post.id, short_id: shortId, status: 'draft', word_count: wordCount },
            result: 'success',
            entity_type: 'authority_content',
            entity_id: post.id,
          });
        } catch (genErr: any) {
          errors.push(`Failed to generate ${platform} content for topic "${topic}": ${genErr.message}`);
        }
      }
    }

    actions.push({
      campaign_id: null,
      action: 'summary',
      reason: 'Authority content generation complete',
      confidence: 1.0,
      before_state: { total_signals: recentSignals.length, trending_topics: trendingTopics.length },
      after_state: { posts_created: postsCreated, platform_breakdown: articleCounts },
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
    entities_processed: actions.filter(a => a.action === 'create_article' || a.action === 'create_authority_content').length,
  };
}

// ─── Content Generation Helpers ──────────────────────────────────────────────

async function generateLinkedInPost(
  topic: string,
  signalSummaries: string,
  tone: string,
  baseUrl: string,
): Promise<string> {
  const prompt = `You are a thought leader in enterprise AI and leadership development. Write a LinkedIn post (150-250 words) that synthesizes these recent industry signals into an authoritative insight:

Topic: ${topic}
Signals:
${signalSummaries}

Tone: ${tone}
Requirements:
- Open with a bold, counterintuitive take
- Reference specific data points from the signals
- End with a question that invites executive-level discussion
- Do NOT mention "Colaberry" anywhere
- Do NOT include any URLs or links
- Do NOT use the emdash character anywhere
- Write in first person`;

  const result = await generateContent(prompt, 'gpt-4o');
  return result.body;
}

async function generateArticle(
  topic: string,
  signalSummaries: string,
  platform: string,
  tone: string,
): Promise<string> {
  const platformInstructions = ARTICLE_PROMPT_INSTRUCTIONS[platform] || ARTICLE_PROMPT_INSTRUCTIONS.devto;

  const prompt = `${platformInstructions}

Topic: ${topic}
Tone: ${tone}

These recent industry signals should inform your perspective (synthesize, don't just summarize):
${signalSummaries}

Requirements:
- You are Ali Muwwakkil, a practitioner who builds real enterprise AI systems.
- Write from experience, not from theory. Share specific patterns you've seen.
- Do NOT mention "Colaberry" or any company name anywhere.
- Do NOT use the emdash character anywhere. Use regular hyphens only.
- MUST end with EXACTLY: "${STANDARD_SIGN_OFF}"`;

  const result = await generateContent(prompt, 'gpt-4o');
  return result.body;
}
