/**
 * Automation Dashboard Routes
 *
 * Live activity feed, ticket management, workforce intelligence.
 * All admin-authenticated.
 */
import { Router, Request, Response } from 'express';

const router = Router();

// ─── Live Activity Feed ─────────────────────────────────────────────────────

router.get('/api/admin/automation/feed', async (req: Request, res: Response) => {
  try {
    const { sequelize: seq } = await import('../../config/database');
    const limit = Math.min(parseInt((req.query.limit as string) || '50'), 100);

    // Recent ticket activities across all tickets
    const [activities] = await seq.query(`
      SELECT ta.id, ta.ticket_id, ta.actor_type, ta.actor_id, ta.action,
             ta.from_value, ta.to_value, ta.comment, ta.metadata, ta.created_at,
             t.title as ticket_title, t.type as ticket_type, t.priority as ticket_priority,
             t.company_id, t.directive_id
      FROM ticket_activities ta
      JOIN tickets t ON t.id = ta.ticket_id
      ORDER BY ta.created_at DESC
      LIMIT ${limit}
    `);

    res.json({ activities, count: (activities as any[]).length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Ticket Table (filtered) ────────────────────────────────────────────────

router.get('/api/admin/automation/tickets', async (req: Request, res: Response) => {
  try {
    const { Ticket } = await import('../../models');
    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.type) where.type = req.query.type;
    if (req.query.source) where.source = req.query.source;
    if (req.query.company_id) where.company_id = req.query.company_id;

    const tickets = await (Ticket as any).findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 100,
    });

    // Stats
    const { sequelize: seq } = await import('../../config/database');
    const [stats] = await seq.query(`
      SELECT status, COUNT(*) as count FROM tickets GROUP BY status
    `);

    res.json({ tickets, stats });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Ticket Drilldown ───────────────────────────────────────────────────────

router.get('/api/admin/automation/tickets/:id', async (req: Request, res: Response) => {
  try {
    const { Ticket, TicketActivity } = await import('../../models');
    const ticket = await (Ticket as any).findByPk(req.params.id as string);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const activities = await (TicketActivity as any).findAll({
      where: { ticket_id: req.params.id as string },
      order: [['created_at', 'ASC']],
    });

    // Sub-tickets
    const subTickets = await (Ticket as any).findAll({
      where: { parent_ticket_id: req.params.id as string },
      order: [['created_at', 'ASC']],
    });

    res.json({ ticket, activities, subTickets });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Workforce Intelligence ─────────────────────────────────────────────────

router.post('/api/admin/automation/workforce/analyze', async (_req: Request, res: Response) => {
  try {
    const { getActiveCompany } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    const companyId = company ? (company as any).id : null;

    const { runWorkforceAnalysis } = await import('../../services/company/workforceIntelligenceEngine');
    const report = await runWorkforceAnalysis(companyId || 'default');
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/automation/workforce/status', async (_req: Request, res: Response) => {
  try {
    const { sequelize: seq } = await import('../../config/database');

    const [summary] = await seq.query(`
      SELECT
        COUNT(*) as total_agents,
        COUNT(*) FILTER (WHERE status = 'active' AND error_count < 5) as healthy,
        COUNT(*) FILTER (WHERE error_count >= 5) as errored,
        COUNT(*) FILTER (WHERE last_run_at < NOW() - INTERVAL '24 hours' OR last_run_at IS NULL) as idle
      FROM ai_agents WHERE run_count > 0
    `);

    const [recentRuns] = await seq.query(`
      SELECT agent_id, a.agent_name, l.action, l.result, l.duration_ms, l.created_at
      FROM ai_agent_activity_logs l
      LEFT JOIN ai_agents a ON a.id = l.agent_id
      ORDER BY l.created_at DESC LIMIT 20
    `);

    res.json({ summary: (summary as any[])[0] || {}, recentRuns });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── System-Wide Stats ──────────────────────────────────────────────────────

router.get('/api/admin/automation/stats', async (_req: Request, res: Response) => {
  try {
    const { sequelize: seq } = await import('../../config/database');

    const [ticketStats] = await seq.query(`
      SELECT
        COUNT(*) as total_tickets,
        COUNT(*) FILTER (WHERE status = 'in_progress') as active,
        COUNT(*) FILTER (WHERE status = 'done') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as created_24h,
        COUNT(*) FILTER (WHERE completed_at > NOW() - INTERVAL '24 hours') as completed_24h
      FROM tickets
    `);

    const [agentStats] = await seq.query(`
      SELECT
        COUNT(*) as total_agents,
        SUM(run_count) as total_runs,
        SUM(error_count) as total_errors
      FROM ai_agents WHERE run_count > 0
    `);

    const [directiveStats] = await seq.query(`
      SELECT status, COUNT(*) as count
      FROM company_directives
      GROUP BY status
    `).catch(() => [[]]);

    res.json({
      tickets: (ticketStats as any[])[0] || {},
      agents: (agentStats as any[])[0] || {},
      directives: directiveStats,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
