// ─── Cory Routes ─────────────────────────────────────────────────────────────
// REST endpoints for AI COO "Cory" — command interface, status, narrative,
// timeline, departments, and agent management.

import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { executeCoryCommand, getCoryStatus, getCoryNarrative } from '../../intelligence/strategy/coryEngine';
import { getReasoningTimeline } from '../../intelligence/strategy/reasoningTimeline';
import { createAgent, retireAgent, getDepartmentSummary, editAgent } from '../../intelligence/agents/agentFactory';
import { AiAgent } from '../../models';
import { getDepartmentForCategory, type Department } from '../../intelligence/agents/agentFactory';
import { getCOODashboardData, proposeNewAgent, runSelfEvolution } from '../../services/cory/coryBrain';
import { getRetentionStats } from '../../services/cory/intelligenceRetention';
import IntelligenceDecision from '../../models/IntelligenceDecision';
import AgentTask from '../../models/AgentTask';
import { getRecentInitiatives, getInitiativeStats, approveInitiative, rejectInitiative } from '../../services/cory/coryInitiatives';
import AgentCreationProposal from '../../models/AgentCreationProposal';
import StrategicInitiative from '../../models/StrategicInitiative';
import { activatePendingAgent } from '../../intelligence/agents/agentFactory';

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

// ─── COO Dashboard ───────────────────────────────────────────────────────────

// GET /api/admin/intelligence/cory/coo-dashboard — Full COO dashboard data
router.get('/api/admin/intelligence/cory/coo-dashboard', async (_req: Request, res: Response) => {
  try {
    const data = await getCOODashboardData();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent Creation Proposals ────────────────────────────────────────────────

// GET /api/admin/intelligence/cory/agent-proposals — List agent creation proposals
router.get('/api/admin/intelligence/cory/agent-proposals', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string || undefined;
    const where = status ? { status } : {};
    const proposals = await AgentCreationProposal.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json({ proposals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/cory/agent-proposals/:id/approve — Approve proposal
router.post('/api/admin/intelligence/cory/agent-proposals/:id/approve', async (req: Request, res: Response) => {
  try {
    const proposal = await AgentCreationProposal.findByPk(req.params.id as string);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: `Proposal already ${proposal.status}` });

    // Create the agent
    const agent = await createAgent({
      name: proposal.agent_name,
      role: 'general',
      department: (proposal.department || 'Intelligence') as Department,
      responsibilities: proposal.purpose,
      trigger_type: (proposal.trigger_type as any) || 'cron',
      schedule: proposal.schedule || undefined,
    });

    // Activate it
    await activatePendingAgent(agent.id);

    // Update proposal status
    await proposal.update({
      status: 'approved',
      reviewed_by: (req as any).admin?.email || 'admin',
      reviewed_at: new Date(),
    });

    res.json({ success: true, agent, proposal });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/cory/agent-proposals/:id/reject — Reject proposal
router.post('/api/admin/intelligence/cory/agent-proposals/:id/reject', async (req: Request, res: Response) => {
  try {
    const proposal = await AgentCreationProposal.findByPk(req.params.id as string);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: `Proposal already ${proposal.status}` });

    await proposal.update({
      status: 'rejected',
      reviewed_by: (req as any).admin?.email || 'admin',
      reviewed_at: new Date(),
    });

    res.json({ success: true, proposal });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Strategic Initiatives ──────────────────────────────────────────────────

// GET /api/admin/intelligence/cory/initiatives — List strategic initiatives
router.get('/api/admin/intelligence/cory/initiatives', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const initiatives = await getRecentInitiatives(limit);
    const stats = await getInitiativeStats();
    res.json({ initiatives, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/intelligence/cory/initiatives/:id — Get initiative detail
router.get('/api/admin/intelligence/cory/initiatives/:id', async (req: Request, res: Response) => {
  try {
    const initiative = await StrategicInitiative.findByPk(req.params.id as string);
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    res.json({ initiative });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/cory/initiatives/:id/approve — Approve initiative
router.post('/api/admin/intelligence/cory/initiatives/:id/approve', async (req: Request, res: Response) => {
  try {
    const reviewedBy = (req as any).admin?.email || 'admin';
    const initiative = await approveInitiative(req.params.id as string, reviewedBy);
    res.json({ success: true, initiative });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/cory/initiatives/:id/reject — Reject initiative
router.post('/api/admin/intelligence/cory/initiatives/:id/reject', async (req: Request, res: Response) => {
  try {
    const reviewedBy = (req as any).admin?.email || 'admin';
    const reason = req.body.reason;
    const initiative = await rejectInitiative(req.params.id as string, reviewedBy, reason);
    res.json({ success: true, initiative });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/intelligence/cory/evolution/run — Trigger self-evolution cycle
router.post('/api/admin/intelligence/cory/evolution/run', async (_req: Request, res: Response) => {
  try {
    const result = await runSelfEvolution();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── System Health ──────────────────────────────────────────────────────────

// GET /api/admin/intelligence/cory/system-health — Cory observability data
router.get('/api/admin/intelligence/cory/system-health', async (_req: Request, res: Response) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Run queries in parallel
    const [
      agentFleet,
      insightsLastHour,
      tasksToday,
      initiativeStats,
      retention,
    ] = await Promise.all([
      // Agent fleet status
      AiAgent.findAll({ attributes: ['status', 'enabled'] }).then(agents => {
        const total = agents.length;
        const healthy = agents.filter((a: any) => a.enabled && (a.status === 'idle' || a.status === 'running')).length;
        const errored = agents.filter((a: any) => a.status === 'error').length;
        const paused = agents.filter((a: any) => a.status === 'paused' || !a.enabled).length;
        return { total, healthy, errored, paused };
      }),
      // Insights generated in last hour
      IntelligenceDecision.count({ where: { timestamp: { [Op.gte]: oneHourAgo } } }),
      // Tasks created today
      AgentTask.count({ where: { created_at: { [Op.gte]: oneDayAgo } } }),
      // Initiative stats
      getInitiativeStats(),
      // Retention stats
      getRetentionStats().catch(() => null),
    ]);

    res.json({
      agent_fleet: agentFleet,
      insights_last_hour: insightsLastHour,
      tasks_today: tasksToday,
      initiatives: initiativeStats,
      retention,
      checked_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
