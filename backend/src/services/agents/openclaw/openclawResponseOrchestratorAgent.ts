import { Op } from 'sequelize';
import EngagementEvent from '../../../models/EngagementEvent';
import ResponseQueue from '../../../models/ResponseQueue';
import OpenclawResponse from '../../../models/OpenclawResponse';
import OpenclawSignal from '../../../models/OpenclawSignal';
import { generateContent } from './openclawAiHelper';
import { getStrategy, STRATEGY_PROMPT_INSTRUCTIONS, CONVERSION_STAGE_PROMPTS, detectConversationStage, validateContentForStage, type EngagementEvent as StrategyEngagementEvent } from './openclawPlatformStrategy';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * ResponseOrchestratorAgent — generates conversation follow-up drafts
 * for new high-intent engagement events.
 *
 * Schedule: 10,25,40,55 * * * * (every 15 min)
 */
export async function runResponseOrchestratorAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const minIntentScore = config.min_intent_score || 0.3;
  const maxPerRun = config.max_per_run || 5;
  const expiryHours = config.expiry_hours || 48;

  try {
    // 1. Find new engagement events above intent threshold
    const newEngagements = await EngagementEvent.findAll({
      where: {
        status: 'new',
        intent_score: { [Op.gte]: minIntentScore },
      },
      order: [['intent_score', 'DESC']],
      limit: maxPerRun,
    });

    for (const engagement of newEngagements) {
      try {
        // 2. Build conversation chain
        let conversationContext = '';

        if (engagement.response_id) {
          const response = await OpenclawResponse.findByPk(engagement.response_id);
          if (response) {
            const signal = await OpenclawSignal.findByPk(response.signal_id);
            if (signal) {
              conversationContext += `Original conversation topic: ${(signal as any).title || (signal as any).url}\n`;
              conversationContext += `Platform: ${signal.platform}\n\n`;
            }
            conversationContext += `Our response:\n${response.content.slice(0, 500)}\n\n`;
          }
        }

        conversationContext += `Their reply (${engagement.user_name}${engagement.user_title ? `, ${engagement.user_title}` : ''}):\n${engagement.content}\n`;

        // 3. Detect conversation stage from engagement history
        const priorEngagements = await EngagementEvent.findAll({
          where: { response_id: engagement.response_id, status: { [Op.ne]: 'new' } },
          order: [['created_at', 'ASC']],
        });
        const historyForStage: StrategyEngagementEvent[] = priorEngagements.map((e: any) => ({
          content: e.content,
          is_our_reply: e.is_our_reply || false,
          created_at: String(e.created_at),
        }));
        // Add the current engagement as their latest reply
        historyForStage.push({ content: engagement.content, is_our_reply: false, created_at: String(engagement.created_at) });
        const stage = detectConversationStage(historyForStage);

        // 4. Build strategy-aware + stage-aware prompt
        const strategy = getStrategy(engagement.platform);
        const strategyRules = STRATEGY_PROMPT_INSTRUCTIONS[strategy];
        const stagePrompt = CONVERSION_STAGE_PROMPTS[stage] || CONVERSION_STAGE_PROMPTS[1];

        const prompt = `You are an AI thought leadership expert engaging in a genuine conversation on ${engagement.platform}. Generate a thoughtful follow-up reply.

${strategyRules}

${stagePrompt}

Context:
${conversationContext}

Rules:
- Reference specific points from their reply
- Keep it under 150 words
- Be conversational and authentic
- Do NOT mention "Colaberry"`;

        const result = await generateContent(prompt, 'gpt-4o');
        let responseText = result.body.replace(/colaberry/gi, '[company]');

        // Stage-aware validation gate
        const stageValidation = validateContentForStage(responseText, stage);
        if (!stageValidation.passed) {
          console.warn(`[ResponseOrchestrator] Stage ${stage} validation failed: ${stageValidation.reason}`);
          errors.push(`Engagement ${engagement.id}: ${stageValidation.reason}`);
          await engagement.update({ status: 'responded', updated_at: new Date() });
          continue;
        }

        const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

        await ResponseQueue.create({
          engagement_id: engagement.id,
          response_type: 'reply',
          response_text: responseText,
          platform: engagement.platform,
          status: 'draft',
          expires_at: expiresAt,
        });

        // Update engagement status
        await engagement.update({ status: 'responded', updated_at: new Date() });

        actions.push({
          campaign_id: null,
          action: 'generate_reply',
          reason: `Generated reply for ${engagement.user_name} (intent: ${engagement.intent_score})`,
          confidence: 0.8,
          before_state: { engagement_id: engagement.id, intent_score: engagement.intent_score },
          after_state: { status: 'draft', expires_at: expiresAt.toISOString() },
          result: 'success',
          entity_type: 'response_queue',
        });
      } catch (genErr: any) {
        errors.push(`Failed to generate reply for engagement ${engagement.id}: ${genErr.message}`);
      }
    }

    actions.push({
      campaign_id: null,
      action: 'summary',
      reason: `Processed ${newEngagements.length} engagements`,
      confidence: 1.0,
      before_state: { total_new: newEngagements.length },
      after_state: { replies_generated: actions.filter(a => a.action === 'generate_reply').length },
      result: 'success',
      entity_type: 'response_queue',
    });
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: 'ResponseOrchestratorAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter(a => a.action === 'generate_reply').length,
  };
}
