// ─── Cory Routes ─────────────────────────────────────────────────────────────
// REST endpoints for AI COO "Cory" — command interface, status, narrative,
// timeline, departments, and agent management.

import { Router, Request, Response } from 'express';
import { executeCoryCommand, getCoryStatus, getCoryNarrative } from '../../intelligence/strategy/coryEngine';
import { getReasoningTimeline } from '../../intelligence/strategy/reasoningTimeline';
import { createAgent, retireAgent, getDepartmentSummary, editAgent } from '../../intelligence/agents/agentFactory';
import { AiAgent } from '../../models';
import { getDepartmentForCategory, type Department } from '../../intelligence/agents/agentFactory';

// Convert department_slug (e.g. 'finance') to Department name (e.g. 'Finance')
const SLUG_TO_DEPT: Record<string, Department> = {
  executive: 'Executive', strategy: 'Strategy', marketing: 'Marketing',
  admissions: 'Admissions', alumni: 'Alumni', partnerships: 'Partnerships',
  education: 'Education', student_success: 'Student_Success', platform: 'Platform',
  intelligence: 'Intelligence', governance: 'Governance', reporting: 'Reporting',
  finance: 'Finance', operations: 'Operations', orchestration: 'Orchestration',
  growth: 'Growth', infrastructure: 'Infrastructure', security: 'Security',
};
function slugToDept(slug?: string): Department | undefined {
  return slug ? SLUG_TO_DEPT[slug.toLowerCase()] : undefined;
}

const router = Router();

// POST /api/admin/intelligence/cory/command — Execute a command through Cory
router.post('/api/admin/intelligence/cory/command', async (req: Request, res: Response) => {
  try {
    const { command, context } = req.body;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command string is required' });
    }
    const result = await executeCoryCommand({ command, context });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/intelligence/cory/status — Cory's overall status dashboard
router.get('/api/admin/intelligence/cory/status', async (_req: Request, res: Response) => {
  try {
    const status = await getCoryStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/intelligence/cory/narrative — Recent executive briefings
router.get('/api/admin/intelligence/cory/narrative', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const narrative = await getCoryNarrative(limit);
    res.json({ briefings: narrative });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/intelligence/cory/timeline — Reasoning timeline
router.get('/api/admin/intelligence/cory/timeline', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const timeline = await getReasoningTimeline(limit);
    res.json({ entries: timeline });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/intelligence/cory/departments — Department summary
router.get('/api/admin/intelligence/cory/departments', async (_req: Request, res: Response) => {
  try {
    const departments = await getDepartmentSummary();
    res.json({ departments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/cory/hire-agent — Hire a new agent
router.post('/api/admin/intelligence/cory/hire-agent', async (req: Request, res: Response) => {
  try {
    const { name, role, department, responsibilities, trigger_type, schedule } = req.body;
    if (!name || !department) {
      return res.status(400).json({ error: 'name and department are required' });
    }
    const agent = await createAgent({
      name,
      role: role || 'general',
      department,
      responsibilities: responsibilities || '',
      trigger_type,
      schedule,
    });
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/cory/retire-agent — Retire an agent
router.post('/api/admin/intelligence/cory/retire-agent', async (req: Request, res: Response) => {
  try {
    const { agent_id } = req.body;
    if (!agent_id) return res.status(400).json({ error: 'agent_id is required' });
    await retireAgent(agent_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/admin/intelligence/cory/agents/:id — Edit an agent
router.patch('/api/admin/intelligence/cory/agents/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const agent = await editAgent(id, req.body);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/intelligence/cory/agents — All agents with department grouping
router.get('/api/admin/intelligence/cory/agents', async (_req: Request, res: Response) => {
  try {
    const agents = await AiAgent.findAll({ order: [['agent_name', 'ASC']] });
    const grouped = agents.map((a: any) => ({
      id: a.id,
      agent_name: a.agent_name,
      agent_type: a.agent_type,
      status: a.status,
      enabled: a.enabled,
      category: a.category,
      department: a.config?.department || slugToDept(a.config?.department_slug) || getDepartmentForCategory(a.category || ''),
      run_count: a.run_count || 0,
      error_count: a.error_count || 0,
      avg_duration_ms: a.avg_duration_ms || 0,
      last_run_at: a.last_run_at ? a.last_run_at.toISOString() : null,
      description: a.description,
      schedule: a.schedule,
      trigger_type: a.trigger_type,
    }));
    res.json({ agents: grouped });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
