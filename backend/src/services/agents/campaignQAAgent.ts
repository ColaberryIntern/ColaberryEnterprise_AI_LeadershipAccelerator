import { Campaign } from '../../models';
import { runCampaignTest } from '../testing/campaignTestHarness';
import { TEST_EMAIL_DOMAIN } from '../testing/testLeadGenerator';
import type { AgentExecutionResult, AgentAction } from './types';

/**
 * CampaignQAAgent — runs end-to-end tests on all active campaigns.
 * Schedule: every 6 hours.
 *
 * Safety: all tests use synthetic leads (source='campaign_test') with
 * unroutable test domain emails. The test harness cancels all pending
 * ScheduledEmails after each test run. The scheduler additionally blocks
 * any is_test_action=true email targeting a non-test domain.
 */
export async function runCampaignQAAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  console.log(`[CampaignQAAgent] Starting QA cycle — test domain: ${TEST_EMAIL_DOMAIN}`);

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
