import { Op, fn, col } from 'sequelize';
import { Campaign, ScheduledEmail, InteractionOutcome } from '../../models';
import { generateMessage } from '../aiMessageService';
import { logAgentActivity, logAiEvent } from '../aiEventService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'ContentOptimizationAgent';
const MIN_SAMPLE_SIZE = 10;
const OPEN_RATE_THRESHOLD = 0.10; // 10%
const REPLY_RATE_THRESHOLD = 0.01; // 1%

/**
 * Detect campaigns with low open/reply rates and rewrite pending email subjects/bodies.
 */
export async function runContentOptimizationAgent(
  agentId: string,
  config: Record<string, any> = {},
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxActionsPerRun = config.max_auto_actions_per_hour || 10;
  let actionCount = 0;

  const campaignIds = new Set<string>();

  try {
    const activeCampaigns = await Campaign.findAll({
      where: { status: 'active' },
    });

    const last48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    for (const campaign of activeCampaigns) {
      if (actionCount >= maxActionsPerRun) break;

      // Get engagement metrics for this campaign (last 48h)
      const outcomes = await InteractionOutcome.findAll({
        where: { campaign_id: campaign.id, created_at: { [Op.gte]: last48h } },
        attributes: ['outcome', [fn('COUNT', col('id')), 'count']],
        group: ['outcome'],
        raw: true,
      }) as any[];

      const counts: Record<string, number> = {};
      let totalSent = 0;
      for (const row of outcomes) {
        counts[row.outcome] = parseInt(row.count, 10);
        totalSent += parseInt(row.count, 10);
      }

      if (totalSent < MIN_SAMPLE_SIZE) continue;
      campaignIds.add(campaign.id);

      const openRate = ((counts['opened'] || 0) + (counts['clicked'] || 0) + (counts['replied'] || 0)) / totalSent;
      const replyRate = (counts['replied'] || 0) / totalSent;

      const needsSubjectRewrite = openRate < OPEN_RATE_THRESHOLD;
      const needsBodyRewrite = replyRate < REPLY_RATE_THRESHOLD;

      if (!needsSubjectRewrite && !needsBodyRewrite) continue;

      // Find pending email actions for this campaign
      const pendingEmails = await ScheduledEmail.findAll({
        where: {
          campaign_id: campaign.id,
          status: 'pending',
          channel: 'email',
        },
        limit: maxActionsPerRun - actionCount,
        order: [['scheduled_for', 'ASC']],
      });

      for (const email of pendingEmails) {
        if (actionCount >= maxActionsPerRun) break;

        const beforeState = {
          subject: email.subject,
          body: email.body?.substring(0, 200),
        };

        try {
          const rewriteInstruction = buildRewritePrompt(
            email.subject || '',
            email.body || '',
            openRate,
            replyRate,
            needsSubjectRewrite,
            needsBodyRewrite,
          );

          const result = await generateMessage({
            channel: 'email',
            ai_instructions: rewriteInstruction,
            lead: { name: 'Optimization Preview' } as any,
          });

          if (result && result.subject && result.body) {
            const updateFields: Record<string, any> = {};
            if (needsSubjectRewrite && result.subject) {
              updateFields.subject = result.subject;
            }
            if (needsBodyRewrite && result.body) {
              updateFields.body = result.body;
              updateFields.ai_generated = true;
            }

            await email.update(updateFields);

            const afterState = {
              subject: updateFields.subject || email.subject,
              body: (updateFields.body || email.body)?.substring(0, 200),
            };

            await logAgentActivity({
              agent_id: agentId,
              campaign_id: campaign.id,
              action: needsSubjectRewrite ? 'subject_rewrite' : 'body_rewrite',
              reason: `Open rate ${(openRate * 100).toFixed(1)}%, reply rate ${(replyRate * 100).toFixed(1)}% — below thresholds`,
              confidence: 0.75,
              before_state: beforeState,
              after_state: afterState,
              result: 'success',
              details: {
                scheduled_email_id: email.id,
                open_rate: openRate,
                reply_rate: replyRate,
                tokens_used: result.tokens_used,
              },
            });

            actions.push({
              campaign_id: campaign.id,
              action: needsSubjectRewrite ? 'subject_rewrite' : 'body_rewrite',
              reason: `Rewrote content for low engagement`,
              confidence: 0.75,
              before_state: beforeState,
              after_state: afterState,
              result: 'success',
            });

            actionCount++;
          }
        } catch (err: any) {
          errors.push(`Content rewrite failed for email ${email.id}: ${err.message}`);
          actions.push({
            campaign_id: campaign.id,
            action: 'content_rewrite_failed',
            reason: err.message,
            confidence: 0.75,
            before_state: beforeState,
            after_state: null,
            result: 'failed',
          });
        }
      }
    }

    if (actionCount > 0) {
      await logAiEvent(AGENT_NAME, 'optimization_run_completed', undefined, undefined, {
        campaigns_analyzed: campaignIds.size,
        rewrites_performed: actionCount,
        errors_count: errors.length,
      });
    }
  } catch (err: any) {
    errors.push(`Agent error: ${err.message}`);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: campaignIds.size,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}

function buildRewritePrompt(
  currentSubject: string,
  currentBody: string,
  openRate: number,
  replyRate: number,
  rewriteSubject: boolean,
  rewriteBody: boolean,
): string {
  const parts: string[] = [
    'You are an email optimization specialist.',
    `The current email has an open rate of ${(openRate * 100).toFixed(1)}% and a reply rate of ${(replyRate * 100).toFixed(1)}%.`,
  ];

  if (rewriteSubject) {
    parts.push(`Current subject line: "${currentSubject}"`);
    parts.push('Rewrite the subject line to be more compelling, curiosity-driven, and personalized.');
  }

  if (rewriteBody) {
    parts.push(`Current body (first 500 chars): "${currentBody.substring(0, 500)}"`);
    parts.push('Rewrite the email body to be more concise, value-focused, with a clearer call-to-action.');
  }

  parts.push('Maintain a professional tone suitable for enterprise executives.');
  parts.push('Return JSON with {subject, body} fields.');

  return parts.join('\n');
}
