import { Op, fn, col } from 'sequelize';
import { Campaign, ICPProfile, Lead, LeadRecommendation } from '../models';
import { searchApolloFromProfileBulk } from './icpProfileService';
import { importApolloResults, getApolloQuota } from './apolloService';
import { enrollLeadsInCampaign } from './campaignService';

// ── Program Fit Score ────────────────────────────────────────────────────

const EXEC_TITLES = /\b(chief|cto|cio|cdo|ceo|cfo|coo|vp|vice president|svp|evp|president|partner)\b/i;
const DIRECTOR_TITLES = /\b(director|head of|principal)\b/i;
const MANAGER_TITLES = /\b(manager|lead|senior)\b/i;

const AI_TECH_KEYWORDS = [
  'tensorflow', 'pytorch', 'python', 'databricks', 'snowflake', 'spark',
  'machine learning', 'deep learning', 'ai', 'data science', 'openai',
  'aws sagemaker', 'azure ml', 'google cloud ai', 'langchain', 'llm',
  'big data', 'data engineering', 'tableau', 'power bi',
];

const DIGITAL_TRANSFORM_KEYWORDS = /\b(digital transformation|innovation|modernization|automation|ai strategy|data-driven|digital)\b/i;

export function calculateProgramFitScore(
  person: Record<string, any>,
  icpProfile: any,
): number {
  let score = 0;
  const title = (person.title || '').toLowerCase();
  const orgIndustry = person.organization?.industry || person.industry || '';
  const orgSize = person.organization?.estimated_num_employees || person.employee_count || 0;
  const techStack: string[] = person.organization?.technology_names || person.technology_stack || [];

  // Title seniority (25 points max)
  if (EXEC_TITLES.test(title)) {
    score += 25;
  } else if (DIRECTOR_TITLES.test(title)) {
    score += 25;
  } else if (MANAGER_TITLES.test(title)) {
    score += 15;
  } else {
    score += 5;
  }

  // Company size (25 points max)
  if (orgSize >= 200 && orgSize <= 5000) {
    score += 25;
  } else if ((orgSize >= 50 && orgSize < 200) || (orgSize > 5000 && orgSize <= 10000)) {
    score += 15;
  } else {
    score += 5;
  }

  // Industry relevance (20 points max)
  const icpIndustries = (icpProfile.industries || []).map((i: string) => i.toLowerCase());
  if (icpIndustries.length > 0 && orgIndustry && icpIndustries.some((ind: string) => orgIndustry.toLowerCase().includes(ind))) {
    score += 20;
  }

  // AI/data hiring signals (15 points max)
  const techLower = techStack.map((t: string) => t.toLowerCase());
  const hasAISignals = AI_TECH_KEYWORDS.some(kw => techLower.some(t => t.includes(kw)));
  if (hasAISignals) {
    score += 15;
  }

  // Digital transformation signals (15 points max)
  const titleAndIndustry = `${title} ${orgIndustry}`;
  if (DIGITAL_TRANSFORM_KEYWORDS.test(titleAndIndustry)) {
    score += 15;
  }

  return Math.min(100, score);
}

// ── ROI Estimation ───────────────────────────────────────────────────────

export function estimateROI(
  fitScore: number,
  icpProfile: any,
  avgDealValue = 25000,
): { probability_of_sale: number; expected_revenue: number } {
  const profileConversionRate = Number(icpProfile.conversion_rate) || 0.05;
  const probability = (fitScore / 100) * 0.6 + profileConversionRate * 0.4;
  const clampedProb = Math.min(1, Math.max(0, probability));
  return {
    probability_of_sale: Math.round(clampedProb * 10000) / 10000,
    expected_revenue: Math.round(clampedProb * avgDealValue * 100) / 100,
  };
}

// ── Reasoning Generator ──────────────────────────────────────────────────

export function generateReasoning(
  person: Record<string, any>,
  icpProfile: any,
  fitScore: number,
  roi: { probability_of_sale: number; expected_revenue: number },
): string {
  const title = person.title || 'Unknown Title';
  const company = person.organization?.name || person.company || 'Unknown Company';
  const industry = person.organization?.industry || person.industry || 'Unknown';
  const size = person.organization?.estimated_num_employees || person.employee_count || 0;

  const lines: string[] = [];
  lines.push(`${title} at ${company} (${industry}, ${size} employees).`);
  lines.push(`Program fit score: ${fitScore}/100.`);

  // Breakdown
  const titleLower = (title || '').toLowerCase();
  if (EXEC_TITLES.test(titleLower) || DIRECTOR_TITLES.test(titleLower)) {
    lines.push('Title indicates senior decision-maker with budget authority.');
  } else if (MANAGER_TITLES.test(titleLower)) {
    lines.push('Title indicates mid-level influence with potential sponsorship path.');
  }

  if (size >= 200 && size <= 5000) {
    lines.push('Company size is in the ideal range for enterprise AI adoption programs.');
  }

  const icpIndustries = (icpProfile.industries || []).map((i: string) => i.toLowerCase());
  const orgIndustry = (person.organization?.industry || person.industry || '').toLowerCase();
  if (icpIndustries.some((ind: string) => orgIndustry.includes(ind))) {
    lines.push(`Industry (${industry}) matches ICP targeting criteria.`);
  }

  lines.push(`Estimated probability of sale: ${Math.round(roi.probability_of_sale * 100)}%. Expected revenue: $${roi.expected_revenue.toLocaleString()}.`);

  return lines.join(' ');
}

// ── Lead Discovery ───────────────────────────────────────────────────────

export async function discoverLeadsForCampaign(
  campaignId: string,
  config: { max_leads_per_profile?: number; min_program_fit_score?: number; avg_deal_value?: number } = {},
): Promise<{ recommendations_created: number; profiles_scanned: number; people_evaluated: number }> {
  const maxPerProfile = config.max_leads_per_profile || 50;
  const minFitScore = config.min_program_fit_score || 40;
  const avgDealValue = config.avg_deal_value || 25000;

  const campaign = await Campaign.findByPk(campaignId, {
    include: [{ model: ICPProfile, as: 'icpProfiles' }],
  }) as any;

  if (!campaign) throw new Error('Campaign not found');
  if (campaign.campaign_mode !== 'autonomous') throw new Error('Campaign is not in autonomous mode');
  if (campaign.status !== 'active') throw new Error('Campaign is not active');

  const profiles: any[] = campaign.icpProfiles || [];
  if (profiles.length === 0) return { recommendations_created: 0, profiles_scanned: 0, people_evaluated: 0 };

  // Check Apollo quota
  const quota = await getApolloQuota();
  if (!quota.available) {
    console.warn(`[LeadIntelligence] Apollo unavailable: ${quota.message}`);
    return { recommendations_created: 0, profiles_scanned: 0, people_evaluated: 0 };
  }

  let totalCreated = 0;
  let totalEvaluated = 0;

  for (const profile of profiles) {
    try {
      // Search Apollo using ICP profile filters
      const people: any[] = await searchApolloFromProfileBulk(profile.id, maxPerProfile);

      for (const person of people) {
        totalEvaluated++;

        // Skip people without email — can't enroll in email campaigns
        if (!person.email) continue;

        // Dedup: skip if already a lead (by email)
        const existingLead = await Lead.findOne({ where: { email: person.email.toLowerCase() } });
        if (existingLead) continue;

        // Dedup: skip if already recommended (by apollo_person_id)
        if (person.id) {
          const existingRec = await LeadRecommendation.findOne({
            where: { apollo_person_id: person.id, campaign_id: campaignId, status: { [Op.in]: ['pending', 'approved'] } },
          });
          if (existingRec) continue;
        }

        // Score
        const fitScore = calculateProgramFitScore(person, profile);
        if (fitScore < minFitScore) continue;

        const roi = estimateROI(fitScore, profile, avgDealValue);
        const reasoning = generateReasoning(person, profile, fitScore, roi);

        // Create recommendation
        await LeadRecommendation.create({
          campaign_id: campaignId,
          icp_profile_id: profile.id,
          apollo_person_id: person.id || null,
          lead_data: {
            name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
            email: person.email || null,
            title: person.title || null,
            company: person.organization?.name || null,
            industry: person.organization?.industry || null,
            employee_count: person.organization?.estimated_num_employees || null,
            linkedin_url: person.linkedin_url || null,
            phone: person.phone_numbers?.[0]?.sanitized_number || null,
            apollo_id: person.id || null,
          },
          program_fit_score: fitScore,
          probability_of_sale: roi.probability_of_sale,
          expected_revenue: roi.expected_revenue,
          reasoning,
          status: 'pending',
        });

        totalCreated++;
      }
    } catch (err: any) {
      console.error(`[LeadIntelligence] Error processing profile ${profile.name}:`, err.message);
    }
  }

  console.log(`[LeadIntelligence] Campaign ${campaign.name}: ${totalCreated} recommendations from ${profiles.length} profiles (${totalEvaluated} evaluated)`);

  return {
    recommendations_created: totalCreated,
    profiles_scanned: profiles.length,
    people_evaluated: totalEvaluated,
  };
}

// ── Approval / Rejection ─────────────────────────────────────────────────

export async function approveRecommendation(
  recommendationId: string,
  adminUserId: string | null,
): Promise<{ lead_id: number; enrolled: boolean }> {
  const rec = await LeadRecommendation.findByPk(recommendationId);
  if (!rec) throw new Error('Recommendation not found');
  if (rec.status !== 'pending') throw new Error(`Recommendation is already ${rec.status}`);

  // Import the lead via Apollo import pipeline (handles dedup, enrichment, scoring)
  const personData = {
    id: rec.lead_data.apollo_id || undefined,
    email: rec.lead_data.email,
    first_name: rec.lead_data.name?.split(' ')[0] || '',
    last_name: rec.lead_data.name?.split(' ').slice(1).join(' ') || '',
    title: rec.lead_data.title,
    linkedin_url: rec.lead_data.linkedin_url,
    phone_numbers: rec.lead_data.phone ? [{ sanitized_number: rec.lead_data.phone }] : [],
    organization: {
      name: rec.lead_data.company,
      industry: rec.lead_data.industry,
      estimated_num_employees: rec.lead_data.employee_count,
    },
  };

  const importResult = await importApolloResults([personData] as any, { campaign_id: rec.campaign_id });
  const lead = importResult.leads[0];
  if (!lead) throw new Error('Failed to import lead');

  const leadId = lead.id;

  // Enroll in campaign
  let enrolled = false;
  try {
    await enrollLeadsInCampaign(rec.campaign_id, [leadId]);
    enrolled = true;
  } catch (err: any) {
    console.warn(`[LeadIntelligence] Enrollment failed for lead ${leadId}: ${err.message}`);
  }

  // Update recommendation
  await rec.update({
    status: 'approved',
    reviewed_by: adminUserId || null,
    reviewed_at: new Date(),
    lead_id: leadId,
    updated_at: new Date(),
  });

  return { lead_id: leadId, enrolled };
}

export async function rejectRecommendation(
  recommendationId: string,
  adminUserId: string | null,
): Promise<void> {
  const rec = await LeadRecommendation.findByPk(recommendationId);
  if (!rec) throw new Error('Recommendation not found');
  if (rec.status !== 'pending') throw new Error(`Recommendation is already ${rec.status}`);

  await rec.update({
    status: 'rejected',
    reviewed_by: adminUserId || null,
    reviewed_at: new Date(),
    updated_at: new Date(),
  });
}

export async function bulkApproveRecommendations(
  recommendationIds: string[],
  adminUserId: string | null,
): Promise<{ approved: number; failed: number; errors: string[] }> {
  let approved = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const id of recommendationIds) {
    try {
      await approveRecommendation(id, adminUserId);
      approved++;
    } catch (err: any) {
      failed++;
      errors.push(`${id}: ${err.message}`);
    }
  }

  return { approved, failed, errors };
}

// ── Stats for Dashboard ──────────────────────────────────────────────────

export async function getRecommendationStats(campaignId?: string): Promise<{
  total_discovered: number;
  pending: number;
  approved: number;
  rejected: number;
  estimated_revenue: number;
  avg_fit_score: number;
}> {
  const where: any = {};
  if (campaignId) where.campaign_id = campaignId;

  const pending = await LeadRecommendation.count({ where: { ...where, status: 'pending' } });
  const approved = await LeadRecommendation.count({ where: { ...where, status: 'approved' } });
  const rejected = await LeadRecommendation.count({ where: { ...where, status: 'rejected' } });

  // Sum expected_revenue for pending recommendations
  const revenueResult = await LeadRecommendation.findOne({
    where: { ...where, status: 'pending' },
    attributes: [[fn('SUM', col('expected_revenue')), 'total_revenue']],
    raw: true,
  }) as any;
  const estimatedRevenue = Number(revenueResult?.total_revenue) || 0;

  // Avg fit score for pending
  const avgResult = await LeadRecommendation.findOne({
    where: { ...where, status: 'pending' },
    attributes: [[fn('AVG', col('program_fit_score')), 'avg_score']],
    raw: true,
  }) as any;
  const avgFitScore = Math.round(Number(avgResult?.avg_score) || 0);

  return {
    total_discovered: pending + approved + rejected,
    pending,
    approved,
    rejected,
    estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
    avg_fit_score: avgFitScore,
  };
}
