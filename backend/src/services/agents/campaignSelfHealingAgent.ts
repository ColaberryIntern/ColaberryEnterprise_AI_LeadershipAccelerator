import { Op } from 'sequelize';
import { Campaign, CampaignTestRun, CampaignTestStep, ScheduledEmail } from '../../models';
import { runCampaignTest } from '../testing/campaignTestHarness';
import { checkLeadSendable } from '../communicationSafetyService';
import type { AgentExecutionResult, AgentAction } from './types';

/**
 * CampaignSelfHealingAgent — detects QA failures and attempts repairs.
 * Extends CampaignRepairAgent capabilities with QA-driven healing.
 * Schedule: every 30 minutes (offset from repair agent).
 */
export async function runCampaignSelfHealingAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  const maxRetries = config.max_retry_attempts || 3;

  // Find recent failed test steps (last 6 hours)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const failedSteps = await CampaignTestStep.findAll({
    where: {
      status: 'failed',
      created_at: { [Op.gte]: sixHoursAgo },
    },
    include: [
      {
        model: CampaignTestRun,
        as: 'testRun',
        attributes: ['campaign_id', 'status'],
        include: [{ model: Campaign, as: 'campaign', attributes: ['id', 'name', 'status'] }],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  // Group by campaign
  const campaignFailures = new Map<string, { campaign: any; steps: string[] }>();
  for (const step of failedSteps) {
    const testRun = (step as any).testRun;
    if (!testRun?.campaign) continue;
    const cid = testRun.campaign.id;
    if (!campaignFailures.has(cid)) {
      campaignFailures.set(cid, { campaign: testRun.campaign, steps: [] });
    }
    campaignFailures.get(cid)!.steps.push(step.step_name);
  }

  for (const [campaignId, { campaign, steps }] of campaignFailures) {
    try {
      const uniqueSteps = [...new Set(steps)];

      // Repair: retry failed email sends
      if (uniqueSteps.includes('send_email')) {
        const failedEmails = await ScheduledEmail.findAll({
          where: {
            campaign_id: campaignId,
            status: 'failed',
            created_at: { [Op.gte]: sixHoursAgo },
          },
          limit: maxRetries,
        });

        for (const email of failedEmails) {
          // Skip test actions — never retry test harness emails
          if (email.is_test_action) {
            await email.update({ status: 'cancelled' });
            actions.push({
              campaign_id: campaignId,
              action: 'retry_skipped_test_action',
              reason: `Cancelled test action ${email.id} — test actions are not retried`,
              confidence: 1.0,
              before_state: { status: 'failed' },
              after_state: { status: 'cancelled' },
              result: 'skipped',
            });
            continue;
          }

          // Check if lead is still sendable before retrying
          if (email.lead_id) {
            const leadCheck = await checkLeadSendable(email.lead_id);
            if (!leadCheck.sendable) {
              await email.update({ status: 'cancelled' });
              actions.push({
                campaign_id: campaignId,
                action: 'retry_skipped_unsendable_lead',
                reason: `Cancelled retry for email ${email.id} — lead ${leadCheck.reason}`,
                confidence: 1.0,
                before_state: { status: 'failed' },
                after_state: { status: 'cancelled', reason: leadCheck.reason },
                result: 'skipped',
              });
              continue;
            }
          }

          await email.update({
            status: 'pending',
            scheduled_for: new Date(Date.now() + 5 * 60 * 1000),
          });

          actions.push({
            campaign_id: campaignId,
            action: 'retry_failed_email',
            reason: `Requeued failed email ${email.id} after QA failure`,
            confidence: 0.8,
            before_state: { status: 'failed' },
            after_state: { status: 'pending' },
            result: 'success',
          });
        }
      }

      // Re-test after repair
      if (uniqueSteps.length > 0) {
        try {
          const retest = await runCampaignTest(campaignId, 'qa_agent');
          actions.push({
            campaign_id: campaignId,
            action: 'post_repair_retest',
            reason: `Re-tested after repairing: ${uniqueSteps.join(', ')}. Score: ${retest.score}`,
            confidence: 1.0,
            before_state: null,
            after_state: { score: retest.score, status: retest.status },
            result: retest.status === 'passed' ? 'success' : 'failed',
          });
        } catch (retestErr: any) {
          errors.push(`Re-test failed for ${campaign.name}: ${retestErr.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Self-healing failed for ${campaign.name}: ${err.message}`);
    }
  }

  return {
    agent_name: 'CampaignSelfHealingAgent',
    campaigns_processed: campaignFailures.size,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
