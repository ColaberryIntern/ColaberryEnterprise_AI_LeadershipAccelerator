import { Op } from 'sequelize';
import { Campaign, ICPProfile, LeadRecommendation } from '../../models';
import { discoverLeadsForCampaign, bulkApproveRecommendations } from '../leadIntelligenceService';
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

/**
 * Weekly Lead Enrollment Agent
 *
 * Automatically approves high-scoring Apollo lead recommendations (fit >= 50)
 * and enrolls up to 300 into the Cold Outbound Phase 1 campaign every Monday.
 *
 * If the pipeline is running low (< 200 pending), triggers discovery first.
 *
 * Schedule: Monday 9 AM CT (14:00 UTC)
 */
export async function runWeeklyLeadEnrollmentAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  const maxEnrollment = config.max_weekly_enrollment || 300;
  const minFitScore = config.min_fit_score || 50;

  // Find the Phase 1 cold outbound campaign
  const campaign = await Campaign.findOne({
    where: { type: 'cold_outbound', status: 'active' },
    include: [{ model: ICPProfile, as: 'icpProfiles' }],
  }) as any;

  if (!campaign) {
    actions.push({
      campaign_id: null as any,
      action: 'no_campaign_found',
      reason: 'No active cold_outbound campaign found',
      confidence: 1.0,
      before_state: null,
      after_state: null,
      result: 'skipped',
    });
    return {
      agent_name: 'ApolloWeeklyEnrollmentAgent',
      campaigns_processed: 0,
      actions_taken: actions,
      errors,
      duration_ms: Date.now() - startTime,
    };
  }

  try {
    // Count pending recommendations with sufficient fit score
    const pendingCount = await LeadRecommendation.count({
      where: {
        campaign_id: campaign.id,
        status: 'pending',
        program_fit_score: { [Op.gte]: minFitScore },
      },
    });

    // If pipeline is low and campaign has ICP profiles, trigger discovery
    if (pendingCount < 200 && campaign.icpProfiles?.length > 0) {
      try {
        const discoveryResult = await discoverLeadsForCampaign(campaign.id, {
          max_leads_per_profile: config.max_discovery_per_profile || 500,
          min_program_fit_score: minFitScore,
        });
        actions.push({
          campaign_id: campaign.id,
          action: 'pipeline_replenished',
          reason: `Pipeline low (${pendingCount} pending). Discovered ${discoveryResult.recommendations_created} new leads from ${discoveryResult.profiles_scanned} profiles.`,
          confidence: 1.0,
          before_state: { pending_count: pendingCount },
          after_state: {
            recommendations_created: discoveryResult.recommendations_created,
            profiles_scanned: discoveryResult.profiles_scanned,
          },
          result: 'success',
        });
      } catch (err: any) {
        errors.push(`Discovery failed: ${err.message}`);
        actions.push({
          campaign_id: campaign.id,
          action: 'pipeline_replenish_failed',
          reason: err.message,
          confidence: 1.0,
          before_state: { pending_count: pendingCount },
          after_state: null,
          result: 'failed',
        });
      }
    }

    // Select top recommendations by fit score
    const topRecommendations = await LeadRecommendation.findAll({
      where: {
        campaign_id: campaign.id,
        status: 'pending',
        program_fit_score: { [Op.gte]: minFitScore },
      },
      order: [['program_fit_score', 'DESC']],
      limit: maxEnrollment,
      attributes: ['id'],
    });

    if (topRecommendations.length === 0) {
      actions.push({
        campaign_id: campaign.id,
        action: 'no_eligible_leads',
        reason: `No pending recommendations with fit score >= ${minFitScore}`,
        confidence: 1.0,
        before_state: null,
        after_state: null,
        result: 'skipped',
      });
    } else {
      // Bulk approve — null adminUserId triggers 'system-auto' fallback
      const ids = topRecommendations.map((r) => r.id);
      const result = await bulkApproveRecommendations(ids, null);

      actions.push({
        campaign_id: campaign.id,
        action: 'weekly_enrollment_completed',
        reason: `Enrolled ${result.approved} leads (${result.failed} failed) from ${ids.length} candidates`,
        confidence: 1.0,
        before_state: { candidates: ids.length },
        after_state: {
          approved: result.approved,
          failed: result.failed,
        },
        result: result.approved > 0 ? 'success' : 'failed',
      });

      if (result.errors.length > 0) {
        errors.push(...result.errors.slice(0, 20));
      }

      console.log(
        `[ApolloWeeklyEnrollment] Campaign ${campaign.name}: ${result.approved} enrolled, ${result.failed} failed`,
      );
    }
  } catch (err: any) {
    errors.push(`Campaign ${campaign.name}: ${err.message}`);
    actions.push({
      campaign_id: campaign.id,
      action: 'weekly_enrollment_failed',
      reason: err.message,
      confidence: 1.0,
      before_state: null,
      after_state: null,
      result: 'failed',
    });
  }

  return {
    agent_name: 'ApolloWeeklyEnrollmentAgent',
    campaigns_processed: campaign ? 1 : 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
