import { Campaign } from '../../models';
import { runCampaignTest } from '../testing/campaignTestHarness';
import type { AgentExecutionResult, AgentAction } from './types';

/**
 * CampaignQAAgent — runs end-to-end tests on all active campaigns.
 * Schedule: every 6 hours.
 */
export async function runCampaignQAAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  const campaigns = await Campaign.findAll({ where: { status: 'active' } });

  for (const campaign of campaigns) {
    try {
      const testRun = await runCampaignTest(campaign.id, 'qa_agent');

      actions.push({
        campaign_id: campaign.id,
        action: 'campaign_test_completed',
        reason: `QA test ${testRun.status}: score ${testRun.score}/100`,
        confidence: 1.0,
        before_state: { qa_status: campaign.qa_status || 'untested' },
        after_state: { qa_status: testRun.status === 'passed' ? 'passed' : 'failed', score: testRun.score },
        result: testRun.status === 'passed' ? 'success' : 'failed',
        details: testRun.summary || undefined,
      });
    } catch (err: any) {
      errors.push(`Campaign ${campaign.name} (${campaign.id}): ${err.message}`);
    }
  }

  return {
    agent_name: 'CampaignQAAgent',
    campaigns_processed: campaigns.length,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
