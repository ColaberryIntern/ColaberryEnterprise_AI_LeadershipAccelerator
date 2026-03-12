import { Op } from 'sequelize';
import { Campaign, CampaignLead, ScheduledEmail } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptGrowthExperimentAgent';

export async function runDeptGrowthExperimentAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Find active campaigns with enough leads for experimentation
    const campaigns = await Campaign.findAll({
      where: { status: 'active' },
    });

    const experiments: Array<{ campaign: string; suggestion: string; expected_lift: string }> = [];

    for (const campaign of campaigns) {
      const leadCount = await CampaignLead.count({
        where: { campaign_id: (campaign as any).id },
      });

      const emailCount = await ScheduledEmail.count({
        where: { campaign_id: (campaign as any).id },
      });

      entitiesProcessed++;

      if (leadCount >= 20) {
        experiments.push({
          campaign: (campaign as any).name || (campaign as any).id,
          suggestion: 'A/B test email subject lines — sufficient lead volume for statistical significance',
          expected_lift: '5-15% open rate improvement',
        });
      }

      if (emailCount >= 50 && leadCount >= 10) {
        experiments.push({
          campaign: (campaign as any).name || (campaign as any).id,
          suggestion: 'Test send-time optimization — vary delivery times across segments',
          expected_lift: '3-8% engagement improvement',
        });
      }
    }

    // General growth experiments
    experiments.push({
      campaign: 'Global',
      suggestion: 'Landing page headline test — compare benefit-driven vs authority-driven messaging',
      expected_lift: '10-20% conversion improvement',
    });

    actions.push({
      campaign_id: '',
      action: 'experiment_suggestions',
      reason: `Analyzed ${entitiesProcessed} campaigns for experiment opportunities`,
      confidence: 0.80,
      before_state: null,
      after_state: {
        campaigns_analyzed: entitiesProcessed,
        experiments_suggested: experiments.length,
        experiments,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'experiment_suggestions',
      result: 'success',
      details: { campaigns_analyzed: entitiesProcessed, experiments_suggested: experiments.length },
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
