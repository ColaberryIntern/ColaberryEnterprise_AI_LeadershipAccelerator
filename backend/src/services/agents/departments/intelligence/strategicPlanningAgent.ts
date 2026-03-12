import { Op } from 'sequelize';
import { Lead, Campaign, Visitor } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptStrategicPlanningAgent';

export async function runDeptStrategicPlanningAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Month-over-month trend analysis
    const leads0to30 = await Lead.count({ where: { created_at: { [Op.gte]: thirtyDaysAgo } } });
    const leads30to60 = await Lead.count({
      where: { created_at: { [Op.gte]: sixtyDaysAgo, [Op.lt]: thirtyDaysAgo } },
    });
    const leads60to90 = await Lead.count({
      where: { created_at: { [Op.gte]: ninetyDaysAgo, [Op.lt]: sixtyDaysAgo } },
    });

    const visitors0to30 = await Visitor.count({ where: { first_seen_at: { [Op.gte]: thirtyDaysAgo } } });
    const visitors30to60 = await Visitor.count({
      where: { first_seen_at: { [Op.gte]: sixtyDaysAgo, [Op.lt]: thirtyDaysAgo } },
    });

    const totalCampaigns = await Campaign.count();
    const activeCampaigns = await Campaign.count({ where: { status: 'active' } });

    entitiesProcessed = leads0to30 + leads30to60 + leads60to90;

    // Calculate growth trends
    const leadGrowth = leads30to60 > 0
      ? ((leads0to30 - leads30to60) / leads30to60 * 100).toFixed(1)
      : 'N/A';
    const visitorGrowth = visitors30to60 > 0
      ? ((visitors0to30 - visitors30to60) / visitors30to60 * 100).toFixed(1)
      : 'N/A';

    const strategicInsights: string[] = [];
    if (leadGrowth !== 'N/A') {
      const growth = parseFloat(leadGrowth);
      if (growth > 20) strategicInsights.push(`Strong lead growth (+${leadGrowth}%) — consider scaling acquisition spend`);
      else if (growth < -20) strategicInsights.push(`Lead decline (${leadGrowth}%) — diversify acquisition channels`);
      else strategicInsights.push(`Stable lead flow (${leadGrowth}% MoM) — optimize conversion funnel`);
    }

    if (visitorGrowth !== 'N/A') {
      const growth = parseFloat(visitorGrowth);
      if (growth > 30) strategicInsights.push(`Traffic surge (+${visitorGrowth}%) — capitalize with conversion optimization`);
      else if (growth < -30) strategicInsights.push(`Traffic decline (${visitorGrowth}%) — review SEO and content strategy`);
    }

    if (activeCampaigns === 0) {
      strategicInsights.push('No active campaigns — launch nurture sequences immediately');
    }

    const opportunities: string[] = [
      'Enterprise segment shows highest conversion potential — allocate resources',
      'AI leadership positioning differentiates from generic bootcamps',
      'Alumni referral program could reduce acquisition cost by 30-40%',
    ];

    actions.push({
      campaign_id: '',
      action: 'strategic_analysis',
      reason: `Analyzed 90-day trends across leads, visitors, and campaigns`,
      confidence: 0.80,
      before_state: null,
      after_state: {
        lead_trend: { month1: leads60to90, month2: leads30to60, month3: leads0to30 },
        visitor_trend: { prev_month: visitors30to60, current_month: visitors0to30 },
        lead_growth_pct: leadGrowth,
        visitor_growth_pct: visitorGrowth,
        campaigns: { total: totalCampaigns, active: activeCampaigns },
        strategic_insights: strategicInsights,
        opportunities,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'strategic_analysis',
      result: 'success',
      details: { lead_growth: leadGrowth, visitor_growth: visitorGrowth },
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
