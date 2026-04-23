/**
 * Company Seed Service
 *
 * Seeds a default AI Company for single-tenant deployments.
 * Idempotent — safe to run multiple times.
 * Only runs when company_layer_enabled = true.
 */

export async function seedDefaultCompany(): Promise<void> {
  const { isCompanyLayerEnabled } = await import('./companyToCoryAdapter');
  if (!(await isCompanyLayerEnabled())) return;

  const { default: AiCompany } = await import('../../models/AiCompany');

  // Check if a company already exists
  const existing = await AiCompany.findOne({ where: { status: 'active' } });
  if (existing) return;

  // Create default company
  const company = await AiCompany.create({
    name: 'Colaberry Enterprise',
    industry: 'Education Technology / AI Training',
    target_mode: 'autonomous',
    status: 'active',
    settings: { auto_approve_safe_directives: false },
  } as any);

  const companyId = (company as any).id;

  // Seed default goals
  const { default: CompanyGoal } = await import('../../models/CompanyGoal');
  const defaultGoals = [
    { goal_name: 'Student enrollment rate', goal_type: 'leads', target_value: 100, measurement_unit: 'students/month', priority: 'high' },
    { goal_name: 'Course completion rate', goal_type: 'retention', target_value: 80, measurement_unit: '%', priority: 'high' },
    { goal_name: 'System production readiness', goal_type: 'ops', target_value: 90, measurement_unit: '%', priority: 'medium' },
    { goal_name: 'Agent fleet health', goal_type: 'ops', target_value: 95, measurement_unit: '%', priority: 'medium' },
  ];
  for (const g of defaultGoals) {
    await CompanyGoal.create({ ...g, company_id: companyId, status: 'active' } as any);
  }

  // Seed default KPIs for key departments
  const { default: DepartmentKpi } = await import('../../models/DepartmentKpi');
  const defaultKPIs = [
    { department_name: 'marketing', kpi_name: 'Lead conversion rate', target_value: 15, measurement_unit: '%' },
    { department_name: 'admissions', kpi_name: 'Enrollment pipeline velocity', target_value: 30, measurement_unit: 'days' },
    { department_name: 'student_success', kpi_name: 'Student satisfaction', target_value: 4.5, measurement_unit: '/5' },
    { department_name: 'intelligence', kpi_name: 'Agent success rate', target_value: 90, measurement_unit: '%' },
    { department_name: 'platform', kpi_name: 'System uptime', target_value: 99.5, measurement_unit: '%' },
  ];
  for (const k of defaultKPIs) {
    await DepartmentKpi.create({ ...k, company_id: companyId, trend: 'unknown' } as any);
  }

  // Seed default budgets
  const { default: CompanyBudget } = await import('../../models/CompanyBudget');
  const defaultBudgets = [
    { department_name: 'marketing', allocated_budget: 5000, roi_target: 300 },
    { department_name: 'platform', allocated_budget: 3000, roi_target: 0 },
    { department_name: 'intelligence', allocated_budget: 2000, roi_target: 0 },
  ];
  for (const b of defaultBudgets) {
    await CompanyBudget.create({ ...b, company_id: companyId, spent_budget: 0, roi_actual: 0 } as any);
  }

  console.log(`[Company Layer] Default company seeded: ${companyId}`);
}
