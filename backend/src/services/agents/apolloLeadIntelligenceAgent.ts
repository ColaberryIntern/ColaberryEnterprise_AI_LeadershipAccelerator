import { Campaign, ICPProfile } from '../../models';
import { discoverLeadsForCampaign } from '../leadIntelligenceService';
import type { AgentAction, AgentExecutionResult } from './types';

/**
 * Apollo Lead Intelligence Agent
 *
 * Discovers leads from Apollo for active autonomous campaigns with ICP profiles.
 * Creates lead recommendations pending admin approval — never adds leads directly.
 *
 * Schedule: every 6 hours
 */
export async function runApolloLeadIntelligenceAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  // Find active autonomous campaigns that have ICP profiles
  const campaigns = await Campaign.findAll({
    where: { status: 'active', campaign_mode: 'autonomous' },
    include: [{ model: ICPProfile, as: 'icpProfiles' }],
  }) as any[];

  const campaignsWithProfiles = campaigns.filter(
    (c: any) => c.icpProfiles?.length > 0,
  );

  for (const campaign of campaignsWithProfiles) {
    try {
      const result = await discoverLeadsForCampaign(campaign.id, {
        max_leads_per_profile: config.max_leads_per_profile || 50,
        min_program_fit_score: config.min_program_fit_score || 40,
        avg_deal_value: config.avg_deal_value || 25000,
      });

      actions.push({
        campaign_id: campaign.id,
        action: 'lead_discovery_completed',
        reason: `Discovered ${result.recommendations_created} leads from ${result.profiles_scanned} ICP profiles (${result.people_evaluated} evaluated)`,
        confidence: 1.0,
        before_state: null,
        after_state: {
          recommendations_created: result.recommendations_created,
          profiles_scanned: result.profiles_scanned,
          people_evaluated: result.people_evaluated,
        },
        result: result.recommendations_created > 0 ? 'success' : 'skipped',
      });
    } catch (err: any) {
      errors.push(`Campaign ${campaign.name}: ${err.message}`);
      actions.push({
        campaign_id: campaign.id,
        action: 'lead_discovery_failed',
        reason: err.message,
        confidence: 1.0,
        before_state: null,
        after_state: null,
        result: 'failed',
      });
    }
  }

  if (campaignsWithProfiles.length > 0) {
    const totalRecs = actions.reduce((sum, a) => sum + (a.after_state?.recommendations_created || 0), 0);
    console.log(`[ApolloLeadIntelligence] Processed ${campaignsWithProfiles.length} campaigns — ${totalRecs} recommendations created`);
  }

  return {
    agent_name: 'ApolloLeadIntelligenceAgent',
    campaigns_processed: campaignsWithProfiles.length,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
