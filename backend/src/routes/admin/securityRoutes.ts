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

// ─── GDPR Data Subject Rights ────────────────────────────────────────────────

// GET /api/admin/security/data-subject/:email — export all PII for a data subject
router.get('/api/admin/security/data-subject/:email', requireAdmin, async (req: Request, res: Response) => {
  try {
    const email = (req.params.email as string).toLowerCase().trim();
    if (!email) { res.status(400).json({ error: 'Email is required' }); return; }

    const { Lead, Enrollment, Activity, AdminUser, ChatConversation } = await import('../../models');

    // Collect all data associated with this email
    const [leads, enrollments, adminUsers] = await Promise.all([
      Lead.findAll({ where: { email }, raw: true }),
      Enrollment.findAll({ where: { email }, raw: true }),
      AdminUser.findAll({ where: { email }, attributes: ['id', 'email', 'role', 'created_at'], raw: true }),
    ]);

    const leadIds = (leads as any[]).map((l: any) => l.id).filter(Boolean);

    const [activities, conversations] = await Promise.all([
      leadIds.length > 0
        ? Activity.findAll({ where: { lead_id: { [Op.in]: leadIds } }, raw: true })
        : Promise.resolve([]),
      leadIds.length > 0
        ? ChatConversation.findAll({ where: { lead_id: { [Op.in]: leadIds } }, raw: true })
        : Promise.resolve([]),
    ]);

    res.json({
      subject_email: email,
      exported_at: new Date().toISOString(),
      data: {
        leads,
        enrollments,
        admin_accounts: adminUsers,
        activities,
        conversations,
      },
      record_counts: {
        leads: (leads as any[]).length,
        enrollments: (enrollments as any[]).length,
        admin_accounts: (adminUsers as any[]).length,
        activities: (activities as any[]).length,
        conversations: (conversations as any[]).length,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/security/data-subject/:email — erase PII for a data subject (right to erasure)
router.delete('/api/admin/security/data-subject/:email', requireAdmin, async (req: Request, res: Response) => {
  try {
    const email = (req.params.email as string).toLowerCase().trim();
    if (!email) { res.status(400).json({ error: 'Email is required' }); return; }

    const { Lead, Enrollment, Activity } = await import('../../models');

    // Anonymize leads (don't delete — preserve referential integrity)
    const leads = await Lead.findAll({ where: { email } });
    const leadIds = (leads as any[]).map((l: any) => l.id).filter(Boolean);
    let leadsAnonymized = 0;
    for (const lead of leads) {
      await lead.update({
        name: '[REDACTED]',
        email: `redacted_${(lead as any).id}@deleted.local`,
        phone: null,
        company: '[REDACTED]',
        title: null,
        linkedin_url: null,
      } as any);
      leadsAnonymized++;
    }

    // Anonymize enrollments
    const enrollments = await Enrollment.findAll({ where: { email } });
    let enrollmentsAnonymized = 0;
    for (const enrollment of enrollments) {
      await enrollment.update({
        full_name: '[REDACTED]',
        email: `redacted_${(enrollment as any).id}@deleted.local`,
        phone: null,
        company: '[REDACTED]',
        title: null,
        intake_data_json: {},
      } as any);
      enrollmentsAnonymized++;
    }

    // Delete activities for those leads
    let activitiesDeleted = 0;
    if (leadIds.length > 0) {
      activitiesDeleted = await Activity.destroy({ where: { lead_id: { [Op.in]: leadIds } } });
    }

    console.log(`[Security] GDPR erasure for ${email}: ${leadsAnonymized} leads, ${enrollmentsAnonymized} enrollments, ${activitiesDeleted} activities`);

    res.json({
      message: 'Data subject erasure completed',
      subject_email: email,
      erased_at: new Date().toISOString(),
      actions: {
        leads_anonymized: leadsAnonymized,
        enrollments_anonymized: enrollmentsAnonymized,
        activities_deleted: activitiesDeleted,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
