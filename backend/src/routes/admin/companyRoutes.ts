/**
 * Company Layer Admin Routes
 *
 * All routes require admin auth.
 * Feature-flag guarded — returns 404 if company_layer_enabled is false.
 */
import { Router, Request, Response } from 'express';

const router = Router();

// Feature flag guard — called per-route to avoid middleware leaking
async function checkCompanyEnabled(res: Response): Promise<boolean> {
  try {
    const { isCompanyLayerEnabled } = await import('../../services/company/companyToCoryAdapter');
    if (!(await isCompanyLayerEnabled())) {
      res.status(404).json({ error: 'Company layer is not enabled' });
      return false;
    }
    return true;
  } catch {
    res.status(404).json({ error: 'Company layer not available' });
    return false;
  }
}

// ─── Company ────────────────────────────────────────────────────────────────

router.get('/api/admin/company', async (_req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(company);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Goals ──────────────────────────────────────────────────────────────────

router.get('/api/admin/company/goals', async (req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany, getCompanyGoals } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    const goals = await getCompanyGoals((company as any).id, (req.query.status as string) || undefined);
    res.json(goals);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/company/goals', async (req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany, createGoal, logAudit } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    const goal = await createGoal({ ...req.body, company_id: (company as any).id });
    await logAudit((company as any).id, 'goal_created', 'MANUAL', { goal_id: (goal as any).id, goal_name: req.body.goal_name });
    res.json(goal);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/admin/company/goals/:id', async (req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { updateGoal, logAudit, getActiveCompany } = await import('../../services/company/companyService');
    const goal = await updateGoal(req.params.id as string, req.body);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const company = await getActiveCompany();
    if (company) await logAudit((company as any).id, 'goal_updated', 'MANUAL', { goal_id: req.params.id as string, changes: req.body });
    res.json(goal);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── KPIs ───────────────────────────────────────────────────────────────────

router.get('/api/admin/company/kpis', async (_req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany, getCompanyKPIs } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(await getCompanyKPIs((company as any).id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Budgets ────────────────────────────────────────────────────────────────

router.get('/api/admin/company/budgets', async (_req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany, getCompanyBudgets } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(await getCompanyBudgets((company as any).id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Directives ─────────────────────────────────────────────────────────────

router.get('/api/admin/company/directives', async (req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany, getCompanyDirectives } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(await getCompanyDirectives((company as any).id, (req.query.status as string) || undefined));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/company/directives/:id/approve', async (req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { updateDirectiveStatus, logAudit, getActiveCompany } = await import('../../services/company/companyService');
    const { transformDirectiveToCory } = await import('../../services/company/companyToCoryAdapter');
    const directive = await updateDirectiveStatus(req.params.id as string, 'approved');
    if (!directive) return res.status(404).json({ error: 'Directive not found' });
    // Transform to Cory decision
    const result = await transformDirectiveToCory(req.params.id as string);
    const company = await getActiveCompany();
    if (company) await logAudit((company as any).id, 'directive_approved', 'MANUAL', { directive_id: req.params.id as string, decision_id: result?.decisionId });
    res.json({ directive, cory_decision_id: result?.decisionId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/company/directives/:id/reject', async (req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { updateDirectiveStatus, logAudit, getActiveCompany } = await import('../../services/company/companyService');
    const directive = await updateDirectiveStatus(req.params.id as string, 'rejected', (req.body.reason as string));
    if (!directive) return res.status(404).json({ error: 'Directive not found' });
    const company = await getActiveCompany();
    if (company) await logAudit((company as any).id, 'directive_rejected', 'MANUAL', { directive_id: req.params.id as string, reason: (req.body.reason as string) });
    res.json(directive);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Audit ──────────────────────────────────────────────────────────────────

router.get('/api/admin/company/audit', async (_req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany, getAuditLog } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(await getAuditLog((company as any).id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Manual Cycle Trigger ───────────────────────────────────────────────────

router.post('/api/admin/company/cycle', async (_req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    const { runCompanyStrategicCycle } = await import('../../services/company/companyStrategyAgent');
    const result = await runCompanyStrategicCycle((company as any).id);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Toggle (NO feature-flag gate — this IS the toggle) ───────────────────

router.get('/api/admin/company/status', async (_req: Request, res: Response) => {
  try {
    const { isCompanyLayerEnabled } = await import('../../services/company/companyToCoryAdapter');
    const { getActiveCompany, getCompanyGoals, getCompanyDirectives } = await import('../../services/company/companyService');
    const enabled = await isCompanyLayerEnabled();
    const company = enabled ? await getActiveCompany() : null;
    let summary = { goals: 0, directives: 0, agents: 0, tickets: 0 };
    if (company) {
      const { AiAgent, Ticket } = await import('../../models');
      const goals = await getCompanyGoals((company as any).id, 'active');
      const directives = await getCompanyDirectives((company as any).id, 'proposed');
      const agentCount = await AiAgent.count({ where: { status: 'active' } });
      const ticketCount = await Ticket.count({ where: { company_id: (company as any).id } });
      summary = { goals: goals.length, directives: directives.length, agents: agentCount, tickets: ticketCount };
    }
    res.json({ enabled, company, summary });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/company/toggle', async (_req: Request, res: Response) => {
  try {
    const { SystemSetting } = await import('../../models');
    const setting = await SystemSetting.findOne({ where: { key: 'company_layer_enabled' } });
    const currentValue = setting ? String(setting.getDataValue('value')) === 'true' : false;
    const newValue = !currentValue;
    if (setting) {
      await setting.update({ value: String(newValue) });
    } else {
      await SystemSetting.create({ key: 'company_layer_enabled', value: String(newValue) } as any);
    }
    // Seed default company if enabling for the first time
    if (newValue) {
      try {
        const { seedDefaultCompany } = await import('../../services/company/companySeedService');
        await seedDefaultCompany();
      } catch { /* seed may fail if already exists */ }
    }
    const { getActiveCompany } = await import('../../services/company/companyService');
    const company = newValue ? await getActiveCompany() : null;
    res.json({ enabled: newValue, company });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Workforce ────────────────────────────────────────────────────────────

router.get('/api/admin/company/workforce', async (_req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    const { runWorkforceAnalysis } = await import('../../services/company/workforceIntelligenceEngine');
    const report = await runWorkforceAnalysis((company as any).id);
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Tickets ──────────────────────────────────────────────────────────────

router.get('/api/admin/company/tickets', async (_req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { getActiveCompany } = await import('../../services/company/companyService');
    const { Ticket } = await import('../../models');
    const { Op } = await import('sequelize');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    const tickets = await Ticket.findAll({
      where: { company_id: (company as any).id, status: { [Op.notIn]: ['cancelled'] } },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json(tickets);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Departments ──────────────────────────────────────────────────────────

router.get('/api/admin/company/departments', async (_req: Request, res: Response) => {
  try {
    if (!(await checkCompanyEnabled(res))) return;
    const { Department } = await import('../../models');
    const departments = await Department.findAll({ order: [['name', 'ASC']] });
    res.json(departments);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
