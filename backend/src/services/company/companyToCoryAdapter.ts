/**
 * Company-to-Cory Adapter
 *
 * Transforms CEO Agent directives into IntelligenceDecision records
 * that Cory's existing pipeline can process.
 *
 * Toggleable via feature flag. Logs all transformations.
 * Does NOT modify Cory core logic.
 */

export async function isCompanyLayerEnabled(): Promise<boolean> {
  try {
    const { default: SystemSetting } = await import('../../models/SystemSetting');
    const setting = await SystemSetting.findOne({ where: { key: 'company_layer_enabled' } });
    return setting?.value === 'true' || setting?.value === true;
  } catch {
    return false;
  }
}

export async function transformDirectiveToCory(directiveId: string): Promise<{ decisionId: string } | null> {
  const { default: CompanyDirective } = await import('../../models/CompanyDirective');
  const { default: IntelligenceDecision } = await import('../../models/IntelligenceDecision');
  const { logAudit } = await import('./companyService');

  const directive = await CompanyDirective.findByPk(directiveId);
  if (!directive) return null;

  const d = directive as any;

  // Create IntelligenceDecision that Cory will pick up
  const decision = await IntelligenceDecision.create({
    problem_detected: `[Company Directive] ${d.objective}`,
    analysis_summary: `CEO Agent identified: ${d.objective}. Priority: ${d.priority}. Target: ${d.target_department}.`,
    reasoning: `Company-level strategic directive from CEO Agent. Source: ${d.source}. Constraints: ${JSON.stringify(d.constraints)}`,
    recommended_action: 'update_agent_config', // safe action type
    action_details: {
      description: d.objective,
      source: 'company_strategy',
      directive_id: d.id,
      target_department: d.target_department,
      parameters: d.constraints,
      expected_impact: `Address company-level priority: ${d.priority}`,
      reversible: true,
      alternatives: [],
    },
    risk_score: d.priority === 'critical' ? 30 : d.priority === 'high' ? 20 : 10,
    confidence_score: 80,
    risk_tier: 'safe',
    execution_status: 'proposed',
    observation_count: 1,
  } as any);

  // Link directive to decision
  await d.update({ cory_decision_id: (decision as any).decision_id, status: 'executing' });

  // Audit log
  await logAudit(d.company_id, 'adapter_transform', 'ADAPTER', {
    directive_id: d.id,
    decision_id: (decision as any).decision_id,
    objective: d.objective,
    priority: d.priority,
  });

  return { decisionId: (decision as any).decision_id };
}

export async function rollbackDirective(directiveId: string): Promise<boolean> {
  const { default: CompanyDirective } = await import('../../models/CompanyDirective');
  const { default: IntelligenceDecision } = await import('../../models/IntelligenceDecision');
  const { logAudit } = await import('./companyService');

  const directive = await CompanyDirective.findByPk(directiveId);
  if (!directive) return false;

  const d = directive as any;

  // If linked to a decision, reject it
  if (d.cory_decision_id) {
    const decision = await IntelligenceDecision.findOne({ where: { decision_id: d.cory_decision_id } });
    if (decision) {
      await (decision as any).update({ execution_status: 'rejected' });
    }
  }

  await d.update({ status: 'rejected', result_summary: 'Rolled back via adapter' });

  await logAudit(d.company_id, 'directive_rollback', 'ADAPTER', {
    directive_id: d.id,
    decision_id: d.cory_decision_id,
  });

  return true;
}
