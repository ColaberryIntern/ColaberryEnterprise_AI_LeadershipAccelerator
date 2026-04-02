import { Lead } from '../models';
import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

const EXEC_TITLES = /\b(chief|cto|cio|cdo|ceo|cfo|coo|vp|vice president|svp|evp|president|partner)\b/i;
const DIRECTOR_TITLES = /\b(director|head of|principal)\b/i;
const MANAGER_TITLES = /\b(manager|lead|senior)\b/i;

const HIGH_VALUE_INDUSTRIES = ['financial services', 'healthcare', 'technology', 'manufacturing', 'energy', 'insurance', 'government'];

export interface OfferScore {
  lead_score: number;
  qualification_level: 'low' | 'medium' | 'high';
  recommended_offer: 'accelerator' | 'advisory' | 'custom_build' | 'enterprise_deal';
  secondary_offers: string[];
  reasoning: string;
}

export async function scoreLeadForOffers(lead: any): Promise<OfferScore> {
  const title = (lead.title || '').toLowerCase();
  const companySize = lead.company_size || lead.employee_count || 0;
  const maturity = lead.maturity_score || 0;
  const roi = parseFloat(lead.estimated_roi) || 0;
  const industry = (lead.industry || '').toLowerCase();

  // Component scores (0-100 each)
  // 1. Company size (20%)
  let sizeScore = 0;
  if (companySize >= 10000) sizeScore = 100;
  else if (companySize >= 1000) sizeScore = 80;
  else if (companySize >= 500) sizeScore = 60;
  else if (companySize >= 100) sizeScore = 40;
  else if (companySize >= 50) sizeScore = 20;

  // 2. Role seniority (20%)
  let seniorityScore = 0;
  if (EXEC_TITLES.test(title)) seniorityScore = 100;
  else if (DIRECTOR_TITLES.test(title)) seniorityScore = 70;
  else if (MANAGER_TITLES.test(title)) seniorityScore = 40;
  else seniorityScore = 15;

  // 3. Maturity score (20%)
  const maturityScore = Math.min(maturity, 100);

  // 4. Estimated ROI (15%)
  let roiScore = 0;
  if (roi >= 1000000) roiScore = 100;
  else if (roi >= 500000) roiScore = 80;
  else if (roi >= 100000) roiScore = 60;
  else if (roi >= 50000) roiScore = 40;
  else if (roi > 0) roiScore = 20;

  // 5. Industry value (15%)
  const industryScore = HIGH_VALUE_INDUSTRIES.some(i => industry.includes(i)) ? 80 : 30;

  // 6. Engagement depth (10%)
  let engagementScore = 0;
  try {
    const [result] = await sequelize.query(
      "SELECT COUNT(*) as cnt FROM interaction_outcomes WHERE lead_id = :leadId AND outcome IN ('opened','clicked','replied')",
      { replacements: { leadId: lead.id }, type: QueryTypes.SELECT }
    ) as any[];
    const count = parseInt(result?.cnt || '0', 10);
    engagementScore = Math.min(count * 10, 100);
  } catch { /* non-blocking */ }

  // Weighted total
  const totalScore = Math.round(
    sizeScore * 0.20 +
    seniorityScore * 0.20 +
    maturityScore * 0.20 +
    roiScore * 0.15 +
    industryScore * 0.15 +
    engagementScore * 0.10
  );

  const qualLevel = totalScore >= 70 ? 'high' : totalScore >= 40 ? 'medium' : 'low';

  // Classify offer
  const classification = classifyOffer(lead, totalScore, qualLevel);

  return {
    lead_score: totalScore,
    qualification_level: qualLevel,
    recommended_offer: classification.primary as OfferScore['recommended_offer'],
    secondary_offers: classification.secondary,
    reasoning: classification.reasoning,
  };
}

function classifyOffer(lead: any, score: number, qualLevel: string): { primary: string; secondary: string[]; reasoning: string } {
  const companySize = lead.company_size || lead.employee_count || 0;
  const roi = parseFloat(lead.estimated_roi) || 0;
  const departments = lead.departments_impacted ? (Array.isArray(lead.departments_impacted) ? lead.departments_impacted.length : 0) : 0;
  const maturity = lead.maturity_score || 0;
  const hasIdeaInput = !!(lead.idea_input && lead.idea_input.length > 20);

  // Enterprise Deal
  if (companySize >= 1000 && roi >= 500000 && departments >= 3) {
    return {
      primary: 'enterprise_deal',
      secondary: ['custom_build', 'advisory'],
      reasoning: `Large org (${companySize} employees), high ROI ($${roi.toLocaleString()}), ${departments} departments impacted`,
    };
  }

  // Custom AI Build
  if (maturity >= 60 && hasIdeaInput && companySize >= 100) {
    return {
      primary: 'custom_build',
      secondary: ['advisory', 'accelerator'],
      reasoning: `Strong maturity (${maturity}/100), specific use case defined, mid-size org`,
    };
  }

  // Advisory
  if (maturity >= 30 && qualLevel !== 'low' && !hasIdeaInput) {
    return {
      primary: 'advisory',
      secondary: ['accelerator', 'custom_build'],
      reasoning: `Moderate maturity (${maturity}/100), strategic need but unclear execution path`,
    };
  }

  // Default: Accelerator
  return {
    primary: 'accelerator',
    secondary: ['advisory'],
    reasoning: `Best fit for structured learning program. Score: ${score}/100`,
  };
}
