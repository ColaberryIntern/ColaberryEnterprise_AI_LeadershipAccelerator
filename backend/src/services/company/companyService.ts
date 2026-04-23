/**
 * Company Service — CRUD operations for the AI Company Layer.
 * Pure data access, no business logic.
 */

export async function getActiveCompany() {
  const { default: AiCompany } = await import('../../models/AiCompany');
  return AiCompany.findOne({ where: { status: 'active' }, order: [['created_at', 'ASC']] });
}

export async function getCompanyById(id: string) {
  const { default: AiCompany } = await import('../../models/AiCompany');
  return AiCompany.findByPk(id);
}

export async function createCompany(data: { name: string; industry?: string; target_mode?: string }) {
  const { default: AiCompany } = await import('../../models/AiCompany');
  return AiCompany.create(data as any);
}

export async function getCompanyGoals(companyId: string, status?: string) {
  const { default: CompanyGoal } = await import('../../models/CompanyGoal');
  const where: any = { company_id: companyId };
  if (status) where.status = status;
  return CompanyGoal.findAll({ where, order: [['priority', 'DESC'], ['created_at', 'ASC']] });
}

export async function createGoal(data: any) {
  const { default: CompanyGoal } = await import('../../models/CompanyGoal');
  return CompanyGoal.create(data);
}

export async function updateGoal(id: string, data: any) {
  const { default: CompanyGoal } = await import('../../models/CompanyGoal');
  const goal = await CompanyGoal.findByPk(id);
  if (!goal) return null;
  await goal.update(data);
  return goal;
}

export async function getCompanyKPIs(companyId: string) {
  const { default: DepartmentKpi } = await import('../../models/DepartmentKpi');
  return DepartmentKpi.findAll({ where: { company_id: companyId }, order: [['department_name', 'ASC']] });
}

export async function getCompanyBudgets(companyId: string) {
  const { default: CompanyBudget } = await import('../../models/CompanyBudget');
  return CompanyBudget.findAll({ where: { company_id: companyId }, order: [['department_name', 'ASC']] });
}

export async function getCompanyDirectives(companyId: string, status?: string) {
  const { default: CompanyDirective } = await import('../../models/CompanyDirective');
  const where: any = { company_id: companyId };
  if (status) where.status = status;
  return CompanyDirective.findAll({ where, order: [['created_at', 'DESC']], limit: 50 });
}

export async function updateDirectiveStatus(id: string, status: string, resultSummary?: string) {
  const { default: CompanyDirective } = await import('../../models/CompanyDirective');
  const directive = await CompanyDirective.findByPk(id);
  if (!directive) return null;
  await directive.update({ status, result_summary: resultSummary || directive.result_summary });
  return directive;
}

export async function getAuditLog(companyId: string, limit: number = 50) {
  const { default: CompanyAuditLog } = await import('../../models/CompanyAuditLog');
  return CompanyAuditLog.findAll({ where: { company_id: companyId }, order: [['created_at', 'DESC']], limit });
}

export async function logAudit(companyId: string, eventType: string, actor: string, detail: Record<string, any>) {
  const { default: CompanyAuditLog } = await import('../../models/CompanyAuditLog');
  return CompanyAuditLog.create({ company_id: companyId, event_type: eventType, actor, detail } as any);
}
