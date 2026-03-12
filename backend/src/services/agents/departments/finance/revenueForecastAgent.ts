import { Op } from 'sequelize';
import { Lead, CampaignLead, Campaign } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptRevenueForecastAgent';

export async function runDeptRevenueForecastAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Pipeline analysis: leads at various stages
    const totalLeads = await Lead.count();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const newLeads30d = await Lead.count({
      where: { created_at: { [Op.gte]: thirtyDaysAgo } },
    });
    const newLeads90d = await Lead.count({
      where: { created_at: { [Op.gte]: ninetyDaysAgo } },
    });

    // Active campaign leads (in-pipeline)
    const activePipelineLeads = await CampaignLead.count({
      where: { status: { [Op.in]: ['active', 'nurturing', 'engaged'] } },
    });

    const completedLeads = await CampaignLead.count({
      where: { status: { [Op.in]: ['converted', 'enrolled', 'completed'] } },
    });

    entitiesProcessed = totalLeads;

    // Simple conversion rate calculation
    const conversionRate = totalLeads > 0
      ? (completedLeads / totalLeads * 100).toFixed(1)
      : '0';

    // Revenue estimates (configurable per-student value)
    const avgStudentValue = (_config?.avg_student_value as number) || 5000;
    const forecast30d = Math.round(newLeads30d * (parseFloat(conversionRate) / 100) * avgStudentValue);
    const forecast90d = Math.round(newLeads90d * (parseFloat(conversionRate) / 100) * avgStudentValue);

    const riskIndicators: string[] = [];
    if (newLeads30d < newLeads90d / 3) {
      riskIndicators.push('Lead generation declining — 30-day pace below 90-day average');
    }
    if (parseFloat(conversionRate) < 5) {
      riskIndicators.push(`Low conversion rate (${conversionRate}%) — review funnel effectiveness`);
    }
    if (activePipelineLeads < 10) {
      riskIndicators.push('Thin pipeline — fewer than 10 active leads in nurture');
    }

    actions.push({
      campaign_id: '',
      action: 'revenue_forecast',
      reason: `Forecasted revenue from ${entitiesProcessed} total leads`,
      confidence: 0.75,
      before_state: null,
      after_state: {
        total_leads: totalLeads,
        new_leads_30d: newLeads30d,
        new_leads_90d: newLeads90d,
        active_pipeline: activePipelineLeads,
        completed_conversions: completedLeads,
        conversion_rate: conversionRate + '%',
        forecast_30d: `$${forecast30d.toLocaleString()}`,
        forecast_90d: `$${forecast90d.toLocaleString()}`,
        risk_indicators: riskIndicators,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'revenue_forecast',
      result: 'success',
      details: { forecast_30d: forecast30d, forecast_90d: forecast90d, risks: riskIndicators.length },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: entitiesProcessed,
  };
}
