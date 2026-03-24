import { Op } from 'sequelize';
import EngagementEvent from '../../../models/EngagementEvent';
import ResponseQueue from '../../../models/ResponseQueue';
import { generateContent } from './openclawAiHelper';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * FollowUpAgent — generates subtle follow-up drafts for high-intent
 * conversations that went silent after our reply (48h+ no activity).
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
  const minIntentScore = config.min_intent_score || 0.6;
  const maxFollowUps = config.max_follow_ups_per_run || 3;
  const staleHours = config.stale_hours || 48;

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

    // 2. Find high-intent engagements that went silent
    const staleThreshold = new Date(Date.now() - staleHours * 60 * 60 * 1000);
    const staleEngagements = await EngagementEvent.findAll({
      where: {
        status: 'responded',
        intent_score: { [Op.gte]: minIntentScore },
        updated_at: { [Op.lt]: staleThreshold },
      },
      order: [['intent_score', 'DESC']],
      limit: maxFollowUps,
    });

    let followUpsCreated = 0;
    for (const engagement of staleEngagements) {
      try {
        // Check if we already have a follow_up in queue for this engagement
        const existingFollowUp = await ResponseQueue.findOne({
          where: {
            engagement_id: engagement.id,
            response_type: 'follow_up',
            status: { [Op.in]: ['draft', 'approved'] },
          },
        });
        if (existingFollowUp) continue;

        const prompt = `Generate a subtle follow-up message for a ${engagement.platform} conversation that went quiet. The original engagement was from ${engagement.user_name}${engagement.user_title ? ` (${engagement.user_title})` : ''}.

Their original comment: "${(engagement.content || '').slice(0, 300)}"

Generate a brief, natural follow-up (50-80 words) that:
- References a recent development on the topic
- Does NOT feel like a chase or pushy
- Example patterns: "Saw an update on this topic...", "Curious if you explored X further"
- No pitching, no links
- Do NOT mention "Colaberry"`;

        const result = await generateContent(prompt, 'gpt-4o');
        let followUpText = result.body.replace(/colaberry/gi, '[company]');

        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        await ResponseQueue.create({
          engagement_id: engagement.id,
          response_type: 'follow_up',
          response_text: followUpText,
          platform: engagement.platform,
          status: 'draft',
          expires_at: expiresAt,
        });

        await engagement.update({ status: 'following_up', updated_at: new Date() });

        followUpsCreated++;
        actions.push({
          campaign_id: null,
          action: 'create_follow_up',
          reason: `Follow-up for ${engagement.user_name} (intent: ${engagement.intent_score}, silent ${staleHours}h+)`,
          confidence: 0.75,
          before_state: { engagement_id: engagement.id, intent_score: engagement.intent_score },
          after_state: { response_type: 'follow_up', status: 'draft' },
          result: 'success',
          entity_type: 'response_queue',
        });
      } catch (genErr: any) {
        errors.push(`Failed to create follow-up for engagement ${engagement.id}: ${genErr.message}`);
      }
    }

    actions.push({
      campaign_id: null,
      action: 'summary',
      reason: `Follow-up run complete`,
      confidence: 1.0,
      before_state: { stale_engagements: staleEngagements.length, expired_drafts: expiredDrafts.length },
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
