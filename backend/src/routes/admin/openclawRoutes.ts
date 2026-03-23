import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import axios from 'axios';
import {
  OpenclawSignal,
  OpenclawTask,
  OpenclawSession,
  OpenclawResponse,
  OpenclawLearning,
  AiAgent,
  AiAgentActivityLog,
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
    ] = await Promise.all([
      OpenclawSignal.count({ where: { created_at: { [Op.gte]: last24h } } }),
      OpenclawSignal.count(),
      OpenclawResponse.count({ where: { post_status: 'posted' } }),
      OpenclawResponse.count({ where: { post_status: 'draft' } }),
      OpenclawSession.count({ where: { session_status: { [Op.in]: ['active', 'idle'] } } }),
      OpenclawTask.count({ where: { status: { [Op.in]: ['pending', 'assigned'] } } }),
      OpenclawLearning.count(),
    ]);

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

    res.json({
      kpis: {
        signals_24h: signalsToday,
        signals_total: signalsTotal,
        responses_posted: responsesPosted,
        responses_draft: responsesDraft,
        active_sessions: activeSessions,
        queue_depth: pendingTasks,
        learnings: learningsCount,
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
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const where: Record<string, any> = {};
    if (post_status) where.post_status = post_status;
    if (platform) where.platform = platform;

    const offset = (page - 1) * limit;
    const { rows, count } = await OpenclawResponse.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [{ model: OpenclawSignal, as: 'signal', attributes: ['title', 'source_url', 'platform', 'content_excerpt', 'details', 'relevance_score', 'engagement_score', 'author'] as any }],
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
    if (response.post_status !== 'ready_to_post' && response.post_status !== 'approved') {
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
    if (host.includes('linkedin.com')) return 'linkedin';
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

    res.json({ success: true, signal, task_id: task.id });
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

    // Create response
    const response = await OpenclawResponse.create({
      signal_id: signal.id,
      platform: 'linkedin',
      content,
      tone: 'professional',
      short_id: shortId,
      tracked_url: trackedUrl,
      utm_params: { utm_source: 'linkedin', utm_medium: 'organic_post', utm_campaign: shortId },
      post_status: 'draft',
      created_at: new Date(),
    });

    await signal.update({ response_id: response.id, updated_at: new Date() });

    res.json({ success: true, signal, response, short_id: shortId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
