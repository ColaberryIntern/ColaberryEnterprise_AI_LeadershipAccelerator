import { Op } from 'sequelize';
import OpenclawSignal from '../../../models/OpenclawSignal';
import EngagementEvent from '../../../models/EngagementEvent';
import LinkedInActionQueue from '../../../models/LinkedInActionQueue';
import { generateContent } from './openclawAiHelper';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * LinkedInFlowAgent -generates LinkedIn action suggestions:
 * comments, connection requests, DM follow-ups.
 * All actions created as 'pending' -NEVER auto-executed.
 *
 * Schedule: 0 9,15 * * 1-5 (9am + 3pm UTC, weekdays)
 */
export async function runLinkedInFlowAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxComments = config.max_comments || 5;
  const maxConnections = config.max_connections || 3;
  const maxDMs = config.max_dms || 2;

  try {
    // 1. Comment suggestions -find LinkedIn signals worth engaging with
    const recentLinkedInSignals = await OpenclawSignal.findAll({
      where: {
        platform: 'linkedin',
        status: { [Op.in]: ['scored', 'new'] },
        created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      order: [['created_at', 'DESC']],
      limit: maxComments,
    });

    for (const signal of recentLinkedInSignals) {
      try {
        // Skip if action already queued for this signal
        const existing = await LinkedInActionQueue.findOne({
          where: {
            source_signal_id: signal.id,
            action_type: 'comment',
            status: { [Op.in]: ['pending', 'completed'] },
          },
        });
        if (existing) continue;

        const prompt = `Generate a thoughtful LinkedIn comment (50-100 words) for this post:

Title: ${(signal as any).title || 'LinkedIn Post'}
Summary: ${((signal as any).ai_summary || '').slice(0, 400)}

Requirements:
- Add genuine value or a unique perspective
- Reference a specific point from the post
- Be conversational, not salesy
- Do NOT mention "Colaberry"
- End with an insight or question`;

        const result = await generateContent(prompt, 'gpt-4o');
        const commentText = result.body.replace(/colaberry/gi, '[company]');

        await LinkedInActionQueue.create({
          action_type: 'comment',
          target_post_url: (signal as any).url || null,
          suggested_text: commentText,
          context: `Signal: ${(signal as any).title || (signal as any).url}`,
          priority: 5,
          status: 'pending',
          source_signal_id: signal.id,
        });

        actions.push({
          campaign_id: null,
          action: 'suggest_comment',
          reason: `LinkedIn comment suggestion for signal "${(signal as any).title?.slice(0, 60) || signal.id}"`,
          confidence: 0.8,
          before_state: { signal_id: signal.id },
          after_state: { action_type: 'comment', status: 'pending' },
          result: 'success',
          entity_type: 'linkedin_action',
        });
      } catch (genErr: any) {
        errors.push(`Failed to generate comment for signal ${signal.id}: ${genErr.message}`);
      }
    }

    // 2. Connection requests -high-intent LinkedIn engagers
    const highIntentLinkedIn = await EngagementEvent.findAll({
      where: {
        platform: { [Op.in]: ['linkedin', 'devto', 'hashnode'] },
        intent_score: { [Op.gte]: 0.6 },
        role_seniority: { [Op.in]: ['director', 'vp', 'c_level'] },
        status: { [Op.in]: ['new', 'responded'] },
      },
      order: [['intent_score', 'DESC']],
      limit: maxConnections,
    });

    for (const engagement of highIntentLinkedIn) {
      try {
        const existing = await LinkedInActionQueue.findOne({
          where: {
            source_engagement_id: engagement.id,
            action_type: 'connection_request',
            status: { [Op.in]: ['pending', 'completed'] },
          },
        });
        if (existing) continue;

        const prompt = `Generate a personalized LinkedIn connection request (max 300 characters) for:

Name: ${engagement.user_name}
Title: ${engagement.user_title || 'Unknown'}
Company: ${engagement.company_detected || 'Unknown'}
Context: They engaged with our content about: "${(engagement.content || '').slice(0, 200)}"

Requirements:
- Reference their specific engagement or role
- Be genuine, not salesy
- Under 300 characters
- Do NOT mention "Colaberry"`;

        const result = await generateContent(prompt, 'gpt-4o');
        const connectionMsg = result.body.replace(/colaberry/gi, '[company]').slice(0, 300);

        await LinkedInActionQueue.create({
          action_type: 'connection_request',
          target_user_name: engagement.user_name,
          target_user_title: engagement.user_title || undefined,
          suggested_text: connectionMsg,
          context: `High-intent engager (${engagement.intent_score}) -${engagement.role_seniority}`,
          priority: 8,
          status: 'pending',
          source_engagement_id: engagement.id,
        });

        actions.push({
          campaign_id: null,
          action: 'suggest_connection',
          reason: `Connection request for ${engagement.user_name} (${engagement.role_seniority}, intent: ${engagement.intent_score})`,
          confidence: 0.75,
          before_state: { engagement_id: engagement.id },
          after_state: { action_type: 'connection_request', status: 'pending' },
          result: 'success',
          entity_type: 'linkedin_action',
        });
      } catch (genErr: any) {
        errors.push(`Failed to generate connection request for engagement ${engagement.id}: ${genErr.message}`);
      }
    }

    // 3. DM follow-ups -for connected high-intent leads
    const dmCandidates = await EngagementEvent.findAll({
      where: {
        platform: { [Op.in]: ['linkedin'] },
        intent_score: { [Op.gte]: 0.7 },
        status: 'following_up',
      },
      order: [['intent_score', 'DESC']],
      limit: maxDMs,
    });

    for (const engagement of dmCandidates) {
      try {
        const existing = await LinkedInActionQueue.findOne({
          where: {
            source_engagement_id: engagement.id,
            action_type: 'dm_followup',
            status: { [Op.in]: ['pending', 'completed'] },
          },
        });
        if (existing) continue;

        const prompt = `Generate a brief LinkedIn DM follow-up (80-120 words) for:

Name: ${engagement.user_name}
Title: ${engagement.user_title || 'Unknown'}
Their engagement: "${(engagement.content || '').slice(0, 200)}"

Requirements:
- Reference their previous engagement
- Offer a specific, valuable resource or insight
- Include a soft call-to-action (e.g., "Happy to share more details")
- Do NOT mention "Colaberry"
- Be professional but warm`;

        const result = await generateContent(prompt, 'gpt-4o');
        const dmText = result.body.replace(/colaberry/gi, '[company]');

        await LinkedInActionQueue.create({
          action_type: 'dm_followup',
          target_user_name: engagement.user_name,
          target_user_title: engagement.user_title || undefined,
          suggested_text: dmText,
          context: `High-intent DM follow-up (${engagement.intent_score})`,
          priority: 9,
          status: 'pending',
          source_engagement_id: engagement.id,
        });

        actions.push({
          campaign_id: null,
          action: 'suggest_dm',
          reason: `DM follow-up for ${engagement.user_name} (intent: ${engagement.intent_score})`,
          confidence: 0.7,
          before_state: { engagement_id: engagement.id },
          after_state: { action_type: 'dm_followup', status: 'pending' },
          result: 'success',
          entity_type: 'linkedin_action',
        });
      } catch (genErr: any) {
        errors.push(`Failed to generate DM for engagement ${engagement.id}: ${genErr.message}`);
      }
    }

    actions.push({
      campaign_id: null,
      action: 'summary',
      reason: 'LinkedIn flow run complete',
      confidence: 1.0,
      before_state: {
        signals_scanned: recentLinkedInSignals.length,
        high_intent_engagers: highIntentLinkedIn.length,
        dm_candidates: dmCandidates.length,
      },
      after_state: {
        comments: actions.filter(a => a.action === 'suggest_comment').length,
        connections: actions.filter(a => a.action === 'suggest_connection').length,
        dms: actions.filter(a => a.action === 'suggest_dm').length,
      },
      result: 'success',
      entity_type: 'linkedin_action',
    });
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: 'LinkedInFlowAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter(a => a.action !== 'summary').length,
  };
}
