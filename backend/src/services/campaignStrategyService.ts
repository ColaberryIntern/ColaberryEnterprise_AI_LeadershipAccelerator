import { Op } from 'sequelize';
import { Campaign, CampaignLead, Lead, InteractionOutcome } from '../models';
import { getRelevantInsights } from './campaignKnowledgeService';

// ── Types ───────────────────────────────────────────────────────────────

export interface CampaignMatch {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  match_score: number; // 0-100
  reasons: string[];
  status: string;
}

export interface LeadStrategyProfile {
  lead_id: number;
  lead_name: string;
  current_campaigns: string[];
  recommended_campaigns: CampaignMatch[];
  engagement_summary: {
    total_interactions: number;
    positive_interactions: number;
    engagement_rate: number;
  };
}

// ── Lead-Campaign Matching ──────────────────────────────────────────────

/**
 * Score all active campaigns against a lead's profile and return ranked recommendations.
 */
export async function recommendCampaignsForLead(leadId: number): Promise<LeadStrategyProfile> {
  const lead = await Lead.findByPk(leadId, { raw: true }) as any;
  if (!lead) throw new Error('Lead not found');

  // Get campaigns the lead is already enrolled in
  const enrollments = await CampaignLead.findAll({
    where: { lead_id: leadId },
    attributes: ['campaign_id'],
    raw: true,
  }) as any[];
  const enrolledIds = new Set(enrollments.map((e: any) => String(e.campaign_id)));

  // Get all active campaigns
  const campaigns = await Campaign.findAll({
    where: { status: 'active' },
    raw: true,
  }) as any[];

  // Get lead's interaction history
  const outcomes = await InteractionOutcome.findAll({
    where: { lead_id: leadId },
    raw: true,
  }) as any[];

  const totalInteractions = outcomes.length;
  const positiveInteractions = outcomes.filter((o: any) =>
    ['opened', 'clicked', 'replied', 'booked_meeting', 'converted'].includes(o.outcome),
  ).length;

  // Score each campaign
  const matches: CampaignMatch[] = [];

  for (const c of campaigns) {
    if (enrolledIds.has(String(c.id))) continue; // Skip already enrolled

    const { score, reasons } = scoreCampaignFit(lead, c);
    if (score > 0) {
      matches.push({
        campaign_id: c.id,
        campaign_name: c.name,
        campaign_type: c.type,
        match_score: score,
        reasons,
        status: c.status,
      });
    }
  }

  // Sort by match score descending
  matches.sort((a, b) => b.match_score - a.match_score);

  return {
    lead_id: leadId,
    lead_name: lead.name,
    current_campaigns: [...enrolledIds],
    recommended_campaigns: matches.slice(0, 10),
    engagement_summary: {
      total_interactions: totalInteractions,
      positive_interactions: positiveInteractions,
      engagement_rate: totalInteractions > 0 ? positiveInteractions / totalInteractions : 0,
    },
  };
}

/**
 * Find the best leads for a given campaign based on profile matching.
 */
export async function recommendLeadsForCampaign(
  campaignId: string,
  limit: number = 25,
): Promise<Array<{ lead_id: number; name: string; score: number; reasons: string[] }>> {
  const campaign = await Campaign.findByPk(campaignId, { raw: true }) as any;
  if (!campaign) throw new Error('Campaign not found');

  // Get already enrolled lead IDs
  const enrolled = await CampaignLead.findAll({
    where: { campaign_id: campaignId },
    attributes: ['lead_id'],
    raw: true,
  }) as any[];
  const enrolledIds = new Set(enrolled.map((e: any) => e.lead_id));

  // Get available leads
  const leads = await Lead.findAll({
    where: {
      status: { [Op.ne]: 'unsubscribed' },
      pipeline_stage: { [Op.notIn]: ['enrolled', 'lost'] },
    },
    raw: true,
  }) as any[];

  const scored = leads
    .filter((l: any) => !enrolledIds.has(l.id))
    .map((l: any) => {
      const { score, reasons } = scoreCampaignFit(l, campaign);
      return { lead_id: l.id, name: l.name, score, reasons };
    })
    .filter((r) => r.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

// ── Scoring Logic ───────────────────────────────────────────────────────

function scoreCampaignFit(
  lead: any,
  campaign: any,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const targeting = campaign.targeting_criteria || {};

  // 1. Industry match (25 points)
  if (targeting.industries?.length && lead.industry) {
    const leadIndustry = lead.industry.toLowerCase();
    const match = targeting.industries.some((i: string) =>
      leadIndustry.includes(i.toLowerCase()) || i.toLowerCase().includes(leadIndustry),
    );
    if (match) {
      score += 25;
      reasons.push(`Industry match: ${lead.industry}`);
    }
  }

  // 2. Title/seniority match (20 points)
  if (targeting.title_patterns?.length && lead.title) {
    const leadTitle = lead.title.toLowerCase();
    const match = targeting.title_patterns.some((t: string) =>
      leadTitle.includes(t.toLowerCase()),
    );
    if (match) {
      score += 20;
      reasons.push(`Title match: ${lead.title}`);
    }
  }

  // 3. Company size match (15 points)
  if (lead.employee_count || lead.company_size) {
    const size = lead.employee_count || parseCompanySize(lead.company_size);
    if (size && targeting.company_size_min && targeting.company_size_max) {
      if (size >= targeting.company_size_min && size <= targeting.company_size_max) {
        score += 15;
        reasons.push(`Company size (${size}) within target range`);
      }
    }
  }

  // 4. Lead score (15 points)
  if (lead.lead_score) {
    if (lead.lead_score >= 70) {
      score += 15;
      reasons.push(`High lead score: ${lead.lead_score}`);
    } else if (lead.lead_score >= 40) {
      score += 8;
      reasons.push(`Moderate lead score: ${lead.lead_score}`);
    }
  }

  // 5. Lead source type match (10 points)
  if (targeting.lead_source_types?.length && lead.lead_source_type) {
    if (targeting.lead_source_types.includes(lead.lead_source_type)) {
      score += 10;
      reasons.push(`Source type match: ${lead.lead_source_type}`);
    }
  }

  // 6. Temperature/engagement (10 points)
  if (lead.lead_temperature === 'hot') {
    score += 10;
    reasons.push('Hot lead temperature');
  } else if (lead.lead_temperature === 'warm') {
    score += 5;
    reasons.push('Warm lead temperature');
  }

  // 7. Has phone for voice campaigns (5 points)
  const channelConfig = campaign.channel_config || {};
  if (channelConfig.voice?.enabled && lead.phone) {
    score += 5;
    reasons.push('Has phone number for voice outreach');
  }

  return { score: Math.min(score, 100), reasons };
}

function parseCompanySize(sizeStr: string | undefined): number | null {
  if (!sizeStr) return null;
  const ranges: Record<string, number> = {
    '1-10': 5, '11-50': 30, '51-200': 125, '201-500': 350,
    '501-1000': 750, '1001-5000': 3000, '5001-10000': 7500, '10001+': 15000,
  };
  return ranges[sizeStr] || null;
}
