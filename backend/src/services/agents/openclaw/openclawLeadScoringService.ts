import { Lead, OpportunityScore, OpenclawConversation, EngagementEvent } from '../../../models';

export type PriorityTier = 'hot' | 'warm' | 'cold';

export interface LeadScoreResult {
  score: number;
  priority_tier: PriorityTier;
  components: Record<string, number>;
}

const SENIORITY_WEIGHTS: Record<string, number> = {
  c_level: 15,
  vp: 12,
  director: 9,
  manager: 6,
  ic: 3,
  unknown: 0,
};

const PLATFORM_WEIGHTS: Record<string, number> = {
  linkedin: 10,
  linkedin_comments: 10,
  producthunt: 7,
  medium: 6,
  devto: 5,
  hashnode: 5,
  discourse: 5,
  twitter: 5,
  bluesky: 5,
  youtube: 5,
  reddit: 4,
  quora: 4,
  hackernews: 4,
  facebook_groups: 3,
};

/**
 * Compute a composite lead score from conversation history and engagement.
 * Pure function -no DB writes. Returns score 0-100 and priority tier.
 */
export function computeLeadScore(
  conversations: Array<{ current_stage: number; platform: string }>,
  engagements: Array<{ engagement_type: string; role_seniority?: string; updated_at?: Date | string }>,
): LeadScoreResult {
  // Engagement depth (0-25): reply=3, comment=2, reaction/mention/share=1
  const engagementTypeWeights: Record<string, number> = { reply: 3, comment: 2, mention: 1, reaction: 1, share: 1 };
  let engagementRaw = 0;
  for (const e of engagements) {
    engagementRaw += engagementTypeWeights[e.engagement_type] || 1;
  }
  const engagement_depth = Math.min(25, engagementRaw);

  // Stage weight (0-25): highest conversation stage × 3.125
  const highestStage = conversations.length > 0
    ? Math.max(...conversations.map(c => c.current_stage))
    : 0;
  const stage_weight = Math.min(25, highestStage * 3.125);

  // Seniority weight (0-15): highest seniority across engagements
  let maxSeniority = 0;
  for (const e of engagements) {
    const w = SENIORITY_WEIGHTS[e.role_seniority || 'unknown'] || 0;
    if (w > maxSeniority) maxSeniority = w;
  }
  const seniority_weight = maxSeniority;

  // Platform weight (0-10): highest platform weight across conversations
  let maxPlatformWeight = 0;
  for (const c of conversations) {
    const w = PLATFORM_WEIGHTS[c.platform] || 4;
    if (w > maxPlatformWeight) maxPlatformWeight = w;
  }
  const platform_weight = Math.min(10, maxPlatformWeight);

  // Recency (0-15): based on most recent engagement
  let recency = 0;
  if (engagements.length > 0) {
    const dates = engagements
      .map(e => e.updated_at ? new Date(e.updated_at).getTime() : 0)
      .filter(d => d > 0);
    if (dates.length > 0) {
      const hoursAgo = (Date.now() - Math.max(...dates)) / 3600000;
      if (hoursAgo < 24) recency = 15;
      else if (hoursAgo < 48) recency = 10;
      else if (hoursAgo < 168) recency = 5;
    }
  }

  // Multi-platform bonus (0-10): 5pt per extra platform, cap 10
  const uniquePlatforms = new Set(conversations.map(c => c.platform)).size;
  const multi_platform_bonus = Math.min(10, Math.max(0, (uniquePlatforms - 1) * 5));

  const score = Math.min(100, Math.round(
    engagement_depth + stage_weight + seniority_weight + platform_weight + recency + multi_platform_bonus,
  ));

  let priority_tier: PriorityTier = 'cold';
  if (score >= 70) priority_tier = 'hot';
  else if (score >= 40) priority_tier = 'warm';

  return {
    score,
    priority_tier,
    components: { engagement_depth, stage_weight, seniority_weight, platform_weight, recency, multi_platform_bonus },
  };
}

/**
 * Fetch data and update Lead.lead_score + Lead.lead_temperature + OpportunityScore.
 * Called after conversation state changes.
 */
export async function updateLeadAndOpportunityScore(leadId: number): Promise<LeadScoreResult | null> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) return null;

  const conversations = await OpenclawConversation.findAll({
    where: { lead_id: leadId },
    attributes: ['current_stage', 'platform'],
    raw: true,
  });

  const engagements = await EngagementEvent.findAll({
    where: { lead_id: leadId },
    attributes: ['engagement_type', 'role_seniority', 'updated_at'],
    raw: true,
  });

  const result = computeLeadScore(conversations as any, engagements as any);

  // Update Lead
  await lead.update({
    lead_score: result.score,
    lead_temperature: result.priority_tier,
  });

  // Upsert OpportunityScore
  const existing = await OpportunityScore.findOne({ where: { lead_id: leadId } });
  const daysInPipeline = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000);

  const lastActivity = engagements.length > 0
    ? Math.max(...engagements.map((e: any) => e.updated_at ? new Date(e.updated_at).getTime() : 0))
    : Date.now();
  const daysSinceLastActivity = Math.floor((Date.now() - lastActivity) / 86400000);

  const scoreData = {
    lead_id: leadId,
    score: result.score,
    opportunity_level: result.priority_tier === 'hot' ? 'qualified_opportunity' : result.priority_tier === 'warm' ? 'developing_prospect' : 'cold_prospect',
    score_components: result.components,
    stall_risk: daysSinceLastActivity > 7 ? 'high' : daysSinceLastActivity > 3 ? 'medium' : 'none',
    days_in_pipeline: daysInPipeline,
    days_since_last_activity: daysSinceLastActivity,
    conversion_probability: Math.min(1, result.score / 100),
    projected_revenue: result.priority_tier === 'hot' ? 5000 : result.priority_tier === 'warm' ? 2500 : 0,
    score_updated_at: new Date(),
    updated_at: new Date(),
  };

  if (existing) {
    await existing.update(scoreData);
  } else {
    await OpportunityScore.create(scoreData as any);
  }

  return result;
}
