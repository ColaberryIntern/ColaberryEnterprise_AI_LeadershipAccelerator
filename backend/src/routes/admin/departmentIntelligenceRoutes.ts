import { Router, Request, Response } from 'express';
import {
  getDepartments,
  getDepartmentDetail,
  getInitiatives,
  getInitiativeDetail,
  getRoadmap,
  getDepartmentTimeline,
  getInnovationScores,
  getRevenueImpact,
} from '../../services/departmentIntelligenceService';
import { chatWithDeptHead, evaluateIdea, getDeptHeadInfo } from '../../services/deptHeadService';
import {
  getStrategySummary,
  getCrossDepartmentInitiatives,
} from '../../services/departmentInitiativeEngine';
import { runStrategyArchitectAgent } from '../../services/agents/strategy/strategyArchitectAgent';
import { STRATEGY_CONFIGS } from '../../services/agents/strategy/departmentStrategyConfigs';
import { AiAgent } from '../../models';

const router = Router();

// List all departments with scores
router.get('/api/admin/intelligence/departments', async (_req: Request, res: Response) => {
  try {
    const departments = await getDepartments();
    res.json({ departments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Department detail (all 7 sections)
router.get('/api/admin/intelligence/departments/:id', async (req: Request, res: Response) => {
  try {
    const detail = await getDepartmentDetail(req.params.id as string);
    if (!detail) return res.status(404).json({ error: 'Department not found' });
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// All initiatives (filterable)
router.get('/api/admin/intelligence/initiatives', async (req: Request, res: Response) => {
  try {
    const initiatives = await getInitiatives({
      department_id: req.query.department_id as string,
      status: req.query.status as string,
      priority: req.query.priority as string,
    });
    res.json({ initiatives });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Initiative detail
router.get('/api/admin/intelligence/initiatives/:id', async (req: Request, res: Response) => {
  try {
    const initiative = await getInitiativeDetail(req.params.id as string);
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    res.json(initiative);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Roadmap data (all depts, quarter-based)
router.get('/api/admin/intelligence/roadmap', async (_req: Request, res: Response) => {
  try {
    const roadmap = await getRoadmap();
    res.json({ roadmap });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cross-department event feed
router.get('/api/admin/intelligence/department-timeline', async (req: Request, res: Response) => {
  try {
    const events = await getDepartmentTimeline({
      department_id: req.query.department_id as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Innovation scores by department
router.get('/api/admin/intelligence/innovation-scores', async (_req: Request, res: Response) => {
  try {
    const scores = await getInnovationScores();
    res.json({ scores });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revenue impact by dept/initiative
router.get('/api/admin/intelligence/revenue-impact', async (req: Request, res: Response) => {
  try {
    const impact = await getRevenueImpact({
      department_id: req.query.department_id as string,
    });
    res.json(impact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Department Head AI Chat ────────────────────────────────────────────────

// GET /api/admin/intelligence/departments/:slug/head — Get dept head info
router.get('/api/admin/intelligence/departments/:slug/head', async (req: Request, res: Response) => {
  try {
    const info = getDeptHeadInfo(req.params.slug as string);
    if (!info) return res.status(404).json({ error: 'Department head not found' });
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/departments/:slug/chat — Chat with dept head
router.post('/api/admin/intelligence/departments/:slug/chat', async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const result = await chatWithDeptHead(
      req.params.slug as string,
      message,
      history || [],
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/departments/:slug/evaluate-idea — Evaluate an idea
router.post('/api/admin/intelligence/departments/:slug/evaluate-idea', async (req: Request, res: Response) => {
  try {
    const { idea } = req.body;
    if (!idea) return res.status(400).json({ error: 'idea is required' });
    const evaluation = await evaluateIdea(req.params.slug as string, idea);
    res.json(evaluation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Department Strategy Endpoints ──────────────────────────────────────────

// GET /api/admin/intelligence/strategy-summary — Aggregate strategy stats
router.get('/api/admin/intelligence/strategy-summary', async (_req: Request, res: Response) => {
  try {
    const summary = await getStrategySummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/intelligence/cross-dept-initiatives — Cross-department initiatives
router.get('/api/admin/intelligence/cross-dept-initiatives', async (_req: Request, res: Response) => {
  try {
    const initiatives = await getCrossDepartmentInitiatives();
    res.json({ initiatives });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/intelligence/strategy-agents — All 16 Strategy Architect agent statuses
router.get('/api/admin/intelligence/strategy-agents', async (_req: Request, res: Response) => {
  try {
    const agents = await AiAgent.findAll({
      where: { category: 'dept_strategy' },
      order: [['agent_name', 'ASC']],
      attributes: [
        'id', 'agent_name', 'status', 'enabled', 'run_count', 'error_count',
        'last_run_at', 'avg_duration_ms', 'last_result', 'config',
      ],
    });
    res.json({ agents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/departments/:slug/run-strategy — Manual trigger
router.post('/api/admin/intelligence/departments/:slug/run-strategy', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const config = STRATEGY_CONFIGS[slug];
    if (!config) return res.status(404).json({ error: `No strategy config for department: ${slug}` });

    const result = await runStrategyArchitectAgent('manual', {
      department_slug: slug,
      agent_name: `StrategyArchitect_${slug}_manual`,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
