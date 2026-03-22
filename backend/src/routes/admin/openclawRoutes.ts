import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
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
      include: [{ model: OpenclawSignal, as: 'signal', attributes: ['title', 'source_url', 'platform'] as any }],
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

export default router;
