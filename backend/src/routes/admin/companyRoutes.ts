/**
 * Company Layer Admin Routes
 *
 * All routes require admin auth.
 * Feature-flag guarded — returns 404 if company_layer_enabled is false.
 */
import { Router, Request, Response } from 'express';

const router = Router();

// Feature flag guard middleware
async function requireCompanyLayer(_req: Request, res: Response, next: Function) {
  const { isCompanyLayerEnabled } = await import('../../services/company/companyToCoryAdapter');
  if (!(await isCompanyLayerEnabled())) {
    return res.status(404).json({ error: 'Company layer is not enabled' });
  }
  next();
}

router.use(requireCompanyLayer);

// ─── Company ────────────────────────────────────────────────────────────────

router.get('/api/admin/company', async (_req: Request, res: Response) => {
  try {
    const { getActiveCompany } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(company);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Goals ──────────────────────────────────────────────────────────────────

router.get('/api/admin/company/goals', async (req: Request, res: Response) => {
  try {
    const { getActiveCompany, getCompanyGoals } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    const goals = await getCompanyGoals((company as any).id, (req.query.status as string) || undefined);
    res.json(goals);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/company/goals', async (req: Request, res: Response) => {
  try {
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
    const { updateGoal, logAudit, getActiveCompany } = await import('../../services/company/companyService');
    const goal = await updateGoal(req.params.id, req.body);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const company = await getActiveCompany();
    if (company) await logAudit((company as any).id, 'goal_updated', 'MANUAL', { goal_id: req.params.id, changes: req.body });
    res.json(goal);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── KPIs ───────────────────────────────────────────────────────────────────

router.get('/api/admin/company/kpis', async (_req: Request, res: Response) => {
  try {
    const { getActiveCompany, getCompanyKPIs } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(await getCompanyKPIs((company as any).id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Budgets ────────────────────────────────────────────────────────────────

router.get('/api/admin/company/budgets', async (_req: Request, res: Response) => {
  try {
    const { getActiveCompany, getCompanyBudgets } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(await getCompanyBudgets((company as any).id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Directives ─────────────────────────────────────────────────────────────

router.get('/api/admin/company/directives', async (req: Request, res: Response) => {
  try {
    const { getActiveCompany, getCompanyDirectives } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(await getCompanyDirectives((company as any).id, (req.query.status as string) || undefined));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/company/directives/:id/approve', async (req: Request, res: Response) => {
  try {
    const { updateDirectiveStatus, logAudit, getActiveCompany } = await import('../../services/company/companyService');
    const { transformDirectiveToCory } = await import('../../services/company/companyToCoryAdapter');
    const directive = await updateDirectiveStatus(req.params.id, 'approved');
    if (!directive) return res.status(404).json({ error: 'Directive not found' });
    // Transform to Cory decision
    const result = await transformDirectiveToCory(req.params.id);
    const company = await getActiveCompany();
    if (company) await logAudit((company as any).id, 'directive_approved', 'MANUAL', { directive_id: req.params.id, decision_id: result?.decisionId });
    res.json({ directive, cory_decision_id: result?.decisionId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/company/directives/:id/reject', async (req: Request, res: Response) => {
  try {
    const { updateDirectiveStatus, logAudit, getActiveCompany } = await import('../../services/company/companyService');
    const directive = await updateDirectiveStatus(req.params.id, 'rejected', req.body.reason);
    if (!directive) return res.status(404).json({ error: 'Directive not found' });
    const company = await getActiveCompany();
    if (company) await logAudit((company as any).id, 'directive_rejected', 'MANUAL', { directive_id: req.params.id, reason: req.body.reason });
    res.json(directive);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Audit ──────────────────────────────────────────────────────────────────

router.get('/api/admin/company/audit', async (_req: Request, res: Response) => {
  try {
    const { getActiveCompany, getAuditLog } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    res.json(await getAuditLog((company as any).id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Manual Cycle Trigger ───────────────────────────────────────────────────

router.post('/api/admin/company/cycle', async (_req: Request, res: Response) => {
  try {
    const { getActiveCompany } = await import('../../services/company/companyService');
    const company = await getActiveCompany();
    if (!company) return res.status(404).json({ error: 'No active company' });
    const { runCompanyStrategicCycle } = await import('../../services/company/companyStrategyAgent');
    const result = await runCompanyStrategicCycle((company as any).id);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
