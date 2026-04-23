/**
 * Company Strategy Agent (CEO Agent)
 *
 * Reads company goals, KPIs, and budgets.
 * Generates structured directives for Cory to execute.
 * Deterministic rules only (no LLM for MVP).
 * Max 5 directives per cycle, 2-hour dedup window.
 */

import { Op } from 'sequelize';

interface CycleResult {
  directivesCreated: number;
  directivesSkippedDedup: number;
  goalsEvaluated: number;
  kpisEvaluated: number;
  budgetsEvaluated: number;
  durationMs: number;
}

export async function runCompanyStrategicCycle(companyId: string): Promise<CycleResult> {
  const start = Date.now();
  const { getCompanyGoals, getCompanyKPIs, getCompanyBudgets, logAudit } = await import('./companyService');
  const { default: CompanyDirective } = await import('../../models/CompanyDirective');

  const goals = await getCompanyGoals(companyId, 'active');
  const kpis = await getCompanyKPIs(companyId);
  const budgets = await getCompanyBudgets(companyId);

  // Load recent directives for dedup (2-hour window)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const recentDirectives = await CompanyDirective.findAll({
    where: { company_id: companyId, created_at: { [Op.gt]: twoHoursAgo } },
    attributes: ['objective', 'target_department'],
  });
  const recentKeys = new Set(recentDirectives.map((d: any) => `${d.target_department}:${d.objective}`));

  const pendingDirectives: Array<{
    priority: string;
    target_department: string;
    objective: string;
    constraints: Record<string, any>;
  }> = [];

  let skippedDedup = 0;

  // Rule 1: Goals behind schedule
  for (const goal of goals) {
    const g = goal as any;
    const progress = g.target_value > 0 ? (Number(g.current_value) / Number(g.target_value)) * 100 : 0;
    if (progress < 50 && g.priority !== 'low') {
      const dept = mapGoalTypeToDepartment(g.goal_type);
      const obj = `Accelerate "${g.goal_name}" — currently at ${Math.round(progress)}% of target`;
      const key = `${dept}:${obj}`;
      if (recentKeys.has(key)) { skippedDedup++; continue; }
      pendingDirectives.push({
        priority: g.priority === 'critical' ? 'critical' : 'high',
        target_department: dept,
        objective: obj,
        constraints: { goal_id: g.id, current_progress: Math.round(progress) },
      });
    }
  }

  // Rule 2: KPIs trending down
  for (const kpi of kpis) {
    const k = kpi as any;
    if (k.trend === 'down') {
      const obj = `Investigate declining ${k.kpi_name} in ${k.department_name}`;
      const key = `${k.department_name}:${obj}`;
      if (recentKeys.has(key)) { skippedDedup++; continue; }
      pendingDirectives.push({
        priority: 'medium',
        target_department: k.department_name,
        objective: obj,
        constraints: { kpi_id: k.id, current_value: Number(k.current_value), target_value: Number(k.target_value) },
      });
    }
  }

  // Rule 3: Budget overrun (>90% spent)
  for (const budget of budgets) {
    const b = budget as any;
    const spentPct = Number(b.allocated_budget) > 0 ? (Number(b.spent_budget) / Number(b.allocated_budget)) * 100 : 0;
    if (spentPct > 90) {
      const obj = `Review spend in ${b.department_name} — ${Math.round(spentPct)}% of budget used`;
      const key = `${b.department_name}:${obj}`;
      if (recentKeys.has(key)) { skippedDedup++; continue; }
      pendingDirectives.push({
        priority: spentPct > 100 ? 'high' : 'medium',
        target_department: b.department_name,
        objective: obj,
        constraints: { budget_id: b.id, spent_pct: Math.round(spentPct) },
      });
    }
  }

  // Create directives (max 5 per cycle)
  const toCreate = pendingDirectives.slice(0, 5);
  let created = 0;
  for (const d of toCreate) {
    await CompanyDirective.create({
      company_id: companyId,
      source: 'CEO_AGENT',
      priority: d.priority,
      target_department: d.target_department,
      objective: d.objective,
      constraints: d.constraints,
      status: 'proposed',
    } as any);
    created++;
  }

  // Log cycle
  await logAudit(companyId, 'strategic_cycle', 'CEO_AGENT', {
    goals_evaluated: goals.length,
    kpis_evaluated: kpis.length,
    budgets_evaluated: budgets.length,
    directives_created: created,
    directives_skipped_dedup: skippedDedup,
    duration_ms: Date.now() - start,
  });

  return {
    directivesCreated: created,
    directivesSkippedDedup: skippedDedup,
    goalsEvaluated: goals.length,
    kpisEvaluated: kpis.length,
    budgetsEvaluated: budgets.length,
    durationMs: Date.now() - start,
  };
}

function mapGoalTypeToDepartment(goalType: string): string {
  const map: Record<string, string> = {
    revenue: 'finance',
    leads: 'marketing',
    ops: 'operations',
    retention: 'student_success',
    growth: 'growth',
    custom: 'executive',
  };
  return map[goalType] || 'executive';
}
