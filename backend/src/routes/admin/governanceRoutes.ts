import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetOverview,
  handleGetAgents,
  handleGetAlerts,
  handleGetConfig,
  handleUpdateAgentToggle,
  handleUpdateConfig,
} from '../../controllers/governanceController';
import {
  getCOOConfig,
  updateCOOConfig,
  getAutonomyRules,
  updateAutonomyRules,
  getSafetyLimits,
  updateSafetyLimits,
  getExperimentRegistry,
} from '../../services/governanceService';
import { getDepartmentSummary } from '../../intelligence/agents/agentFactory';
import { getReasoningTimeline } from '../../intelligence/strategy/reasoningTimeline';
import { AiAgent } from '../../models';
import { getDepartmentForCategory } from '../../intelligence/agents/agentFactory';

const router = Router();

// Existing routes
router.get('/api/admin/governance/overview', requireAdmin, handleGetOverview);
router.get('/api/admin/governance/agents', requireAdmin, handleGetAgents);
router.get('/api/admin/governance/alerts', requireAdmin, handleGetAlerts);
router.get('/api/admin/governance/config', requireAdmin, handleGetConfig);
router.patch('/api/admin/governance/agents/:id', requireAdmin, handleUpdateAgentToggle);
router.patch('/api/admin/governance/config', requireAdmin, handleUpdateConfig);

// COO Config
router.get('/api/admin/governance/coo-config', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const config = await getCOOConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/api/admin/governance/coo-config', requireAdmin, async (req: Request, res: Response) => {
  try {
    const config = await updateCOOConfig(req.body, (req as any).admin?.sub);
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Autonomy Rules
router.get('/api/admin/governance/autonomy-rules', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rules = await getAutonomyRules();
    res.json({ rules });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/admin/governance/autonomy-rules', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules array required' });
    const updated = await updateAutonomyRules(rules, (req as any).admin?.sub);
    res.json({ rules: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Safety Limits
router.get('/api/admin/governance/safety-limits', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const limits = await getSafetyLimits();
    res.json(limits);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/api/admin/governance/safety-limits', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limits = await updateSafetyLimits(req.body, (req as any).admin?.sub);
    res.json(limits);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Experiments
router.get('/api/admin/governance/experiments', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const experiments = await getExperimentRegistry();
    res.json({ experiments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Departments
router.get('/api/admin/governance/departments', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const departments = await getDepartmentSummary();
    res.json({ departments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reasoning Log
router.get('/api/admin/governance/reasoning-log', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const entries = await getReasoningTimeline(limit);
    res.json({ entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// All agents with department info
router.get('/api/admin/governance/all-agents', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const agents = await AiAgent.findAll({ order: [['agent_name', 'ASC']] });
    const result = agents.map((a: any) => ({
      id: a.id,
      agent_name: a.agent_name,
      agent_type: a.agent_type,
      status: a.status,
      enabled: a.enabled,
      category: a.category,
      department: a.config?.department || getDepartmentForCategory(a.category || ''),
      run_count: a.run_count || 0,
      error_count: a.error_count || 0,
      avg_duration_ms: a.avg_duration_ms || 0,
      last_run_at: a.last_run_at,
      description: a.description,
    }));
    res.json({ agents: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
