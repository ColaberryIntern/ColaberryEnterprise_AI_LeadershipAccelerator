import { Op } from 'sequelize';
import { Campaign, CampaignLead, ScheduledEmail } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptCampaignPerformanceAgent';

export async function runDeptCampaignPerformanceAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const campaigns = await Campaign.findAll({ where: { status: 'active' } });
    const campaignReports: Array<{
      name: string; leads: number; emails_sent: number;
      emails_pending: number; funnel_health: string;
    }> = [];

    for (const campaign of campaigns) {
      const cid = (campaign as any).id;
      entitiesProcessed++;

      const leadCount = await CampaignLead.count({ where: { campaign_id: cid } });
      const emailsSent = await ScheduledEmail.count({
        where: { campaign_id: cid, status: 'sent' },
      });
      const emailsPending = await ScheduledEmail.count({
        where: { campaign_id: cid, status: 'pending' },
      });
      const emailsFailed = await ScheduledEmail.count({
        where: { campaign_id: cid, status: 'failed' },
      });

      let funnelHealth = 'healthy';
      if (emailsFailed > emailsSent * 0.1) funnelHealth = 'degraded';
      if (leadCount === 0) funnelHealth = 'empty';

      campaignReports.push({
        name: (campaign as any).name || cid,
        leads: leadCount,
        emails_sent: emailsSent,
        emails_pending: emailsPending,
        funnel_health: funnelHealth,
      });
    }

    const underperformers = campaignReports.filter(c => c.funnel_health !== 'healthy');
    const recommendations: string[] = [];
    if (underperformers.length > 0) {
      recommendations.push(`${underperformers.length} campaigns need attention: ${underperformers.map(c => c.name).join(', ')}`);
    }

    actions.push({
      campaign_id: '',
      action: 'campaign_performance_analysis',
      reason: `Analyzed ${entitiesProcessed} active campaigns`,
      confidence: 0.88,
      before_state: null,
      after_state: {
        campaigns_analyzed: entitiesProcessed,
        underperformers: underperformers.length,
        campaign_reports: campaignReports,
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'campaign_performance_analysis',
      result: 'success',
      details: { campaigns: entitiesProcessed, underperformers: underperformers.length },
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
