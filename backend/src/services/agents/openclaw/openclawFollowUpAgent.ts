import { Op } from 'sequelize';
import OpenclawConversation from '../../../models/OpenclawConversation';
import EngagementEvent from '../../../models/EngagementEvent';
import ResponseQueue from '../../../models/ResponseQueue';
import { generateContent } from './openclawAiHelper';
import { CONVERSION_STAGE_PROMPTS, validateFollowUpContent, validateContentForStage } from './openclawPlatformStrategy';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * FollowUpAgent — conversation-aware follow-up engine.
 * Targets stalled conversations (stall_detected_at IS NOT NULL) at stage >= 2
 * with priority_tier hot or warm.
 * Also expires stale ResponseQueue drafts.
 *
 * Schedule: 0 10 * * * (daily 10am UTC)
 */
export async function runFollowUpAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxFollowUps = config.max_follow_ups_per_run || 3;

  try {
    // 1. Expire stale ResponseQueue drafts past expires_at
    const now = new Date();
    const expiredDrafts = await ResponseQueue.findAll({
      where: {
        status: 'draft',
        expires_at: { [Op.lt]: now },
      },
    });

    for (const draft of expiredDrafts) {
      await draft.update({ status: 'expired', updated_at: now });
    }

    if (expiredDrafts.length > 0) {
      actions.push({
        campaign_id: null,
        action: 'expire_drafts',
        reason: `Expired ${expiredDrafts.length} stale response drafts`,
        confidence: 1.0,
        before_state: { expired_count: expiredDrafts.length },
        after_state: { status: 'expired' },
        result: 'success',
        entity_type: 'response_queue',
      });
    }

    // 2. Find stalled conversations — conversation-aware approach
    const stalledConversations = await OpenclawConversation.findAll({
      where: {
        status: 'stalled',
        stall_detected_at: { [Op.ne]: null as any },
        current_stage: { [Op.gte]: 2 },
        priority_tier: { [Op.in]: ['hot', 'warm'] },
      },
      order: [
        ['priority_tier', 'ASC'], // hot first (alphabetical: cold, hot, warm → but we filter to hot/warm)
        ['current_stage', 'DESC'], // highest stage first
      ],
      limit: maxFollowUps,
    });

    // 2b. Enforcement: hot leads at stage >= 3 with no follow-up in 48h (even if not stalled)
    const enforcementThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const hotEnforcement = await OpenclawConversation.findAll({
      where: {
        priority_tier: 'hot',
        current_stage: { [Op.gte]: 3 },
        status: { [Op.in]: ['active', 'stalled'] },
        id: { [Op.notIn]: stalledConversations.map(c => c.id) }, // avoid duplicates
      },
      order: [['current_stage', 'DESC']],
      limit: maxFollowUps,
    });

    // Filter to only those without a recent follow-up
    const enforcedConversations: typeof hotEnforcement = [];
    for (const conv of hotEnforcement) {
      const recentFollowUp = await ResponseQueue.count({
        where: {
          response_type: 'follow_up',
          status: { [Op.in]: ['draft', 'approved', 'posted'] },
          created_at: { [Op.gte]: enforcementThreshold },
          details: { conversation_id: conv.id },
        },
      });
      if (recentFollowUp === 0) {
        enforcedConversations.push(conv);
      }
    }

    // Merge: stalled first, then enforced (deduplicated above)
    const allConversations = [...stalledConversations, ...enforcedConversations].slice(0, maxFollowUps);

    let followUpsCreated = 0;
    const enforcedIds = new Set(enforcedConversations.map(c => c.id));
    for (const conversation of allConversations) {
      try {
        // Count existing follow-ups for this conversation at this stage
        const existingFollowUpCount = await ResponseQueue.count({
          where: {
            details: { conversation_id: conversation.id },
            response_type: 'follow_up',
            status: { [Op.in]: ['draft', 'approved', 'posted'] },
          },
        });

        // Get the latest engagement event for context
        const latestEvent = await EngagementEvent.findOne({
          where: { conversation_id: conversation.id },
          order: [['created_at', 'DESC']],
        });

        if (!latestEvent) continue;

        // Get stage-appropriate prompt guidance
        const stagePrompt = CONVERSION_STAGE_PROMPTS[conversation.current_stage] || CONVERSION_STAGE_PROMPTS[2];

        const prompt = `Generate a subtle follow-up message for a ${conversation.platform} conversation at Stage ${conversation.current_stage}.

Stage guidance:
${stagePrompt}

The conversation has been silent for 48+ hours. The last engagement was from ${latestEvent.user_name}${latestEvent.user_title ? ` (${latestEvent.user_title})` : ''}.

Their last message: "${(latestEvent.content || '').slice(0, 300)}"

Generate a brief, natural follow-up (50-80 words) that:
- Is appropriate for conversation stage ${conversation.current_stage}
- References a recent development on the topic
- Does NOT feel like a chase or pushy
- No pitching, no links (unless stage 5+)
- Do NOT mention "Colaberry"`;

        const result = await generateContent(prompt, 'gpt-4o');
        let followUpText = result.body.replace(/colaberry/gi, '[company]');

        // Validate follow-up content against safety rules
        const followUpValidation = validateFollowUpContent(followUpText, conversation.current_stage, existingFollowUpCount);
        if (!followUpValidation.passed) {
          actions.push({
            campaign_id: null,
            action: 'follow_up_blocked',
            reason: followUpValidation.reason || 'Validation failed',
            confidence: 1.0,
            before_state: { conversation_id: conversation.id, stage: conversation.current_stage },
            after_state: { blocked: true },
            result: 'skipped',
            entity_type: 'response_queue',
          });
          continue;
        }

        // Also validate against stage content rules
        const stageValidation = validateContentForStage(followUpText, conversation.current_stage);
        if (!stageValidation.passed) {
          actions.push({
            campaign_id: null,
            action: 'follow_up_blocked',
            reason: stageValidation.reason || 'Stage validation failed',
            confidence: 1.0,
            before_state: { conversation_id: conversation.id, stage: conversation.current_stage },
            after_state: { blocked: true },
            result: 'skipped',
            entity_type: 'response_queue',
          });
          continue;
        }

        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        await ResponseQueue.create({
          engagement_id: latestEvent.id,
          response_type: 'follow_up',
          response_text: followUpText,
          platform: conversation.platform,
          status: 'draft',
          expires_at: expiresAt,
          details: {
            trigger: enforcedIds.has(conversation.id) ? 'enforced_follow_up' : 'stalled_conversation',
            urgency_level: conversation.priority_tier,
            conversation_id: conversation.id,
            conversation_stage: conversation.current_stage,
            ...(enforcedIds.has(conversation.id) && {
              enforced: true,
              enforcement_reason: 'high_score_no_followup',
            }),
          },
        });

        await latestEvent.update({ status: 'following_up', updated_at: new Date() });

        followUpsCreated++;
        actions.push({
          campaign_id: null,
          action: 'create_follow_up',
          reason: `Follow-up for stalled ${conversation.priority_tier} conversation at stage ${conversation.current_stage} on ${conversation.platform}`,
          confidence: 0.75,
          before_state: {
            conversation_id: conversation.id,
            stage: conversation.current_stage,
            priority_tier: conversation.priority_tier,
          },
          after_state: { response_type: 'follow_up', status: 'draft' },
          result: 'success',
          entity_type: 'response_queue',
        });
      } catch (genErr: any) {
        errors.push(`Failed to create follow-up for conversation ${conversation.id}: ${genErr.message}`);
      }
    }

    actions.push({
      campaign_id: null,
      action: 'summary',
      reason: `Follow-up run complete`,
      confidence: 1.0,
      before_state: { stalled_conversations: stalledConversations.length, expired_drafts: expiredDrafts.length },
      after_state: { follow_ups_created: followUpsCreated },
      result: 'success',
      entity_type: 'response_queue',
    });
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: 'FollowUpAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter(a => a.action === 'create_follow_up').length,
  };
}
