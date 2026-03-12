import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { Department, DepartmentEvent, AiAgent, Ticket } from '../../models';
import {
  runSecurityDirector,
  runSecretDetection,
  runCodeSecurityAudit,
  runDependencySecurity,
  runRuntimeThreatMonitor,
  runAccessControlGuardian,
  runAiSafetyMonitor,
  runAgentBehaviorMonitor,
} from '../../services/aiOrchestrator';

const router = Router();

// GET /api/admin/security/dashboard
router.get('/api/admin/security/dashboard', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (!securityDept) {
      return res.json({ threats: 0, open_tickets: 0, scans_today: 0, fleet_health: 100, agents: [], recent_events: [] });
    }

    const deptId = (securityDept as any).id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Recent events (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEvents = await DepartmentEvent.findAll({
      where: { department_id: deptId, created_at: { [Op.gte]: oneDayAgo } },
      order: [['created_at', 'DESC']],
      limit: 50,
      raw: true,
    });

    const threatCount = recentEvents.filter((e: any) => e.event_type === 'threat_detected').length;
    const scansToday = await DepartmentEvent.count({
      where: { department_id: deptId, created_at: { [Op.gte]: todayStart } },
    });

    // Open security tickets
    const openTickets = await Ticket.count({
      where: { source: 'security', status: { [Op.notIn]: ['done', 'cancelled', 'closed'] } },
    });

    const criticalTickets = await Ticket.count({
      where: { source: 'security', priority: 'critical', status: { [Op.notIn]: ['done', 'cancelled', 'closed'] } },
    });

    // Agent fleet
    const agents = await AiAgent.findAll({
      where: { category: 'security_ops' },
      order: [['agent_name', 'ASC']],
      raw: true,
    });

    const healthyCount = (agents as any[]).filter((a: any) => a.enabled && a.status !== 'error').length;
    const fleetHealth = agents.length > 0 ? Math.round((healthyCount / agents.length) * 100) : 100;

    res.json({
      threats: threatCount,
      open_tickets: openTickets,
      critical_tickets: criticalTickets,
      scans_today: scansToday,
      fleet_health: fleetHealth,
      agents,
      recent_events: recentEvents,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/security/events
router.get('/api/admin/security/events', requireAdmin, async (req: Request, res: Response) => {
  try {
    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (!securityDept) return res.json({ events: [], total: 0 });

    const deptId = (securityDept as any).id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const eventType = req.query.event_type as string | undefined;
    const severity = req.query.severity as string | undefined;

    const where: any = { department_id: deptId };
    if (eventType) where.event_type = eventType;
    if (severity) where.severity = severity;

    const { rows: events, count: total } = await DepartmentEvent.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({ events, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/security/agents
router.get('/api/admin/security/agents', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const agents = await AiAgent.findAll({
      where: { category: 'security_ops' },
      order: [['agent_name', 'ASC']],
    });
    res.json({ agents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/security/scan — manual trigger
router.post('/api/admin/security/scan', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const runners = [
      runSecretDetection,
      runCodeSecurityAudit,
      runDependencySecurity,
      runRuntimeThreatMonitor,
      runAccessControlGuardian,
      runAiSafetyMonitor,
      runAgentBehaviorMonitor,
      runSecurityDirector,
    ];

    const results = [];
    for (const runner of runners) {
      try {
        const result = await runner();
        results.push(result);
      } catch (err: any) {
        results.push({ error: err.message });
      }
    }

    res.json({ message: 'Security scan complete', results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
