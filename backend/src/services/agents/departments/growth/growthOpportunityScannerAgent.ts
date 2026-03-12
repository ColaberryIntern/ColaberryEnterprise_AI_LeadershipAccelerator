import { Op } from 'sequelize';
import { Lead, Visitor, CampaignLead, Campaign } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptGrowthOpportunityScannerAgent';

export async function runDeptGrowthOpportunityScannerAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. High-intent leads not yet in any campaign
    const allLeadIds = (await CampaignLead.findAll({
      attributes: ['lead_id'],
      group: ['lead_id'],
    })).map((cl: any) => cl.lead_id);

    const unconvertedLeads = await Lead.count({
      where: {
        ...(allLeadIds.length > 0 ? { id: { [Op.notIn]: allLeadIds } } : {}),
        created_at: { [Op.gte]: thirtyDaysAgo },
      },
    });

    // 2. Repeat visitors (visited 3+ times)
    const repeatVisitors = await Visitor.count({
      where: { total_sessions: { [Op.gte]: 3 } } as any,
    });

    // 3. Total leads this month vs last month
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const leadsThisMonth = await Lead.count({
      where: { created_at: { [Op.gte]: thirtyDaysAgo } },
    });
    const leadsLastMonth = await Lead.count({
      where: {
        created_at: { [Op.gte]: sixtyDaysAgo, [Op.lt]: thirtyDaysAgo },
      },
    });
    const leadGrowthRate = leadsLastMonth > 0
      ? ((leadsThisMonth - leadsLastMonth) / leadsLastMonth * 100).toFixed(1)
      : 'N/A';

    // 4. Active campaigns count
    const activeCampaigns = await Campaign.count({
      where: { status: 'active' },
    });

    entitiesProcessed = unconvertedLeads + repeatVisitors;

    const recommendations: string[] = [];
    if (unconvertedLeads > 10) {
      recommendations.push(`${unconvertedLeads} leads are not in any campaign — consider nurture sequence enrollment`);
    }
    if (repeatVisitors > 5) {
      recommendations.push(`${repeatVisitors} repeat visitors detected — high-intent outreach opportunity`);
    }
    if (leadGrowthRate !== 'N/A' && parseFloat(leadGrowthRate) < 0) {
      recommendations.push(`Lead generation declined ${leadGrowthRate}% MoM — review acquisition channels`);
    }

    actions.push({
      campaign_id: '',
      action: 'growth_opportunity_scan',
      reason: `Scanned ${entitiesProcessed} entities for growth opportunities`,
      confidence: 0.85,
      before_state: null,
      after_state: {
        unconverted_leads: unconvertedLeads,
        repeat_visitors: repeatVisitors,
        leads_this_month: leadsThisMonth,
        leads_last_month: leadsLastMonth,
        lead_growth_rate: leadGrowthRate,
        active_campaigns: activeCampaigns,
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'growth_opportunity_scan',
      result: 'success',
      details: { unconverted_leads: unconvertedLeads, repeat_visitors: repeatVisitors, recommendations },
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
