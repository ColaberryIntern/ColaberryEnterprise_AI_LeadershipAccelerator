import { Lead } from '../../models';
import { Op } from 'sequelize';
import { classifyAndRouteLead } from '../offerRouterService';
import type { AgentAction, AgentExecutionResult } from './types';

/**
 * Offer Routing Agent
 * Scans leads with advisory data but no offer classification.
 * Runs every 6 hours.
 */
export async function runOfferRoutingAgent(
  _agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Find leads with advisory data but no offer classification
    const unclassified = await Lead.findAll({
      where: {
        recommended_offer: { [Op.is]: null },
        [Op.or]: [
          { advisory_session_id: { [Op.ne]: null } },
          { idea_input: { [Op.ne]: null } },
          { maturity_score: { [Op.gt]: 0 } },
        ],
        status: { [Op.ne]: 'unsubscribed' },
      } as any,
      limit: 50,
      order: [['created_at', 'DESC']],
    });

    for (const lead of unclassified) {
      try {
        const score = await classifyAndRouteLead(lead.id);
        if (score) {
          actions.push({
            campaign_id: null,
            action: 'lead_classified',
            reason: `${lead.name}: ${score.recommended_offer} (score: ${score.lead_score}, ${score.reasoning})`,
            confidence: score.lead_score / 100,
            before_state: { recommended_offer: null },
            after_state: { recommended_offer: score.recommended_offer, lead_score: score.lead_score },
            result: 'success',
          });
        }
      } catch (err: any) {
        errors.push(`Lead ${lead.id}: ${err.message}`);
      }
    }

    // Also re-score leads that were classified more than 7 days ago
    const stale = await Lead.findAll({
      where: {
        recommended_offer: { [Op.ne]: null },
        advisory_session_id: { [Op.ne]: null },
      } as any,
      limit: 20,
      order: [['updated_at', 'ASC']],
    });

    for (const lead of stale) {
      try {
        await classifyAndRouteLead(lead.id);
      } catch { /* non-blocking */ }
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: 'OfferRoutingAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
