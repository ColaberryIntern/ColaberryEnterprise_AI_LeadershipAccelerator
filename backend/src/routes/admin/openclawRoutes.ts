import { Router, Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import axios from 'axios';
import { sequelize } from '../../config/database';
import { saveFacebookCookies, checkFacebookSession, listFacebookGroups, getConfiguredGroups, saveConfiguredGroups } from '../../services/agents/openclaw/openclawFacebookService';
import { saveRedditCookies, checkRedditSession } from '../../services/agents/openclaw/openclawRedditService';
import {
  OpenclawSignal,
  OpenclawTask,
  OpenclawSession,
  OpenclawResponse,
  OpenclawLearning,
  AiAgent,
  AiAgentActivityLog,
  AuthorityContent,
  EngagementEvent,
  ResponseQueue,
  LinkedInActionQueue,
  Lead,
  OpenclawConversation,
  RevenueOpportunity,
} from '../../models';

const router = Router();
const BASE = '/api/admin/openclaw';

// ── Dashboard Aggregate Stats ─────────────────────────────────────

router.get(`${BASE}/dashboard`, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 86400000);

    const [
      signalsToday,
      signalsTotal,
      responsesPosted,
      responsesDraft,
      activeSessions,
      pendingTasks,
      learningsCount,
      activeAgents,
      contentPipeline,
      responsesManualQueue,
      repliesSent,
      totalReplies,
    ] = await Promise.all([
      OpenclawSignal.count({ where: { created_at: { [Op.gte]: last24h } } }),
      OpenclawSignal.count(),
      OpenclawResponse.count({ where: { post_status: 'posted' } }),
      OpenclawResponse.count({ where: { post_status: 'draft' } }),
      OpenclawSession.count({ where: { session_status: { [Op.in]: ['active', 'idle'] } } }),
      OpenclawTask.count({ where: { status: { [Op.in]: ['pending', 'assigned'] } } }),
      OpenclawLearning.count(),
      AiAgent.count({ where: { category: 'openclaw', enabled: true } }),
      OpenclawResponse.count({ where: { post_status: { [Op.in]: ['draft', 'approved', 'ready_to_post'] } } }),
      OpenclawResponse.count({ where: { post_status: 'ready_for_manual_post' } }),
      ResponseQueue.count({ where: { status: 'posted' } }),
      EngagementEvent.count({ where: { engagement_type: { [Op.in]: ['reply', 'comment'] } } }),
    ]);

    // Engagement score aggregation via raw SQL
    let totalEngagementScore = 0;
    let totalClicks = 0;
    try {
      const engScoreResult: any[] = await sequelize.query(`
        SELECT
          COALESCE(SUM((engagement_metrics->>'engagement_score')::float), 0) as total_score,
          COALESCE(SUM((engagement_metrics->>'clicks')::int), 0) as total_clicks
        FROM openclaw_responses
        WHERE post_status = 'posted' AND engagement_metrics IS NOT NULL
      `, { type: QueryTypes.SELECT });
      if (engScoreResult.length > 0) {
        totalEngagementScore = Number(engScoreResult[0].total_score) || 0;
        totalClicks = Number(engScoreResult[0].total_clicks) || 0;
      }
    } catch { /* table may not have data yet */ }

    // Best tone from learnings
    let bestTone = 'N/A';
    try {
      const topTone = await OpenclawLearning.findOne({
        where: { learning_type: 'tone_effectiveness' },
        order: [['metric_value', 'DESC']],
      });
      if (topTone) bestTone = topTone.metric_key;
    } catch { /* no learnings yet */ }

    // Computed rates
    const ctr = responsesPosted > 0 ? Number((totalClicks / responsesPosted).toFixed(2)) : 0;
    const replyRate = responsesPosted > 0 ? Number((totalReplies / responsesPosted).toFixed(2)) : 0;

    // Platform breakdown
    const platformStats = await OpenclawSignal.findAll({
      attributes: [
        'platform',
        [OpenclawSignal.sequelize!.fn('COUNT', '*'), 'count'],
      ],
      where: { created_at: { [Op.gte]: last24h } },
      group: ['platform'],
      raw: true,
    });

    // Agent statuses
    const agents = await AiAgent.findAll({
      where: { category: 'openclaw' },
      attributes: ['id', 'agent_name', 'agent_type', 'status', 'enabled', 'description', 'config', 'last_run_at', 'last_result', 'run_count', 'error_count', 'avg_duration_ms'],
      order: [['agent_name', 'ASC']],
    });

    // ── Performance Section ──
    // Top responses by engagement score
    let topResponses: any[] = [];
    try {
      topResponses = await sequelize.query(`
        SELECT
          r.id, r.platform, r.tone, r.short_id, r.posted_at,
          LEFT(r.content, 120) as content_preview,
          (r.engagement_metrics->>'engagement_score')::float as engagement_score,
          (r.engagement_metrics->>'clicks')::int as clicks,
          (r.engagement_metrics->>'replies')::int as replies,
          (r.engagement_metrics->>'reactions')::int as reactions,
          s.title as signal_title
        FROM openclaw_responses r
        LEFT JOIN openclaw_signals s ON s.id = r.signal_id
        WHERE r.post_status = 'posted'
          AND r.engagement_metrics->>'engagement_score' IS NOT NULL
        ORDER BY (r.engagement_metrics->>'engagement_score')::float DESC
        LIMIT 10
      `, { type: QueryTypes.SELECT });
    } catch { /* no data yet */ }

    // Tone breakdown from learnings
    let toneBreakdown: any[] = [];
    try {
      const toneLearnings = await OpenclawLearning.findAll({
        where: { learning_type: 'tone_effectiveness' },
        order: [['metric_value', 'DESC']],
        raw: true,
      });
      toneBreakdown = toneLearnings.map((l: any) => ({
        tone: l.metric_key,
        avg_engagement: Number(l.metric_value),
        sample_size: l.sample_size,
        confidence: Number(l.confidence),
      }));
    } catch { /* no learnings */ }

    // Platform breakdown from learnings
    let platformBreakdown: any[] = [];
    try {
      const platLearnings = await OpenclawLearning.findAll({
        where: { learning_type: 'platform_timing' },
        order: [['metric_value', 'DESC']],
        raw: true,
      });
      platformBreakdown = platLearnings.map((l: any) => ({
        platform: l.metric_key,
        avg_engagement: Number(l.metric_value),
        sample_size: l.sample_size,
      }));
    } catch { /* no learnings */ }

    // Pipeline funnel and priority breakdown
    let pipelineFunnel: Record<string, number> = {};
    let priorityBreakdown: Record<string, number> = {};
    let conversionRate = 0;
    let revenuePipeline: Record<string, { count: number; value: number }> = {};
    try {
      for (let stage = 1; stage <= 8; stage++) {
        pipelineFunnel[`stage_${stage}`] = await OpenclawConversation.count({ where: { current_stage: stage } });
      }
      priorityBreakdown = {
        hot: await OpenclawConversation.count({ where: { priority_tier: 'hot' } }),
        warm: await OpenclawConversation.count({ where: { priority_tier: 'warm' } }),
        cold: await OpenclawConversation.count({ where: { priority_tier: 'cold' } }),
      };
      const totalConversations = await OpenclawConversation.count();
      const stage6Plus = await OpenclawConversation.count({ where: { current_stage: { [Op.gte]: 6 } } });
      conversionRate = totalConversations > 0 ? Number((stage6Plus / totalConversations).toFixed(4)) : 0;

      for (const status of ['detected', 'validated', 'pursued', 'converted']) {
        const opps = await RevenueOpportunity.findAll({
          where: { source_channel: 'openclaw', status },
          attributes: ['estimated_value'],
          raw: true,
        });
        revenuePipeline[status] = {
          count: opps.length,
          value: opps.reduce((sum, o: any) => sum + (Number(o.estimated_value) || 0), 0),
        };
      }
    } catch { /* tables may not exist yet */ }

    res.json({
      kpis: {
        signals_24h: signalsToday,
        signals_total: signalsTotal,
        responses_posted: responsesPosted,
        responses_draft: responsesDraft,
        active_sessions: activeSessions,
        queue_depth: pendingTasks,
        learnings: learningsCount,
        active_agents: activeAgents,
        content_pipeline: contentPipeline,
        responses_manual_queue: responsesManualQueue,
        replies_sent: repliesSent,
        total_engagement_score: totalEngagementScore,
        total_clicks: totalClicks,
        total_replies: totalReplies,
        ctr,
        reply_rate: replyRate,
        best_tone: bestTone,
        pipeline_funnel: pipelineFunnel,
        priority_breakdown: priorityBreakdown,
        conversion_rate: conversionRate,
        revenue_pipeline: revenuePipeline,
      },
      platforms: platformStats,
      agents: agents.map((a: any) => ({
        id: a.id,
        name: a.agent_name,
        type: a.agent_type,
        status: a.status,
        enabled: a.enabled,
        description: a.description,
        config: a.config,
        last_run_at: a.last_run_at,
        last_result: a.last_result,
        run_count: a.run_count,
        error_count: a.error_count,
        avg_duration_ms: a.avg_duration_ms,
      })),
      performance: {
        top_responses: topResponses,
        tone_breakdown: toneBreakdown,
        platform_breakdown: platformBreakdown,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Signals ──────────────────────────────────────────────────────

router.get(`${BASE}/signals`, async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as string | undefined;
    const status = req.query.status as string | undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const where: Record<string, any> = {};
    if (platform) where.platform = platform;
    if (status) where.status = status;

    const offset = (page - 1) * limit;
    const { rows, count } = await OpenclawSignal.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({ signals: rows, total: count, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(`${BASE}/signals/:id`, async (req: Request, res: Response) => {
  try {
    const signal = await OpenclawSignal.findByPk(req.params.id as string, {
      include: [{ model: OpenclawResponse, as: 'response' }],
    });
    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    res.json(signal);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Responses ────────────────────────────────────────────────────

router.get(`${BASE}/responses`, async (req: Request, res: Response) => {
  try {
    const post_status = req.query.post_status as string | undefined;
    const platform = req.query.platform as string | undefined;
    const execution_type = req.query.execution_type as string | undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const where: Record<string, any> = {};
    if (post_status === 'needs_action') {
      where.post_status = { [Op.notIn]: ['posted', 'rejected', 'removed'] };
    } else if (post_status) {
      where.post_status = post_status;
    }
    if (platform) where.platform = platform;
    if (execution_type === 'human_execution') {
      where.execution_type = 'human_execution';
    } else if (execution_type === 'api_posting') {
      // Automated tab: show everything that's NOT human_execution (includes null, empty, api_posting)
      where[Op.or as any] = [
        { execution_type: null },
        { execution_type: '' },
        { execution_type: 'api_posting' },
      ];
    } else if (execution_type) {
      where.execution_type = execution_type;
    }

    const offset = (page - 1) * limit;
    const { rows, count } = await OpenclawResponse.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [
        { model: OpenclawSignal, as: 'signal', attributes: ['title', 'source_url', 'platform', 'content_excerpt', 'details', 'relevance_score', 'engagement_score', 'author'] as any },
        { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'interest_level', 'lead_score', 'pipeline_stage'] as any, required: false },
      ],
    });

    res.json({ responses: rows, total: count, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/responses/:id/approve`, async (req: Request, res: Response) => {
  try {
    const response = await OpenclawResponse.findByPk(req.params.id as string);
    if (!response) return res.status(404).json({ error: 'Response not found' });
    if (response.post_status !== 'draft') {
      return res.status(400).json({ error: `Cannot approve response with status: ${response.post_status}` });
    }

    await response.update({ post_status: 'approved', updated_at: new Date() });

    // Create a post task
    await OpenclawTask.create({
      task_type: 'post_response',
      priority: 7,
      status: 'pending',
      signal_id: response.signal_id,
      input_data: { response_id: response.id },
      created_at: new Date(),
    });

    res.json({ success: true, response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/responses/:id/reject`, async (req: Request, res: Response) => {
  try {
    const response = await OpenclawResponse.findByPk(req.params.id as string);
    if (!response) return res.status(404).json({ error: 'Response not found' });

    await response.update({ post_status: 'removed', updated_at: new Date() });

    // Update signal status
    if (response.signal_id) {
      await OpenclawSignal.update(
        { status: 'skipped', updated_at: new Date() },
        { where: { id: response.signal_id } },
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Mark as Posted (manual posting flow) ─────────────────────────

router.post(`${BASE}/responses/:id/mark-posted`, async (req: Request, res: Response) => {
  try {
    const response = await OpenclawResponse.findByPk(req.params.id as string);
    if (!response) return res.status(404).json({ error: 'Response not found' });
    if (response.post_status !== 'ready_to_post' && response.post_status !== 'approved' && response.post_status !== 'ready_for_manual_post') {
      return res.status(400).json({ error: `Cannot mark as posted — current status: ${response.post_status}` });
    }

    const { post_url } = req.body;
    if (!post_url) return res.status(400).json({ error: 'post_url is required' });

    await response.update({
      post_status: 'posted',
      post_url,
      posted_at: new Date(),
      updated_at: new Date(),
    });

    // Update signal status
    if (response.signal_id) {
      await OpenclawSignal.update(
        { status: 'responded', responded_at: new Date(), updated_at: new Date() },
        { where: { id: response.signal_id } },
      );
    }

    res.json({ success: true, response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin-Triggered Browser Posting (HUMAN_EXECUTION platforms) ──

router.post(`${BASE}/responses/:id/post-via-browser`, async (req: Request, res: Response) => {
  try {
    const response = await OpenclawResponse.findByPk(req.params.id as string);
    if (!response) return res.status(404).json({ error: 'Response not found' });
    if (response.post_status !== 'approved') {
      return res.status(400).json({ error: `Response must be approved first (current: ${response.post_status})` });
    }

    const signal = response.signal_id
      ? await OpenclawSignal.findByPk(response.signal_id)
      : null;

    if (!signal?.source_url) {
      return res.status(400).json({ error: 'No source URL on signal. Cannot post via browser without a target article.' });
    }

    const { hasBrowserSupport, postViaBrowser } = await import('../../services/agents/openclaw/openclawBrowserPostingService');
    if (!hasBrowserSupport(response.platform)) {
      return res.status(400).json({ error: `Browser posting not supported for ${response.platform}` });
    }

    const browserResult = await postViaBrowser(
      response.platform,
      signal.source_url,
      response.content,
      {
        headless: true,
        screenshot_on_post: true,
        min_delay_ms: 2000,
        max_delay_ms: 6000,
      },
    );

    await response.update({
      post_status: 'posted',
      posted_at: new Date(),
      post_url: browserResult.post_url,
      updated_at: new Date(),
    });

    if (signal) {
      await signal.update({ status: 'responded', responded_at: new Date(), updated_at: new Date() });
    }

    res.json({
      success: true,
      response,
      post_url: browserResult.post_url,
      screenshot_path: browserResult.screenshot_path,
      method: 'browser',
    });
  } catch (err: any) {
    console.error('[OpenClaw] Browser posting error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────

router.get(`${BASE}/sessions`, async (_req: Request, res: Response) => {
  try {
    const sessions = await OpenclawSession.findAll({
      order: [['last_activity_at', 'DESC']],
    });
    res.json({ sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tasks ────────────────────────────────────────────────────────

router.get(`${BASE}/tasks`, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const task_type = req.query.task_type as string | undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const where: Record<string, any> = {};
    if (status) where.status = status;
    if (task_type) where.task_type = task_type;

    const offset = (page - 1) * limit;
    const { rows, count } = await OpenclawTask.findAndCountAll({
      where,
      order: [['priority', 'DESC'], ['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({ tasks: rows, total: count, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Learnings ────────────────────────────────────────────────────

router.get(`${BASE}/learnings`, async (req: Request, res: Response) => {
  try {
    const learning_type = req.query.learning_type as string | undefined;
    const platform = req.query.platform as string | undefined;
    const where: Record<string, any> = {};
    if (learning_type) where.learning_type = learning_type;
    if (platform) where.platform = platform;

    const learnings = await OpenclawLearning.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 100,
    });

    res.json({ learnings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Agent Activity Logs ─────────────────────────────────────────

router.get(`${BASE}/agents/:agentId/activity`, async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId as string;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const result = req.query.result as string | undefined;
    const offset = (page - 1) * limit;

    const where: Record<string, any> = { agent_id: agentId };
    if (result) where.result = result;

    const { rows, count } = await AiAgentActivityLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({ activities: rows, total: count, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Config ───────────────────────────────────────────────────────

router.get(`${BASE}/config`, async (_req: Request, res: Response) => {
  try {
    const agents = await AiAgent.findAll({
      where: { category: 'openclaw' },
      attributes: ['id', 'agent_name', 'config', 'enabled'],
    });
    res.json({
      agents: agents.map((a: any) => ({
        id: a.id,
        name: a.agent_name,
        config: a.config,
        enabled: a.enabled,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/config`, async (req: Request, res: Response) => {
  try {
    const { agent_name, config, enabled } = req.body;
    const agent = await AiAgent.findOne({ where: { agent_name, category: 'openclaw' } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const updates: Record<string, any> = { updated_at: new Date() };
    if (config) updates.config = { ...(agent.config || {}), ...config };
    if (enabled !== undefined) updates.enabled = enabled;

    await agent.update(updates);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Manual Signal Submission ────────────────────────────────────

function detectPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    if (host.includes('quora.com')) return 'quora';
    if (host.includes('reddit.com')) return 'reddit';
    if (host === 'dev.to') return 'devto';
    if (host.includes('ycombinator.com')) return 'hackernews';
    if (host.includes('linkedin.com')) {
      // LinkedIn post comments vs general LinkedIn
      if (url.includes('/feed/') || url.includes('/posts/')) return 'linkedin_comments';
      return 'linkedin';
    }
    if (host.includes('facebook.com') && url.includes('/groups/')) return 'facebook_groups';
    if (host.includes('medium.com')) return 'medium';
    if (host.includes('hashnode.dev') || host.includes('hashnode.com')) return 'hashnode';
    // Common Discourse forums
    if (host === 'discuss.huggingface.co' || host === 'community.openai.com' || host === 'forums.fast.ai') return 'discourse';
    return null;
  } catch {
    return null;
  }
}

async function extractContentFromUrl(url: string, platform: string): Promise<{ title: string; content_excerpt: string; details: Record<string, any> }> {
  const fallback = { title: url, content_excerpt: '', details: { source: 'manual_submission' } };

  try {
    if (platform === 'reddit') {
      // Use Reddit's public JSON API
      const jsonUrl = url.replace(/\/?$/, '.json');
      const resp = await axios.get(jsonUrl, { headers: { 'User-Agent': 'OpenClaw/1.0' }, timeout: 15000 });
      const post = resp.data?.[0]?.data?.children?.[0]?.data;
      if (post) {
        return {
          title: post.title || url,
          content_excerpt: (post.selftext || '').slice(0, 500),
          details: { source: 'manual_submission', subreddit: post.subreddit, num_comments: post.num_comments, score: post.score, author: post.author },
        };
      }
    }

    if (platform === 'devto') {
      // Extract article slug and use Dev.to API
      const slugMatch = url.match(/dev\.to\/[^/]+\/(.+?)(?:\?|#|$)/);
      if (slugMatch) {
        const resp = await axios.get(`https://dev.to/api/articles/${slugMatch[1]}`, { timeout: 15000 });
        const article = resp.data;
        return {
          title: article.title || url,
          content_excerpt: (article.description || '').slice(0, 500),
          details: { source: 'manual_submission', id: article.id, comments_count: article.comments_count, positive_reactions_count: article.positive_reactions_count, tags: article.tag_list, user: article.user?.username },
        };
      }
    }

    if (platform === 'discourse') {
      // Discourse topics have a JSON endpoint
      const topicMatch = url.match(/\/t\/[^/]+\/(\d+)/);
      if (topicMatch) {
        const topicId = topicMatch[1];
        const baseUrl = new URL(url).origin;
        const resp = await axios.get(`${baseUrl}/t/${topicId}.json`, { headers: { 'User-Agent': 'OpenClaw/1.0' }, timeout: 15000 });
        const topic = resp.data;
        const firstPost = topic?.post_stream?.posts?.[0];
        return {
          title: topic.title || url,
          content_excerpt: (firstPost?.cooked?.replace(/<[^>]+>/g, '') || '').slice(0, 500),
          details: { source: 'manual_submission', topic_id: Number(topicId), forum_url: baseUrl, forum_name: new URL(url).hostname, posts_count: topic.posts_count, views: topic.views, like_count: topic.like_count },
        };
      }
    }

    // For Quora, LinkedIn, Medium, HN, Hashnode — scrape og: meta tags
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const html = resp.data as string;
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      || html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);

    return {
      title: (titleMatch?.[1] || url).replace(/ - Quora$/, '').replace(/ \| LinkedIn$/, '').trim(),
      content_excerpt: (descMatch?.[1] || '').slice(0, 500),
      details: { source: 'manual_submission' },
    };
  } catch (err: any) {
    console.warn(`[OpenClaw] Content extraction failed for ${url}:`, err?.message?.slice(0, 200));
    return fallback;
  }
}

router.post(`${BASE}/signals/submit`, async (req: Request, res: Response) => {
  try {
    const { url, platform: overridePlatform } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    // Validate URL format
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }

    const platform = overridePlatform || detectPlatform(url);
    if (!platform) {
      return res.status(400).json({ error: 'Could not detect platform from URL. Provide a platform parameter.' });
    }

    // Check for duplicate
    const existing = await OpenclawSignal.findOne({ where: { source_url: url } });
    if (existing) {
      return res.status(409).json({ error: 'Signal already exists for this URL', signal: existing });
    }

    // Extract content
    const { title, content_excerpt, details } = await extractContentFromUrl(url, platform);

    // Create signal with high scores (manually submitted = high value)
    const signal = await OpenclawSignal.create({
      platform,
      source_url: url,
      title,
      content_excerpt,
      details,
      relevance_score: 0.8,
      engagement_score: 0.8,
      risk_score: 0.1,
      status: 'discovered',
      topic_tags: [],
      created_at: new Date(),
    });

    // Create generate_response task
    const task = await OpenclawTask.create({
      task_type: 'generate_response',
      priority: 8,
      status: 'pending',
      signal_id: signal.id,
      input_data: { source: 'manual_submission' },
      created_at: new Date(),
    });

    // Immediately generate response inline for manual submissions
    let responseGenerated = false;
    try {
      const { getOpenAIClient } = await import('../../intelligence/assistant/openaiHelper');
      const { isHumanExecution, getExecutionType, STRATEGY_PROMPT_INSTRUCTIONS, getStrategy } = await import('../../services/agents/openclaw/openclawPlatformStrategy');
      const crypto = await import('crypto');
      const client = getOpenAIClient();

      if (client) {
        const strategyInstructions = STRATEGY_PROMPT_INSTRUCTIONS[getStrategy(platform)] || '';
        const systemPrompt = `You are Ali Moiz, founder of an enterprise AI leadership training program. You built a system with 18 departments and 172 AI agents managed by an AI COO. You respond to posts as a practitioner who builds real AI systems daily.

Rules:
1. Lead with a useful insight or framework from your experience
2. Never use the word "Colaberry" - say "our system" or "the accelerator"
3. Answer the original question directly first
4. Match the platform communication style
5. Sound like a real person, not a marketing bot
6. Never use em dashes
7. Keep it concise but substantive
${strategyInstructions}`;

        const userPrompt = `Platform: ${platform}\nTitle: ${title}\nContent: ${content_excerpt || '(no content extracted)'}\n\nWrite a thoughtful, value-adding response to this post.`;

        const result = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 1500,
          temperature: 0.7,
        });

        const responseContent = result.choices[0]?.message?.content?.trim();
        if (responseContent) {
          const shortPlat = platform.slice(0, 6);
          const shortId = `oc-${shortPlat}-${crypto.randomBytes(3).toString('hex')}`;
          const humanExec = isHumanExecution(platform);
          const execType = humanExec ? 'human_execution' : 'api_posting';

          const response = await OpenclawResponse.create({
            signal_id: signal.id,
            platform,
            content: responseContent.replace(/\b[Cc]olaberry\b(?![./])/g, '').replace(/\u2014/g, ' - ').replace(/\u2013/g, ' - '),
            tone: 'professional',
            short_id: shortId,
            execution_type: execType,
            post_status: humanExec ? 'ready_for_manual_post' : 'draft',
            reasoning: `Manual submission: ${platform} - ${title.slice(0, 60)}`,
            priority_score: 80,
            intent_level: 'high',
            recommended_action: humanExec ? 'Copy response and post manually' : 'Review and approve for auto-posting',
            follow_up_suggestion: 'If they respond positively, advance to Stage 2 qualification',
            created_at: new Date(),
          });

          await signal.update({ response_id: response.id, status: 'responded', updated_at: new Date() });
          await task.update({ status: 'completed', output_data: { response_id: response.id, source: 'inline_generation' }, completed_at: new Date(), updated_at: new Date() });
          responseGenerated = true;
        }
      }
    } catch (err: any) {
      console.warn('[OpenClaw] Inline response generation failed, task remains pending:', err?.message?.slice(0, 200));
    }

    res.json({ success: true, signal, task_id: task.id, response_generated: responseGenerated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── LinkedIn Post Generator ─────────────────────────────────────────────────
const LINKEDIN_PROFILE = 'https://www.linkedin.com/in/ali-muwwakkil-6278992b/';
const LINKEDIN_SYSTEM_PROMPT = `You are Ali Moiz (Ali Muwwakkil), Managing Director at Colaberry and founder of an enterprise AI leadership accelerator. You help data professionals and leaders build and deploy AI systems in 3 weeks.

You write LinkedIn posts that share genuine insights from running AI training cohorts for enterprise teams. Your voice is confident, practical, and opinionated — you've seen what works and what doesn't.

Rules:
1. NEVER use the word "Colaberry" — say "our program", "the accelerator", or "my team"
2. Start with a strong hook (1 line that stops the scroll)
3. Use short paragraphs (1-2 sentences each) — LinkedIn rewards line breaks
4. Share a specific insight, framework, or observation from your experience
5. NO hashtags, NO emojis, NO "follow me for more" — you're a practitioner, not an influencer
6. End with a clear CTA pointing to the TRACKED URL for booking a strategy call
7. Keep it under 1300 characters (sweet spot for LinkedIn engagement)
8. Sound like a real person sharing hard-won experience, not a thought leader template`;

router.post(`${BASE}/linkedin/generate`, async (req: Request, res: Response) => {
  try {
    const { topic } = req.body;
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'topic is required' });
    }

    const crypto = await import('crypto');
    const shortId = `oc-linkedin-${crypto.randomBytes(4).toString('hex')}`;
    const BASE_URL = process.env.BASE_URL || 'https://enterprise.colaberry.ai';
    const trackedUrl = `${BASE_URL}/i/${shortId}`;

    // Create signal for tracking
    const signal = await OpenclawSignal.create({
      platform: 'linkedin',
      source_url: `linkedin:post:${shortId}`,
      title: topic,
      content_excerpt: '',
      details: { source: 'linkedin_post_generator', linkedin_profile: LINKEDIN_PROFILE },
      relevance_score: 0.9,
      engagement_score: 0.9,
      risk_score: 0.0,
      status: 'queued',
      topic_tags: [],
      created_at: new Date(),
    });

    // Generate post with LLM
    const { getOpenAIClient } = await import('../../intelligence/assistant/openaiHelper');
    const client = getOpenAIClient();
    let content = '';

    if (client) {
      try {
        const result = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: LINKEDIN_SYSTEM_PROMPT },
            { role: 'user', content: `Write a LinkedIn post about this topic: "${topic}"\n\nTRACKED URL — you MUST end the post with a CTA that includes this link: ${trackedUrl}\nThis link takes them to a page where they can book a strategy call about building AI systems for their team.` },
          ],
          max_tokens: 800,
          temperature: 0.75,
        });
        content = result.choices[0]?.message?.content || '';
      } catch (err: any) {
        console.warn('[OpenClaw LinkedIn] LLM failed:', err?.message?.slice(0, 200));
      }
    }

    if (!content) {
      content = `Most organizations are getting AI adoption wrong.\n\nThey buy tools. They run pilots. They send people to conferences.\n\nBut they don't build systems.\n\nAfter running multiple cohorts of enterprise AI training, here's what I've learned about ${topic}:\n\nThe teams that succeed don't start with the technology. They start with a clear business problem, build AI literacy across the organization, and then deploy systems — not just tools.\n\nThe gap isn't technical. It's strategic.\n\nIf your team is navigating AI adoption and wants to go from idea to deployed system in 3 weeks, let's talk: ${trackedUrl}`;
    }

    // Clean up — remove "Colaberry" from prose but protect URLs
    content = content.replace(/\b[Cc]olaberry\b(?![./])/g, '').trim();
    // Remove hallucinated URLs (keep tracked URL and LinkedIn profile)
    const trackedBase = trackedUrl.replace(/\/+$/, '');
    content = content.replace(/https?:\/\/\S+/g, (match) => {
      const stripped = match.replace(/[)\]},;.!?]+$/, '');
      return stripped.startsWith(trackedBase) || stripped.startsWith(LINKEDIN_PROFILE) ? match : '';
    }).replace(/  +/g, ' ').replace(/ \n/g, '\n').trim();
    // Ensure tracked URL is present (after URL cleanup)
    if (!content.includes(trackedUrl)) {
      content += `\n\nIf your team wants to go from AI strategy to deployed system in 3 weeks, book a call: ${trackedUrl}`;
    }

    // Create response (manual execution — user copies and posts to LinkedIn)
    const response = await OpenclawResponse.create({
      signal_id: signal.id,
      platform: 'linkedin',
      content,
      tone: 'professional',
      short_id: shortId,
      tracked_url: trackedUrl,
      utm_params: { utm_source: 'linkedin', utm_medium: 'organic_post', utm_campaign: shortId },
      post_status: 'draft',
      execution_type: 'human_execution',
      created_at: new Date(),
    });

    await signal.update({ response_id: response.id, updated_at: new Date() });

    // Create manual task so it shows in the task queue
    await OpenclawTask.create({
      task_type: 'post_response',
      priority: 8,
      status: 'pending',
      signal_id: signal.id,
      input_data: { response_id: response.id, platform: 'linkedin', action: 'Copy post content and publish on LinkedIn' },
      created_at: new Date(),
    });

    res.json({ success: true, signal, response, short_id: shortId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── LinkedIn Comment Reply Generator (Batch) ─────────────────────────────────
// Accepts either:
//   - comments_text: raw pasted text from LinkedIn (user copies comment section)
//   - OR falls back to server-side scraping via Voyager API (needs LINKEDIN_PROXY_URL)
router.post(`${BASE}/linkedin/reply-to-comments`, async (req: Request, res: Response) => {
  try {
    const { post_url, comments_text, post_content: userPostContent } = req.body;

    if (!post_url || typeof post_url !== 'string') {
      return res.status(400).json({ error: 'post_url is required' });
    }

    let scraped: { post_content: string; post_author: string; comments: Array<{ commenter_name: string; commenter_title: string; comment_text: string }> };

    if (comments_text && typeof comments_text === 'string' && comments_text.trim().length > 10) {
      // User pasted raw comments text — use GPT to parse it into structured comments
      const { getOpenAIClient } = await import('../../intelligence/assistant/openaiHelper');
      const parseClient = getOpenAIClient();

      let parsedComments: Array<{ commenter_name: string; commenter_title: string; comment_text: string }> = [];

      if (parseClient) {
        try {
          const parseResult = await parseClient.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `Extract comments from this raw text copied from a LinkedIn post. Return a JSON array of objects with: { "commenter_name": string, "commenter_title": string, "comment_text": string }. Only include actual comments from real people (not the post author, not UI elements like "Like", "Reply", etc.). Return ONLY the JSON array, no markdown fencing.`,
              },
              { role: 'user', content: comments_text.slice(0, 8000) },
            ],
            max_tokens: 2000,
            temperature: 0,
          });
          const raw = parseResult.choices[0]?.message?.content || '[]';
          parsedComments = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        } catch (err: any) {
          console.warn('[OpenClaw LinkedIn] Failed to parse pasted comments:', err?.message?.slice(0, 200));
        }
      }

      if (parsedComments.length === 0) {
        return res.json({ success: true, replies_generated: 0, replies: [], message: 'Could not extract comments from the pasted text. Try copying just the comments section.' });
      }

      scraped = {
        post_content: userPostContent || '',
        post_author: '',
        comments: parsedComments,
      };
    } else {
      // No pasted text — try server-side scraping (works with LINKEDIN_PROXY_URL)
      const { scrapeLinkedInPost } = await import('../../services/agents/openclaw/openclawLinkedInScraper');
      try {
        scraped = await scrapeLinkedInPost(post_url);
      } catch (scrapeErr: any) {
        return res.status(422).json({ error: `Could not read LinkedIn post: ${scrapeErr.message}. Try copying the comments from your browser and pasting them instead.` });
      }

      if (!scraped.comments || scraped.comments.length === 0) {
        return res.json({ success: true, replies_generated: 0, replies: [], message: 'No comments found. Try copying the comments from your browser and pasting them in the text box.' });
      }
    }

    // Dedup: filter out commenters we already replied to on this post
    const existingSignals = await OpenclawSignal.findAll({
      where: { platform: 'linkedin_comments', source_url: post_url },
      attributes: ['details'],
    });
    const repliedCommenters = new Set(
      existingSignals.map((s: any) => s.details?.commenter_name).filter(Boolean)
    );
    const newComments = scraped.comments.filter(c => !repliedCommenters.has(c.commenter_name));

    if (newComments.length === 0) {
      return res.json({ success: true, replies_generated: 0, replies: [], message: 'All commenters already have replies queued.' });
    }

    // Step 2: Generate replies for new comments in one LLM call
    const { getOpenAIClient } = await import('../../intelligence/assistant/openaiHelper');
    const client = getOpenAIClient();

    const systemPrompt = `You are Ali Moiz, founder of an enterprise AI leadership accelerator. You built a system with 18 departments and 172 AI agents managed by an AI COO. You respond to comments on your LinkedIn posts as a practitioner who builds real AI systems daily.

Rules:
1. Address each commenter by first name
2. Reply directly to their specific point - don't be generic
3. If they asked a question, answer it with real details from your system
4. If they affirmed your point, acknowledge their insight and build on it
5. Be conversational and professional - like talking to a peer
6. Never use em dashes - use hyphens or rewrite
7. Never mention "Colaberry" - say "our system" or "the accelerator"
8. Keep replies concise: 2-4 sentences for affirmations, 4-8 for questions
9. Sound like a real founder, not a chatbot - be opinionated and specific
10. Do NOT include any URLs or links in the reply

Return a JSON array of objects with: { "commenter_name": string, "reply": string }
One entry per comment. Return ONLY the JSON array, no markdown fencing.`;

    const commentList = newComments.map((c, i) =>
      `${i + 1}. ${c.commenter_name}${c.commenter_title ? ` (${c.commenter_title})` : ''}: "${c.comment_text}"`
    ).join('\n');

    let replies: Array<{ commenter_name: string; reply: string }> = [];

    if (client) {
      try {
        const result = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `My LinkedIn post:\n${scraped.post_content.slice(0, 3000)}\n\nComments:\n${commentList}\n\nGenerate a reply for each comment.`,
            },
          ],
          max_tokens: 2000,
          temperature: 0.7,
        });
        const raw = result.choices[0]?.message?.content || '[]';
        replies = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      } catch (err: any) {
        console.warn('[OpenClaw LinkedIn Batch Reply] LLM failed:', err?.message?.slice(0, 200));
      }
    }

    // Fallback: generate simple replies if LLM failed
    if (replies.length === 0) {
      replies = newComments.map(c => ({
        commenter_name: c.commenter_name,
        reply: `Great point ${c.commenter_name.split(' ')[0]}. This is exactly the kind of insight that matters when building autonomous systems. Happy to go deeper on this.`,
      }));
    }

    // Step 3: Create signal + response for each reply
    const crypto = await import('crypto');
    const createdReplies: Array<{ commenter_name: string; reply_preview: string }> = [];

    for (const r of replies) {
      const shortId = `oc-linke-${crypto.randomBytes(3).toString('hex')}`;

      // Clean up content
      let content = r.reply
        .replace(/\b[Cc]olaberry\b(?![./])/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\u2014/g, ' - ')
        .replace(/\u2013/g, ' - ');

      const signal = await OpenclawSignal.create({
        platform: 'linkedin_comments',
        source_url: post_url,
        title: `Reply to ${r.commenter_name} on LinkedIn`,
        content_excerpt: (newComments.find(c => c.commenter_name === r.commenter_name)?.comment_text || '').slice(0, 500),
        details: {
          source: 'linkedin_comment_reply_batch',
          commenter_name: r.commenter_name,
          post_content: scraped.post_content.slice(0, 2000),
          post_author: scraped.post_author,
          comment_text: newComments.find(c => c.commenter_name === r.commenter_name)?.comment_text || '',
        },
        relevance_score: 0.95,
        engagement_score: 0.9,
        risk_score: 0.0,
        status: 'queued',
        topic_tags: [],
        created_at: new Date(),
      });

      const response = await OpenclawResponse.create({
        signal_id: signal.id,
        platform: 'linkedin_comments',
        content,
        tone: 'professional',
        short_id: shortId,
        execution_type: 'human_execution',
        post_status: 'ready_for_manual_post',
        created_at: new Date(),
      });

      await signal.update({ response_id: response.id, status: 'responded', updated_at: new Date() });

      createdReplies.push({ commenter_name: r.commenter_name, reply_preview: content.slice(0, 120) });
    }

    // Auto-track this post for ongoing monitoring
    const allCommenters = scraped.comments.map(c => c.commenter_name);
    const existingTracker = await OpenclawSignal.findOne({
      where: { platform: 'linkedin_post_tracking', source_url: post_url },
    });
    if (!existingTracker) {
      await OpenclawSignal.create({
        platform: 'linkedin_post_tracking' as any,
        source_url: post_url,
        title: `Tracking: ${scraped.post_author || 'LinkedIn Post'}`,
        content_excerpt: scraped.post_content.slice(0, 500),
        details: { tracked: true, last_scanned_at: new Date().toISOString(), known_commenters: allCommenters },
        relevance_score: 1.0, engagement_score: 0, risk_score: 0,
        status: 'active' as any,
        topic_tags: [],
        created_at: new Date(),
      });
    } else {
      const known = (existingTracker as any).details?.known_commenters || [];
      const merged = [...new Set([...known, ...allCommenters])];
      await existingTracker.update({
        details: { ...(existingTracker as any).details, last_scanned_at: new Date().toISOString(), known_commenters: merged },
        updated_at: new Date(),
      });
    }

    res.json({ success: true, replies_generated: createdReplies.length, replies: createdReplies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── LinkedIn Session Management ───────────────────────────────────────────────

router.post(`${BASE}/linkedin/login`, async (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Browser-based login is deprecated. Use POST /linkedin/save-session with your li_at cookie instead.' });
});

router.post(`${BASE}/linkedin/verify`, async (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Browser-based verification is deprecated. Use POST /linkedin/save-session with your li_at cookie instead.' });
});

router.post(`${BASE}/linkedin/save-session`, async (req: Request, res: Response) => {
  try {
    const { li_at, JSESSIONID } = req.body;
    if (!li_at) {
      return res.status(400).json({ error: 'li_at cookie is required' });
    }
    const { saveLinkedInCookies } = await import('../../services/agents/openclaw/openclawLinkedInScraper');
    await saveLinkedInCookies(li_at, JSESSIONID || '');
    res.json({ success: true, message: 'LinkedIn session cookies saved.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(`${BASE}/linkedin/session-status`, async (_req: Request, res: Response) => {
  try {
    const { checkLinkedInSession } = await import('../../services/agents/openclaw/openclawLinkedInScraper');
    const status = await checkLinkedInSession();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── LinkedIn Tracked Posts CRUD ───────────────────────────────────────────────

router.get(`${BASE}/linkedin/tracked-posts`, async (_req: Request, res: Response) => {
  try {
    const posts = await OpenclawSignal.findAll({
      where: { platform: 'linkedin_post_tracking' as any },
      order: [['created_at', 'DESC']],
    });
    res.json({ tracked_posts: posts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/linkedin/track-post`, async (req: Request, res: Response) => {
  try {
    const { post_url } = req.body;
    if (!post_url) return res.status(400).json({ error: 'post_url is required' });

    const existing = await OpenclawSignal.findOne({
      where: { platform: 'linkedin_post_tracking' as any, source_url: post_url },
    });
    if (existing) return res.json({ success: true, message: 'Already tracking this post', tracked_post: existing });

    // Extract a readable title from the LinkedIn post
    let postTitle = 'Tracking: LinkedIn Post';
    try {
      const ogResp = await axios.get(post_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', Accept: 'text/html' },
        timeout: 10000, maxRedirects: 5,
      });
      const html = ogResp.data as string;
      const ogMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      if (ogMatch?.[1]) postTitle = ogMatch[1].replace(/ \| LinkedIn$/, '').trim();
    } catch { /* fall through to slug extraction */ }
    if (postTitle === 'Tracking: LinkedIn Post') {
      // Fallback: extract hashtags from URL slug
      const slugMatch = post_url.match(/\/posts\/[^/]+-([a-z][\w-]+)-share-/i);
      if (slugMatch?.[1]) {
        postTitle = slugMatch[1].replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).slice(0, 80);
      }
    }

    const tracked = await OpenclawSignal.create({
      platform: 'linkedin_post_tracking' as any,
      source_url: post_url,
      title: postTitle,
      content_excerpt: '',
      details: { tracked: true, last_scanned_at: null, known_commenters: [] },
      relevance_score: 1.0, engagement_score: 0, risk_score: 0,
      status: 'active' as any,
      topic_tags: [],
      created_at: new Date(),
    });
    res.json({ success: true, tracked_post: tracked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete(`${BASE}/linkedin/tracked-posts/:id`, async (req: Request, res: Response) => {
  try {
    const signal = await OpenclawSignal.findByPk(req.params.id as string);
    if (!signal) return res.status(404).json({ error: 'Not found' });
    await signal.update({ status: 'expired' as any, updated_at: new Date() });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Facebook Groups Session & Config ─────────────────────────────────────────

router.post(`${BASE}/facebook/save-session`, async (req: Request, res: Response) => {
  try {
    const { c_user, xs, datr } = req.body;
    if (!c_user || !xs) return res.status(400).json({ error: 'c_user and xs cookies are required' });
    await saveFacebookCookies(c_user, xs, datr);
    const status = await checkFacebookSession();
    res.json({ success: true, message: status.authenticated ? 'Facebook session saved and verified.' : 'Cookies saved but session could not be verified. They may still work for browser posting.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(`${BASE}/facebook/session-status`, async (_req: Request, res: Response) => {
  try {
    const status = await checkFacebookSession();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(`${BASE}/facebook/groups`, async (_req: Request, res: Response) => {
  try {
    const groups = await listFacebookGroups();
    res.json({ groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/facebook/groups/configure`, async (req: Request, res: Response) => {
  try {
    const { target_groups, enabled } = req.body;
    if (!Array.isArray(target_groups)) return res.status(400).json({ error: 'target_groups must be an array' });
    await saveConfiguredGroups({ target_groups, enabled: enabled !== false });
    res.json({ success: true, message: `Configured ${target_groups.length} Facebook groups.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(`${BASE}/facebook/groups/configured`, async (_req: Request, res: Response) => {
  try {
    const config = await getConfiguredGroups();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reddit Session Management (Cookie-based) ─────────────────────────────────

router.post(`${BASE}/reddit/save-session`, async (req: Request, res: Response) => {
  try {
    const { reddit_session, token_v2 } = req.body;
    if (!reddit_session) {
      return res.status(400).json({ error: 'reddit_session cookie is required' });
    }
    await saveRedditCookies(reddit_session, token_v2);
    const result = await checkRedditSession();
    res.json({ success: result.authenticated, message: result.message });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(`${BASE}/reddit/session-status`, async (_req: Request, res: Response) => {
  try {
    const result = await checkRedditSession();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Reputation & Demand Engine Endpoints
// ══════════════════════════════════════════════════════════════════════════════

// ── Authority Content ────────────────────────────────────────────────────────

router.get(`${BASE}/authority-content`, async (req: Request, res: Response) => {
  try {
    const { status, platform, page = '1', limit = '25' } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (platform) where.platform = platform;
    const offset = (Number(page) - 1) * Number(limit);
    const { rows, count } = await AuthorityContent.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset,
    });
    res.json({ authority_content: rows, total: count, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/authority-content/generate`, async (req: Request, res: Response) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const crypto = await import('crypto');
    const shortId = `oc-auth-${crypto.randomBytes(4).toString('hex')}`;
    const BASE_URL = process.env.BASE_URL || 'https://enterprise.colaberry.ai';
    const trackedUrl = `${BASE_URL}/i/${shortId}`;

    const { generateContent } = await import('../../services/agents/openclaw/openclawAiHelper');
    const prompt = `Write a LinkedIn thought-leadership post (150-250 words) about: "${topic}"

Requirements:
- Open with a bold, counterintuitive take
- Share specific insights from enterprise AI training experience
- End with a question that invites executive-level discussion
- Do NOT mention "Colaberry"
- Do NOT include any URLs or links
- Write in first person, professional tone`;

    const result = await generateContent(prompt, 'gpt-4o');
    const content = result.body.replace(/colaberry/gi, '[company]');

    const post = await AuthorityContent.create({
      source_type: 'manual',
      platform: 'linkedin',
      title: topic,
      content,
      tone: 'professional',
      short_id: shortId,
      tracked_url: trackedUrl,
      utm_params: { utm_source: 'linkedin', utm_medium: 'organic', utm_campaign: 'openclaw_authority' },
      status: 'draft',
    });

    res.json({ success: true, authority_content: post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/authority-content/:id/approve`, async (req: Request, res: Response) => {
  try {
    const post = await AuthorityContent.findByPk(req.params.id as string);
    if (!post) return res.status(404).json({ error: 'Not found' });
    await post.update({ status: 'approved', updated_at: new Date() });
    res.json({ success: true, authority_content: post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/authority-content/:id/mark-posted`, async (req: Request, res: Response) => {
  try {
    const { post_url } = req.body;
    if (!post_url) return res.status(400).json({ error: 'post_url is required' });
    const post = await AuthorityContent.findByPk(req.params.id as string);
    if (!post) return res.status(404).json({ error: 'Not found' });
    await post.update({ status: 'posted', post_url, posted_at: new Date(), updated_at: new Date() });
    res.json({ success: true, authority_content: post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put(`${BASE}/authority-content/:id/metrics`, async (req: Request, res: Response) => {
  try {
    const { performance_metrics } = req.body;
    const post = await AuthorityContent.findByPk(req.params.id as string);
    if (!post) return res.status(404).json({ error: 'Not found' });
    await post.update({
      performance_metrics: { ...(post.performance_metrics || {}), ...performance_metrics },
      updated_at: new Date(),
    });
    res.json({ success: true, authority_content: post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Engagement Events ────────────────────────────────────────────────────────

router.get(`${BASE}/engagements`, async (req: Request, res: Response) => {
  try {
    const { platform, status, min_intent, page = '1', limit = '25' } = req.query;
    const where: any = {};
    if (platform) where.platform = platform;
    if (status) where.status = status;
    if (min_intent) where.intent_score = { [Op.gte]: Number(min_intent) };
    const offset = (Number(page) - 1) * Number(limit);
    const { rows, count } = await EngagementEvent.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset,
    });
    res.json({ engagements: rows, total: count, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/engagements`, async (req: Request, res: Response) => {
  try {
    const { platform, engagement_type, user_name, user_title, user_company, content, source_url, response_id, authority_content_id } = req.body;
    if (!platform || !engagement_type) return res.status(400).json({ error: 'platform and engagement_type are required' });

    const event = await EngagementEvent.create({
      platform,
      engagement_type,
      user_name: user_name || null,
      user_title: user_title || null,
      user_company: user_company || null,
      content: content || null,
      source_url: source_url || null,
      response_id: response_id || null,
      authority_content_id: authority_content_id || null,
      intent_score: 0.5,
      role_seniority: detectSeniorityFromTitle(user_title),
      company_detected: user_company || null,
      status: 'new',
    });

    res.json({ success: true, engagement: event });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put(`${BASE}/engagements/:id`, async (req: Request, res: Response) => {
  try {
    const event = await EngagementEvent.findByPk(req.params.id as string);
    if (!event) return res.status(404).json({ error: 'Not found' });
    const allowed = ['status', 'user_company', 'company_detected', 'role_seniority', 'intent_score'];
    const updates: any = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await event.update(updates);
    res.json({ success: true, engagement: event });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Response Queue ───────────────────────────────────────────────────────────

router.get(`${BASE}/response-queue`, async (req: Request, res: Response) => {
  try {
    const { status, platform, page = '1', limit = '25' } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (platform) where.platform = platform;
    const offset = (Number(page) - 1) * Number(limit);
    const { rows, count } = await ResponseQueue.findAndCountAll({
      where,
      include: [{ model: EngagementEvent, as: 'engagement' }],
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset,
    });
    res.json({ responses: rows, total: count, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/response-queue/:id/approve`, async (req: Request, res: Response) => {
  try {
    const item = await ResponseQueue.findByPk(req.params.id as string);
    if (!item) return res.status(404).json({ error: 'Not found' });
    await item.update({ status: 'approved', updated_at: new Date() });
    res.json({ success: true, response: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/response-queue/:id/reject`, async (req: Request, res: Response) => {
  try {
    const item = await ResponseQueue.findByPk(req.params.id as string);
    if (!item) return res.status(404).json({ error: 'Not found' });
    await item.update({ status: 'rejected', updated_at: new Date() });
    res.json({ success: true, response: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/response-queue/:id/mark-posted`, async (req: Request, res: Response) => {
  try {
    const { post_url } = req.body;
    const item = await ResponseQueue.findByPk(req.params.id as string);
    if (!item) return res.status(404).json({ error: 'Not found' });
    await item.update({ status: 'posted', post_url: post_url || null, posted_at: new Date(), updated_at: new Date() });
    res.json({ success: true, response: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── LinkedIn Actions ─────────────────────────────────────────────────────────

router.get(`${BASE}/linkedin-actions`, async (req: Request, res: Response) => {
  try {
    const { status, action_type, page = '1', limit = '25' } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (action_type) where.action_type = action_type;
    const offset = (Number(page) - 1) * Number(limit);
    const { rows, count } = await LinkedInActionQueue.findAndCountAll({
      where,
      order: [['priority', 'DESC'], ['created_at', 'DESC']],
      limit: Number(limit),
      offset,
    });
    res.json({ actions: rows, total: count, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/linkedin-actions/:id/complete`, async (req: Request, res: Response) => {
  try {
    const item = await LinkedInActionQueue.findByPk(req.params.id as string);
    if (!item) return res.status(404).json({ error: 'Not found' });
    await item.update({ status: 'completed', completed_at: new Date(), updated_at: new Date() });
    res.json({ success: true, action: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/linkedin-actions/:id/skip`, async (req: Request, res: Response) => {
  try {
    const item = await LinkedInActionQueue.findByPk(req.params.id as string);
    if (!item) return res.status(404).json({ error: 'Not found' });
    await item.update({ status: 'skipped', updated_at: new Date() });
    res.json({ success: true, action: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Revenue Pipeline & Conversation Tracking (Phase 2)
// ══════════════════════════════════════════════════════════════════════════════

// ── Conversations ────────────────────────────────────────────────────────────

router.get(`${BASE}/conversations`, async (req: Request, res: Response) => {
  try {
    const { stage, priority_tier, status, platform, page = '1', limit = '25' } = req.query;
    const where: any = {};
    if (stage) where.current_stage = Number(stage);
    if (priority_tier) where.priority_tier = priority_tier;
    if (status) where.status = status;
    if (platform) where.platform = platform;
    const offset = (Number(page) - 1) * Number(limit);

    const { rows, count } = await OpenclawConversation.findAndCountAll({
      where,
      order: [['last_activity_at', 'DESC']],
      limit: Number(limit),
      offset,
      include: [
        { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'interest_level', 'lead_score', 'pipeline_stage'] as any, required: false },
        { model: OpenclawSignal, as: 'firstSignal', attributes: ['id', 'title', 'source_url', 'platform'] as any, required: false },
      ],
    });

    res.json({ conversations: rows, total: count, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(`${BASE}/conversations/:id`, async (req: Request, res: Response) => {
  try {
    const conversation = await OpenclawConversation.findByPk(req.params.id as string, {
      include: [
        { model: Lead, as: 'lead', required: false },
        { model: OpenclawSignal, as: 'firstSignal', required: false },
        { model: OpenclawResponse, as: 'firstResponse', required: false },
        { model: EngagementEvent, as: 'engagementEvents', order: [['created_at', 'ASC']] },
      ],
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put(`${BASE}/conversations/:id/stage`, async (req: Request, res: Response) => {
  try {
    const { stage } = req.body;
    if (!stage || stage < 1 || stage > 8) return res.status(400).json({ error: 'stage must be 1-8' });

    const conversation = await OpenclawConversation.findByPk(req.params.id as string);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const stageHistory = conversation.stage_history || [];
    stageHistory.push({
      stage,
      timestamp: new Date().toISOString(),
      trigger: 'admin_manual_override',
    });

    const updates: any = {
      current_stage: stage,
      stage_history: stageHistory,
      updated_at: new Date(),
    };

    // Terminal stages update status
    if (stage === 8) {
      updates.status = req.body.outcome === 'won' ? 'converted' : 'lost';
    } else if (stage === 7) {
      updates.status = 'active';
    }

    await conversation.update(updates);
    res.json({ success: true, conversation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pipeline ─────────────────────────────────────────────────────────────────

router.get(`${BASE}/pipeline`, async (_req: Request, res: Response) => {
  try {
    const funnel: Record<string, number> = {};
    for (let stage = 1; stage <= 8; stage++) {
      funnel[`stage_${stage}`] = await OpenclawConversation.count({ where: { current_stage: stage } });
    }

    const priorityBreakdown = {
      hot: await OpenclawConversation.count({ where: { priority_tier: 'hot' } }),
      warm: await OpenclawConversation.count({ where: { priority_tier: 'warm' } }),
      cold: await OpenclawConversation.count({ where: { priority_tier: 'cold' } }),
    };

    const totalConversations = await OpenclawConversation.count();
    const stage6Plus = await OpenclawConversation.count({ where: { current_stage: { [Op.gte]: 6 } } });
    const conversionRate = totalConversations > 0 ? Number((stage6Plus / totalConversations).toFixed(4)) : 0;

    const statusBreakdown = {
      active: await OpenclawConversation.count({ where: { status: 'active' } }),
      stalled: await OpenclawConversation.count({ where: { status: 'stalled' } }),
      converted: await OpenclawConversation.count({ where: { status: 'converted' } }),
      lost: await OpenclawConversation.count({ where: { status: 'lost' } }),
      closed: await OpenclawConversation.count({ where: { status: 'closed' } }),
    };

    res.json({ funnel, priority_breakdown: priorityBreakdown, conversion_rate: conversionRate, status_breakdown: statusBreakdown, total: totalConversations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Revenue ──────────────────────────────────────────────────────────────────

router.get(`${BASE}/revenue`, async (_req: Request, res: Response) => {
  try {
    const result: Record<string, { count: number; value: number }> = {};
    for (const status of ['detected', 'validated', 'pursued', 'converted', 'dismissed']) {
      const opps = await RevenueOpportunity.findAll({
        where: { source_channel: 'openclaw', status },
        attributes: ['estimated_value'],
        raw: true,
      });
      result[status] = {
        count: opps.length,
        value: opps.reduce((sum, o: any) => sum + (Number(o.estimated_value) || 0), 0),
      };
    }

    const total = await RevenueOpportunity.count({ where: { source_channel: 'openclaw' } });
    res.json({ revenue_pipeline: result, total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Hot Leads ────────────────────────────────────────────────────────────────

router.get(`${BASE}/hot-leads`, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;

    const conversations = await OpenclawConversation.findAll({
      where: { priority_tier: 'hot', status: { [Op.in]: ['active', 'stalled'] } },
      order: [['current_stage', 'DESC'], ['last_activity_at', 'DESC']],
      limit,
      include: [
        { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'interest_level', 'lead_score', 'pipeline_stage', 'lead_temperature'] as any, required: false },
      ],
    });

    res.json({ hot_leads: conversations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper ───────────────────────────────────────────────────────────────────

function detectSeniorityFromTitle(title?: string): 'unknown' | 'ic' | 'manager' | 'director' | 'vp' | 'c_level' {
  if (!title) return 'unknown';
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cio|cfo|coo|chief|founder|co-founder)\b/.test(t)) return 'c_level';
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) return 'vp';
  if (/\b(director|head of)\b/.test(t)) return 'director';
  if (/\b(manager|lead|principal)\b/.test(t)) return 'manager';
  return 'ic';
}

// ── Phase 4: Circuit Breaker Status ─────────────────────────────────

router.get(`${BASE}/circuit-status`, async (_req: Request, res: Response) => {
  try {
    const { getAllCircuitStatus } = await import('../../services/agents/openclaw/openclawCircuitBreaker');
    const statuses = await getAllCircuitStatus();
    res.json({ circuit_statuses: statuses });
  } catch (err: any) {
    console.error('[OpenClaw] Circuit status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 4: Rate Limit Status ──────────────────────────────────────

router.get(`${BASE}/rate-limits`, async (_req: Request, res: Response) => {
  try {
    const { getAllRateCounts } = await import('../../services/agents/openclaw/openclawRateLimiter');
    const rateLimits = await getAllRateCounts();
    res.json({ rate_limits: rateLimits });
  } catch (err: any) {
    console.error('[OpenClaw] Rate limits error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 3: Daily Action Queue ─────────────────────────────────────

router.get(`${BASE}/actions/today`, async (req: Request, res: Response) => {
  try {
    const { buildDailyActionQueue } = await import('../../services/agents/openclaw/openclawActionEngineService');
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const urgency_filter = req.query.urgency as any;
    const type_filter = req.query.type as any;

    const actions = await buildDailyActionQueue({ limit, urgency_filter, type_filter });
    res.json({ actions, total: actions.length });
  } catch (err: any) {
    console.error('[OpenClaw] Action queue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Manual Scan Trigger ─────────────────────────────────────────────

router.post(`${BASE}/scan`, async (req: Request, res: Response) => {
  try {
    const { platforms } = req.body || {};
    const { runOpenclawMarketSignalAgent } = await import('../../services/agents/openclaw/openclawMarketSignalAgent');
    const result = await runOpenclawMarketSignalAgent('manual-scan', {
      ...(platforms ? { platforms } : {}),
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[OpenClaw] Manual scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Manual Response Generation Trigger ──────────────────────────────

router.post(`${BASE}/generate-responses`, async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.body || {};
    const { runOpenclawContentResponseAgent } = await import('../../services/agents/openclaw/openclawContentResponseAgent');
    const result = await runOpenclawContentResponseAgent('manual-generate', { max_responses: limit });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[OpenClaw] Manual response generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
