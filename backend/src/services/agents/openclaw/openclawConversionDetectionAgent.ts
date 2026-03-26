import { Op } from 'sequelize';
import OpenclawConversation from '../../../models/OpenclawConversation';
import RevenueOpportunity from '../../../models/RevenueOpportunity';
import ResponseQueue from '../../../models/ResponseQueue';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * ConversionDetectionAgent -detects conversations ready for conversion
 * and creates RevenueOpportunity records for pipeline tracking.
 *
 * Logic:
 * 1. Find conversations at stage 5 (interest expressed)
 * 2. Check if call/link was offered (ResponseQueue entries at stage 5)
 * 3. If offered and positive response → advance to stage 6
 * 4. Create RevenueOpportunity at stage 6 with full attribution chain
 *
 * Schedule: 0 *\/4 * * * (every 4 hours)
 */
export async function runConversionDetectionAgent(
  _agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // 1. Find active conversations at stage 5 (interest expressed)
    const stage5Conversations = await OpenclawConversation.findAll({
      where: {
        current_stage: 5,
        status: 'active',
      },
    });

    let conversionsDetected = 0;
    let opportunitiesCreated = 0;

    for (const conversation of stage5Conversations) {
      try {
        // 2. Check if we already offered a call/link (look for our follow-up at stage 5)
        const offeredResponse = await ResponseQueue.findOne({
          where: {
            platform: conversation.platform,
            status: { [Op.in]: ['posted', 'approved'] },
            details: { conversation_id: conversation.id },
          },
        });

        // Check conversion signals -high confidence signals indicate positive response
        const signals = conversation.conversion_signals || [];
        const highConfidenceSignals = signals.filter(s => s.confidence >= 0.8);

        // Advance to stage 6 if: we offered AND they have high-confidence signals
        // OR if they have very high confidence signals regardless (e.g., "sign me up")
        const veryHighSignals = signals.filter(s => s.confidence >= 0.9);
        const shouldAdvance = (offeredResponse && highConfidenceSignals.length > 0)
          || veryHighSignals.length > 0;

        if (shouldAdvance) {
          // Advance conversation to stage 6
          const stageHistory = conversation.stage_history || [];
          stageHistory.push({
            stage: 6,
            timestamp: new Date().toISOString(),
            trigger: 'conversion_detection_agent',
          });

          await conversation.update({
            current_stage: 6,
            stage_history: stageHistory,
            updated_at: new Date(),
          });

          conversionsDetected++;

          // 4. Create RevenueOpportunity if none exists
          const existingOpp = await RevenueOpportunity.findOne({
            where: {
              entity_type: 'openclaw_conversation',
              entity_id: conversation.id,
            },
          });

          if (!existingOpp) {
            await RevenueOpportunity.create({
              opportunity_type: 'new_segment',
              entity_type: 'openclaw_conversation',
              entity_id: conversation.id,
              title: `OpenClaw conversion: ${conversation.platform} conversation stage 6`,
              description: `Conversation reached conversion-ready stage. Signals: ${highConfidenceSignals.map(s => s.signal).join(', ')}`,
              estimated_value: conversation.priority_tier === 'hot' ? 5000 : 2500,
              confidence: Math.max(...signals.map(s => s.confidence), 0.5),
              urgency: conversation.priority_tier === 'hot' ? 'high' : 'medium',
              status: 'detected',
              source_channel: 'openclaw',
              attribution_chain: {
                signal_id: conversation.first_signal_id,
                response_id: conversation.first_response_id,
                conversation_id: conversation.id,
                lead_id: conversation.lead_id,
                platform: conversation.platform,
                conversion_signals: highConfidenceSignals,
              },
              lead_id: conversation.lead_id || undefined,
            } as any);

            opportunitiesCreated++;
          }

          actions.push({
            campaign_id: null,
            action: 'conversion_detected',
            reason: `Conversation ${conversation.id} advanced to stage 6 on ${conversation.platform}`,
            confidence: Math.max(...signals.map(s => s.confidence), 0.5),
            before_state: { stage: 5, signals: signals.length },
            after_state: { stage: 6, opportunity_created: !existingOpp },
            result: 'success',
            entity_type: 'openclaw_conversation',
          });
        }
      } catch (convErr: any) {
        errors.push(`Conversion detection failed for conversation ${conversation.id}: ${convErr.message}`);
      }
    }

    // 5. Update existing RevenueOpportunity status as conversations advance beyond 6
    const advancedConversations = await OpenclawConversation.findAll({
      where: {
        current_stage: { [Op.gte]: 7 },
        status: { [Op.in]: ['active', 'converted'] },
      },
    });

    for (const conversation of advancedConversations) {
      try {
        const opp = await RevenueOpportunity.findOne({
          where: {
            entity_type: 'openclaw_conversation',
            entity_id: conversation.id,
          },
        });

        if (opp) {
          const newStatus = conversation.current_stage === 8
            ? (conversation.status === 'converted' ? 'converted' : 'dismissed')
            : 'pursued';

          if (opp.status !== newStatus) {
            await opp.update({
              status: newStatus,
              deal_closed_at: conversation.current_stage === 8 ? new Date() : undefined,
              updated_at: new Date(),
            });
          }
        }
      } catch (oppErr: any) {
        errors.push(`Failed to update opportunity for conversation ${conversation.id}: ${oppErr.message}`);
      }
    }

    actions.push({
      campaign_id: null,
      action: 'summary',
      reason: `Conversion detection complete`,
      confidence: 1.0,
      before_state: { stage_5_conversations: stage5Conversations.length },
      after_state: { conversions_detected: conversionsDetected, opportunities_created: opportunitiesCreated },
      result: 'success',
      entity_type: 'openclaw_conversation',
    });
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: 'ConversionDetectionAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter(a => a.action === 'conversion_detected').length,
  };
}
