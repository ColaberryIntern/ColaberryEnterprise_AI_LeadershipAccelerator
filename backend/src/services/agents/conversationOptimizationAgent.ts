import { Op, fn, col } from 'sequelize';
import { Campaign, ScheduledEmail, InteractionOutcome } from '../../models';
import { logAgentActivity, logAiEvent } from '../aiEventService';
import { createProposal } from '../agentPermissionService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'ConversationOptimizationAgent';
const MIN_SENT_PER_STEP = 5;
const DROPOFF_THRESHOLD = 0.80; // If reply rate drops > 80% from previous step

/**
 * Detect step-level conversation dropoffs and PROPOSE AI instruction enhancements.
 * This agent operates in SUGGEST-ONLY mode — creates ProposedAgentAction records
 * instead of directly modifying ScheduledEmail instructions. An admin must approve.
 */
export async function runConversationOptimizationAgent(
  agentId: string,
  config: Record<string, any> = {},
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxActionsPerRun = config.max_auto_actions_per_hour || 5;
  let actionCount = 0;

  const campaignIds = new Set<string>();

  try {
    const activeCampaigns = await Campaign.findAll({
      where: { status: 'active' },
    });

    for (const campaign of activeCampaigns) {
      if (actionCount >= maxActionsPerRun) break;

      // Get step-level performance
      const stepStats = await InteractionOutcome.findAll({
        where: { campaign_id: campaign.id },
        attributes: [
          'step_index',
          'outcome',
          [fn('COUNT', col('id')), 'count'],
        ],
        group: ['step_index', 'outcome'],
        raw: true,
      }) as any[];

      // Build step performance map
      const stepMap: Record<number, Record<string, number>> = {};
      for (const row of stepStats) {
        const stepIdx = row.step_index ?? -1;
        if (stepIdx < 0) continue;
        if (!stepMap[stepIdx]) stepMap[stepIdx] = {};
        stepMap[stepIdx][row.outcome] = parseInt(row.count, 10);
      }

      const stepIndices = Object.keys(stepMap).map(Number).sort((a, b) => a - b);
      if (stepIndices.length < 2) continue;

      campaignIds.add(campaign.id);

      // Detect dropoff points
      for (let i = 1; i < stepIndices.length; i++) {
        if (actionCount >= maxActionsPerRun) break;

        const prevStep = stepMap[stepIndices[i - 1]];
        const currStep = stepMap[stepIndices[i]];

        const prevTotal = Object.values(prevStep).reduce((a, b) => a + b, 0);
        const currTotal = Object.values(currStep).reduce((a, b) => a + b, 0);

        if (currTotal < MIN_SENT_PER_STEP) continue;

        const prevReplyRate = prevTotal > 0 ? (prevStep['replied'] || 0) / prevTotal : 0;
        const currReplyRate = currTotal > 0 ? (currStep['replied'] || 0) / currTotal : 0;

        // Detect significant dropoff
        if (prevReplyRate > 0 && currReplyRate > 0) {
          const dropoff = 1 - (currReplyRate / prevReplyRate);
          if (dropoff < DROPOFF_THRESHOLD) continue;
        } else if (currReplyRate >= prevReplyRate) {
          continue; // No dropoff
        }

        // Find pending emails at this step and enhance their AI instructions
        const pendingAtStep = await ScheduledEmail.findAll({
          where: {
            campaign_id: campaign.id,
            step_index: stepIndices[i],
            status: 'pending',
          },
          limit: maxActionsPerRun - actionCount,
        });

        for (const email of pendingAtStep) {
          if (actionCount >= maxActionsPerRun) break;

          const beforeState = {
            ai_instructions: email.ai_instructions?.substring(0, 200),
            step_index: email.step_index,
          };

          const enhancedInstructions = buildEnhancedInstructions(
            email.ai_instructions || '',
            stepIndices[i],
            currReplyRate,
            prevReplyRate,
          );

          try {
            const proposedChanges = { ai_instructions: enhancedInstructions };
            const dropoffReason = `Step ${stepIndices[i]} reply rate (${(currReplyRate * 100).toFixed(1)}%) dropped significantly from step ${stepIndices[i - 1]} (${(prevReplyRate * 100).toFixed(1)}%)`;

            // Create a proposal instead of directly modifying the email
            await createProposal(
              agentId,
              AGENT_NAME,
              'propose_instruction_enhancement',
              'scheduled_emails',
              email.id,
              proposedChanges,
              beforeState,
              dropoffReason,
              0.70,
              campaign.id,
            );

            await logAgentActivity({
              agent_id: agentId,
              campaign_id: campaign.id,
              action: 'propose_instruction_enhancement',
              reason: dropoffReason,
              confidence: 0.70,
              before_state: beforeState,
              after_state: proposedChanges,
              result: 'success',
              details: {
                scheduled_email_id: email.id,
                step_index: stepIndices[i],
                prev_reply_rate: prevReplyRate,
                curr_reply_rate: currReplyRate,
                mode: 'proposal',
              },
            });

            actions.push({
              campaign_id: campaign.id,
              action: 'propose_instruction_enhancement',
              reason: `Proposed instruction enhancement at step ${stepIndices[i]} (pending approval)`,
              confidence: 0.70,
              before_state: beforeState,
              after_state: proposedChanges,
              result: 'success',
            });

            actionCount++;
          } catch (err: any) {
            errors.push(`Instruction enhancement proposal failed for email ${email.id}: ${err.message}`);
          }
        }
      }
    }

    if (actionCount > 0) {
      await logAiEvent(AGENT_NAME, 'optimization_run_completed', undefined, undefined, {
        campaigns_analyzed: campaignIds.size,
        proposals_created: actionCount,
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

function buildEnhancedInstructions(
  existing: string,
  stepIndex: number,
  currentReplyRate: number,
  previousReplyRate: number,
): string {
  const enhancement = [
    `[AUTO-OPTIMIZED] This is follow-up step ${stepIndex + 1}. Previous steps had ${(previousReplyRate * 100).toFixed(1)}% reply rate but this step dropped to ${(currentReplyRate * 100).toFixed(1)}%.`,
    'OPTIMIZATION GUIDANCE:',
    '- Lead with a new value proposition or insight not covered in previous steps',
    '- Reference the passage of time since last outreach naturally',
    '- Ask a specific, easy-to-answer question to lower the response barrier',
    '- Keep the message shorter than previous steps',
    '- Consider a different angle (social proof, case study, industry trend)',
    '',
  ].join('\n');

  return existing ? `${enhancement}\nORIGINAL INSTRUCTIONS:\n${existing}` : enhancement;
}
