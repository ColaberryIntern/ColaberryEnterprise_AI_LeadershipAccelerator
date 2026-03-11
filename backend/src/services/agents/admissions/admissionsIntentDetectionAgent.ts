import { Op } from 'sequelize';
import { IntentScore, Visitor } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsIntentDetectionAgent';

// Admissions-specific intent thresholds
const INTENT_THRESHOLDS = {
  enrollment_ready: 80,
  high_intent: 60,
  engaged: 40,
  exploring: 20,
};

/**
 * Apply admissions-specific intent thresholds on IntentScore;
 * update recommended_next_action on AdmissionsMemory.
 * Schedule: every 10 minutes.
 */
export async function runAdmissionsIntentDetectionAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Find visitors with intent scores
    const intentScores = await IntentScore.findAll({
      where: { score: { [Op.gte]: INTENT_THRESHOLDS.exploring } },
      order: [['score', 'DESC']],
      limit: 100,
    });

    for (const intent of intentScores) {
      const visitorId = intent.visitor_id;
      const score = intent.score;

      const memory = await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } });
      if (!memory) continue;

      // Determine recommended action
      let nextAction: string;
      if (score >= INTENT_THRESHOLDS.enrollment_ready) {
        nextAction = 'Offer direct enrollment assistance — visitor is ready to commit';
      } else if (score >= INTENT_THRESHOLDS.high_intent) {
        nextAction = 'Suggest booking a strategy call — visitor is seriously evaluating';
      } else if (score >= INTENT_THRESHOLDS.engaged) {
        nextAction = 'Share relevant case studies or ROI data — visitor is comparing options';
      } else {
        nextAction = 'Provide educational content — visitor is exploring';
      }

      const oldAction = memory.recommended_next_action;
      if (oldAction !== nextAction) {
        await memory.update({
          recommended_next_action: nextAction,
          last_updated: new Date(),
        });

        actions.push({
          campaign_id: '',
          action: 'intent_action_updated',
          reason: `Visitor ${visitorId} intent score ${score}: ${nextAction}`,
          confidence: 0.8,
          before_state: { recommended_next_action: oldAction },
          after_state: { recommended_next_action: nextAction, score },
          result: 'success',
          entity_type: 'system',
          entity_id: memory.id,
        });
      }
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'intent_detection',
      result: 'success',
      details: { scores_checked: intentScores.length, actions_updated: actions.length },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: actions.length,
  };
}
