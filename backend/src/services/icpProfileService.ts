import { Op } from 'sequelize';
import { ICPProfile, Campaign, CampaignLead } from '../models';
import { ApolloSearchParams, searchPeople, importApolloResults } from './apolloService';
import { getInsights, getTargetingRecommendations } from './icpInsightService';
import { enrollLeadsInCampaign } from './campaignService';
import {
  scoreLeadForColdCampaign,
  buildIntelligenceSummary,
  type CombinedLeadScore,
  type IntelligenceSummary,
} from './leadScoringEngine';

// ── CRUD ────────────────────────────────────────────────────────────────

export interface CreateICPProfileParams {
  name: string;
  description?: string;
  role?: 'primary' | 'secondary';
  person_titles?: string[];
  person_seniorities?: string[];
  industries?: string[];
  company_size_min?: number;
  company_size_max?: number;
  person_locations?: string[];
  keywords?: string[];
  apollo_filters?: Record<string, any>;
  pain_indicators?: string[];
  buying_signals?: string[];
  campaign_id?: string;
  created_by?: string;
}

export async function createICPProfile(params: CreateICPProfileParams) {
  return ICPProfile.create({
    name: params.name,
    description: params.description || '',
    role: params.role || 'primary',
    person_titles: params.person_titles || [],
    person_seniorities: params.person_seniorities || [],
    industries: params.industries || [],
    company_size_min: params.company_size_min || null,
    company_size_max: params.company_size_max || null,
    person_locations: params.person_locations || [],
    keywords: params.keywords || [],
    apollo_filters: params.apollo_filters || {},
    pain_indicators: params.pain_indicators || [],
    buying_signals: params.buying_signals || [],
    campaign_id: params.campaign_id || null,
    created_by: params.created_by || null,
  } as any);
}

export async function updateICPProfile(id: string, updates: Partial<CreateICPProfileParams>) {
  const profile = await ICPProfile.findByPk(id);
  if (!profile) throw new Error(`ICP Profile ${id} not found`);
  await profile.update(updates as any);
  return profile;
}

export async function deleteICPProfile(id: string) {
  const profile = await ICPProfile.findByPk(id);
  if (!profile) throw new Error(`ICP Profile ${id} not found`);
  await profile.destroy();
}

export async function getICPProfile(id: string) {
  const profile = await ICPProfile.findByPk(id);
  if (!profile) throw new Error(`ICP Profile ${id} not found`);
  return profile;
}

export async function listICPProfiles(campaignId?: string) {
  const where: any = {};
  if (campaignId) where.campaign_id = campaignId;

  return ICPProfile.findAll({
    where,
    order: [['role', 'ASC'], ['created_at', 'DESC']],
  });
}

// ── Apollo Filter Mapping ───────────────────────────────────────────────

export function buildApolloFilters(profile: ICPProfile): ApolloSearchParams {
  const filters: ApolloSearchParams = {};

  if (profile.person_titles?.length) {
    filters.q_person_title = profile.person_titles;
  }

  if (profile.person_seniorities?.length) {
    filters.person_seniorities = profile.person_seniorities;
  }

  if (profile.industries?.length) {
    filters.q_organization_industries = profile.industries;
  }

  if (profile.company_size_min != null || profile.company_size_max != null) {
    const min = profile.company_size_min || 1;
    const max = profile.company_size_max || 10000;
    filters.organization_num_employees_ranges = [`${min},${max}`];
  }

  if (profile.person_locations?.length) {
    filters.person_locations = profile.person_locations;
  }

  // NOTE: q_keywords is intentionally NOT sent to Apollo — it drastically reduces
  // results (e.g. 19,043 → 2). The other filters (titles, seniorities, industries,
  // company size, locations) provide sufficient targeting. Keywords are retained in
  // the ICP profile for AI personalization of outreach messages.

  // Only return people with verified emails — Apollo withholds emails by default
  filters.contact_email_status = ['verified'];

  // Merge any raw apollo_filters passthrough
  if (profile.apollo_filters && Object.keys(profile.apollo_filters).length) {
    Object.assign(filters, profile.apollo_filters);
  }

  return filters;
}

// ── Search Apollo from Profile ──────────────────────────────────────────

export async function searchApolloFromProfile(
  profileId: string,
  page = 1,
  perPage = 25,
) {
  const profile = await getICPProfile(profileId);
  const filters = buildApolloFilters(profile);

  return searchPeople({
    ...filters,
    page,
    per_page: perPage,
  });
}

/**
 * Paginated search — collects up to maxLeads results across multiple pages.
 */
export async function searchApolloFromProfileBulk(
  profileId: string,
  maxLeads = 100,
  extraFilters?: { has_direct_phone?: boolean },
) {
  const profile = await getICPProfile(profileId);
  const filters = buildApolloFilters(profile);
  const perPage = Math.min(maxLeads, 100); // Apollo max per page

  let allPeople: any[] = [];
  let currentPage = 1;

  while (allPeople.length < maxLeads) {
    const result = await searchPeople({
      ...filters,
      ...extraFilters,
      page: currentPage,
      per_page: perPage,
    });

    allPeople = allPeople.concat(result.people);

    // No more results
    if (result.people.length < perPage || allPeople.length >= result.total) {
      break;
    }

    currentPage++;

    // Safety: max 30 pages (3000 results for cold scoring pools)
    if (currentPage > 30) break;
  }

  return allPeople.slice(0, maxLeads);
}

// ── Import from Profile ─────────────────────────────────────────────────

export async function importLeadsFromProfile(
  profileId: string,
  maxLeads = 100,
) {
  const people = await searchApolloFromProfileBulk(profileId, maxLeads);
  return importApolloResults(people);
}

// ── One-Click: Search Apollo + Import + Enroll ──────────────────────────

export async function searchAndEnrollFromProfile(
  profileId: string,
  campaignId: string,
  maxLeads = 100,
): Promise<{
  imported: number;
  duplicates: number;
  enrolled: number;
  errors: number;
  leads: any[];
  intelligence_summary?: IntelligenceSummary;
}> {
  const profile = await getICPProfile(profileId);
  const campaign = await Campaign.findByPk(campaignId, { raw: true }) as any;

  // ── Cold Outbound: Score → Rank → Import Top N ────────────────────
  if (campaign?.type === 'cold_outbound') {
    const poolSize = Math.min(maxLeads * 3, 3000);
    console.log(`[ICP] Cold scoring: fetching pool of ${poolSize} for top ${maxLeads}`);

    // Only fetch leads with direct phone numbers for cold outbound (voice campaigns)
    const people = await searchApolloFromProfileBulk(profileId, poolSize, { has_direct_phone: true });
    if (people.length === 0) {
      return { imported: 0, duplicates: 0, enrolled: 0, errors: 0, leads: [], intelligence_summary: undefined };
    }

    // Score each lead with both engines
    const icpIndustries = (profile as any).industries || [];
    const scored: CombinedLeadScore[] = people.map((p: any) =>
      scoreLeadForColdCampaign(p, icpIndustries)
    );

    // Rank by combined score, take top N
    scored.sort((a, b) => b.combined_rank - a.combined_rank);
    const topN = scored.slice(0, maxLeads);

    console.log(`[ICP] Cold scoring: ${people.length} scored, top ${topN.length} selected (min rank: ${topN[topN.length - 1]?.combined_rank?.toFixed(1)})`);

    // Import only the top N
    const importResult = await importApolloResults(
      topN.map((s) => s.person),
      {
        campaign_id: campaignId,
        scoring_criteria: {
          target_industries: icpIndustries,
          company_size_min: (profile as any).company_size_min,
          company_size_max: (profile as any).company_size_max,
        },
      },
    );

    // Enroll
    let enrolled = 0;
    if (importResult.leads.length > 0) {
      const leadIds = importResult.leads.map((l: any) => l.id);
      try {
        const enrollResult = await enrollLeadsInCampaign(campaignId, leadIds);
        enrolled = enrollResult.filter((r: any) => r.status === 'enrolled' || r.status === 'active').length;
      } catch (err: any) {
        console.error(`[ICP] Enrollment error for profile ${profileId}: ${err.message}`);
      }

      // Persist intelligence score breakdowns to CampaignLead.metadata
      for (const scoredLead of topN) {
        const email = (scoredLead.person.email || '').toLowerCase().trim();
        const matchedLead = importResult.leads.find(
          (l: any) => (l.email || '').toLowerCase().trim() === email
        );
        if (matchedLead) {
          await CampaignLead.update(
            {
              metadata: {
                intelligence_score: scoredLead.intelligence,
                deal_probability: scoredLead.deal_probability,
                combined_rank: scoredLead.combined_rank,
              },
            } as any,
            { where: { campaign_id: campaignId, lead_id: matchedLead.id } },
          );
        }
      }
    }

    const intelligence_summary = buildIntelligenceSummary(topN, importResult.imported);

    return {
      imported: importResult.imported,
      duplicates: importResult.duplicates,
      enrolled,
      errors: importResult.errors,
      leads: importResult.leads,
      intelligence_summary,
    };
  }

  // ── All other campaign types: existing flow unchanged ─────────────
  const people = await searchApolloFromProfileBulk(profileId, maxLeads);

  if (people.length === 0) {
    return { imported: 0, duplicates: 0, enrolled: 0, errors: 0, leads: [] };
  }

  const importResult = await importApolloResults(people, {
    campaign_id: campaignId,
    scoring_criteria: {
      target_industries: (profile as any).industries || [],
      company_size_min: (profile as any).company_size_min,
      company_size_max: (profile as any).company_size_max,
    },
  });

  let enrolled = 0;
  if (importResult.leads.length > 0) {
    const leadIds = importResult.leads.map((l: any) => l.id);
    try {
      const enrollResult = await enrollLeadsInCampaign(campaignId, leadIds);
      enrolled = enrollResult.filter((r: any) => r.status === 'enrolled' || r.status === 'active').length;
    } catch (err: any) {
      console.error(`[ICP] Enrollment error for profile ${profileId}: ${err.message}`);
    }
  }

  return {
    imported: importResult.imported,
    duplicates: importResult.duplicates,
    enrolled,
    errors: importResult.errors,
    leads: importResult.leads,
  };
}

// ── Refresh Profile Stats from ICP Insights ─────────────────────────────

function computePerformanceGrade(responseRate: number | null): string | null {
  if (responseRate == null) return null;
  if (responseRate > 0.30) return 'A';
  if (responseRate > 0.15) return 'B';
  if (responseRate > 0.05) return 'C';
  return 'D';
}

export async function refreshProfileStats(profileId: string) {
  const profile = await getICPProfile(profileId);

  // Query ICP insights for dimensions matching this profile
  const insights = await getInsights({
    campaign_type: 'cold_outbound',
  });

  // Accumulators per metric (weighted by sample size)
  const metricAccum: Record<string, { weightedSum: number; totalWeight: number }> = {
    response_rate: { weightedSum: 0, totalWeight: 0 },
    booking_rate: { weightedSum: 0, totalWeight: 0 },
    open_rate: { weightedSum: 0, totalWeight: 0 },
    conversion_rate: { weightedSum: 0, totalWeight: 0 },
  };

  let minConfidence: number | null = null;
  let totalSampleSize = 0;

  for (const insight of insights) {
    let isMatch = false;

    // Match by industry
    if (
      insight.dimension_type === 'industry' &&
      profile.industries?.length &&
      profile.industries.some(
        (ind: string) => ind.toLowerCase() === insight.dimension_value.toLowerCase(),
      )
    ) {
      isMatch = true;
    }

    // Match by title category
    if (
      insight.dimension_type === 'title_category' &&
      profile.person_titles?.length &&
      profile.person_titles.some(
        (t: string) => t.toLowerCase().includes(insight.dimension_value.toLowerCase()),
      )
    ) {
      isMatch = true;
    }

    // Match by company size bucket
    if (
      insight.dimension_type === 'company_size' &&
      profile.company_size_min != null
    ) {
      isMatch = true;
    }

    // Match by source type (cold profiles match cold source)
    if (
      insight.dimension_type === 'source_type' &&
      insight.dimension_value === 'cold'
    ) {
      isMatch = true;
    }

    // Match cross-dimensional (industry_x_title)
    if (insight.dimension_type === 'industry_x_title') {
      const [insightIndustry, insightTitle] = insight.dimension_value.split('::');
      const industryMatch = profile.industries?.some(
        (ind: string) => ind.toLowerCase() === insightIndustry?.toLowerCase(),
      );
      const titleMatch = profile.person_titles?.some(
        (t: string) => t.toLowerCase().includes(insightTitle?.toLowerCase() || ''),
      );
      if (industryMatch && titleMatch) isMatch = true;
    }

    if (isMatch) {
      const metricName = insight.metric_name as string;
      const metricValue = parseFloat(String(insight.metric_value));
      const sampleSize = insight.sample_size as number;
      const confidence = parseFloat(String(insight.confidence));

      if (metricAccum[metricName]) {
        metricAccum[metricName].weightedSum += metricValue * sampleSize;
        metricAccum[metricName].totalWeight += sampleSize;
      }

      totalSampleSize += sampleSize;

      if (minConfidence === null || confidence < minConfidence) {
        minConfidence = confidence;
      }
    }
  }

  // Compute weighted averages
  const responseRate = metricAccum.response_rate.totalWeight > 0
    ? metricAccum.response_rate.weightedSum / metricAccum.response_rate.totalWeight
    : null;
  const bookingRate = metricAccum.booking_rate.totalWeight > 0
    ? metricAccum.booking_rate.weightedSum / metricAccum.booking_rate.totalWeight
    : null;
  const openRate = metricAccum.open_rate.totalWeight > 0
    ? metricAccum.open_rate.weightedSum / metricAccum.open_rate.totalWeight
    : null;
  const conversionRate = metricAccum.conversion_rate.totalWeight > 0
    ? metricAccum.conversion_rate.weightedSum / metricAccum.conversion_rate.totalWeight
    : null;

  // Compute trend: compare to previous profile values
  let trend: string | null = null;
  if (responseRate != null && profile.response_rate != null) {
    const prevRate = parseFloat(String(profile.response_rate));
    const diff = responseRate - prevRate;
    if (Math.abs(diff) < 0.02) trend = 'stable';
    else if (diff > 0) trend = 'improving';
    else trend = 'declining';
  }

  // Generate and cache recommendations
  const recommendations = await generateRecommendations(profile);

  const updates: any = {
    last_computed_at: new Date(),
    sample_size: totalSampleSize,
    response_rate: responseRate,
    booking_rate: bookingRate,
    open_rate: openRate,
    conversion_rate: conversionRate,
    confidence_score: minConfidence,
    performance_grade: computePerformanceGrade(responseRate),
    trend,
    recommendation_data: recommendations,
  };

  await profile.update(updates);
  return profile;
}

// ── Profile Recommendations ──────────────────────────────────────────────

export interface ICPRecommendation {
  type: 'add' | 'remove' | 'adjust';
  dimension: 'industry' | 'title' | 'company_size' | 'seniority' | 'location';
  value: string;
  reason: string;
  metric_value: number;
  metric_name: string;
  sample_size: number;
  confidence: number;
}

async function generateRecommendations(profile: ICPProfile): Promise<ICPRecommendation[]> {
  const recommendations: ICPRecommendation[] = [];

  // Get top-performing dimensions for cold outbound
  const topInsights = await getTargetingRecommendations('cold_outbound', 'response_rate', 10);

  // Current profile dimensions (lowercase for comparison)
  const currentIndustries = new Set(
    (profile.industries || []).map((i: string) => i.toLowerCase()),
  );
  const currentTitles = new Set(
    (profile.person_titles || []).map((t: string) => t.toLowerCase()),
  );

  for (const insight of topInsights) {
    // Suggest adding high-performing industries not in the profile
    if (insight.dimension_type === 'industry' && insight.metric_value > 0.10) {
      if (!currentIndustries.has(insight.dimension_value.toLowerCase())) {
        recommendations.push({
          type: 'add',
          dimension: 'industry',
          value: insight.dimension_value,
          reason: `${(insight.metric_value * 100).toFixed(1)}% response rate (n=${insight.sample_size})`,
          metric_value: insight.metric_value,
          metric_name: 'response_rate',
          sample_size: insight.sample_size,
          confidence: insight.confidence,
        });
      }
    }

    // Suggest adding high-performing title categories not in the profile
    if (insight.dimension_type === 'title_category' && insight.metric_value > 0.10) {
      const alreadyTargeted = [...currentTitles].some(
        (t) => t.includes(insight.dimension_value.toLowerCase()),
      );
      if (!alreadyTargeted) {
        recommendations.push({
          type: 'add',
          dimension: 'title',
          value: insight.dimension_value,
          reason: `${(insight.metric_value * 100).toFixed(1)}% response rate (n=${insight.sample_size})`,
          metric_value: insight.metric_value,
          metric_name: 'response_rate',
          sample_size: insight.sample_size,
          confidence: insight.confidence,
        });
      }
    }

    // Suggest company size adjustments
    if (insight.dimension_type === 'company_size' && insight.metric_value > 0.15) {
      const bucketMap: Record<string, [number, number]> = {
        '1-10': [1, 10],
        '11-50': [11, 50],
        '51-200': [51, 200],
        '201-1000': [201, 1000],
        '1000+': [1000, 10000],
      };
      const range = bucketMap[insight.dimension_value];
      if (range) {
        const [min, max] = range;
        const profileMin = profile.company_size_min ?? 0;
        const profileMax = profile.company_size_max ?? 99999;
        // Suggest if best bucket is outside current range
        if (min > profileMax || max < profileMin) {
          recommendations.push({
            type: 'adjust',
            dimension: 'company_size',
            value: `${min}-${max}`,
            reason: `${insight.dimension_value} companies have ${(insight.metric_value * 100).toFixed(1)}% response rate (n=${insight.sample_size})`,
            metric_value: insight.metric_value,
            metric_name: 'response_rate',
            sample_size: insight.sample_size,
            confidence: insight.confidence,
          });
        }
      }
    }
  }

  // Check for underperforming dimensions currently in the profile
  const profileInsights = await getInsights({
    campaign_type: 'cold_outbound',
    metric_name: 'response_rate',
    min_sample_size: 20,
  });

  for (const insight of profileInsights) {
    const metricValue = parseFloat(String(insight.metric_value));
    if (metricValue >= 0.05) continue; // Only flag <5% response rate

    // Check if this underperformer is in the profile
    if (
      insight.dimension_type === 'industry' &&
      currentIndustries.has(insight.dimension_value.toLowerCase())
    ) {
      recommendations.push({
        type: 'remove',
        dimension: 'industry',
        value: insight.dimension_value,
        reason: `Only ${(metricValue * 100).toFixed(1)}% response rate (n=${insight.sample_size})`,
        metric_value: metricValue,
        metric_name: 'response_rate',
        sample_size: insight.sample_size,
        confidence: parseFloat(String(insight.confidence)),
      });
    }

    if (insight.dimension_type === 'title_category') {
      const matchedTitle = [...currentTitles].find(
        (t) => t.includes(insight.dimension_value.toLowerCase()),
      );
      if (matchedTitle) {
        recommendations.push({
          type: 'remove',
          dimension: 'title',
          value: insight.dimension_value,
          reason: `Only ${(metricValue * 100).toFixed(1)}% response rate (n=${insight.sample_size})`,
          metric_value: metricValue,
          metric_name: 'response_rate',
          sample_size: insight.sample_size,
          confidence: parseFloat(String(insight.confidence)),
        });
      }
    }
  }

  // Sort by confidence descending, limit to 10
  recommendations.sort((a, b) => b.confidence - a.confidence);
  return recommendations.slice(0, 10);
}

export async function getProfileRecommendations(profileId: string): Promise<{
  recommendations: ICPRecommendation[];
  profile_performance: {
    grade: string | null;
    trend: string | null;
    response_rate: number | null;
    booking_rate: number | null;
    open_rate: number | null;
    conversion_rate: number | null;
    sample_size: number;
    confidence_score: number | null;
  };
}> {
  const profile = await getICPProfile(profileId);

  // Use cached recommendations if fresh (computed within last hour), otherwise regenerate
  let recommendations: ICPRecommendation[];
  const lastComputed = profile.last_computed_at ? new Date(profile.last_computed_at).getTime() : 0;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  if (lastComputed > oneHourAgo && profile.recommendation_data?.length) {
    recommendations = profile.recommendation_data as ICPRecommendation[];
  } else {
    recommendations = await generateRecommendations(profile);
    await profile.update({ recommendation_data: recommendations } as any);
  }

  return {
    recommendations,
    profile_performance: {
      grade: profile.performance_grade || null,
      trend: profile.trend || null,
      response_rate: profile.response_rate != null ? parseFloat(String(profile.response_rate)) : null,
      booking_rate: profile.booking_rate != null ? parseFloat(String(profile.booking_rate)) : null,
      open_rate: profile.open_rate != null ? parseFloat(String(profile.open_rate)) : null,
      conversion_rate: profile.conversion_rate != null ? parseFloat(String(profile.conversion_rate)) : null,
      sample_size: profile.sample_size || 0,
      confidence_score: profile.confidence_score != null ? parseFloat(String(profile.confidence_score)) : null,
    },
  };
}

export async function applyRecommendation(
  profileId: string,
  recommendation: ICPRecommendation,
): Promise<ICPProfile> {
  const profile = await getICPProfile(profileId);

  switch (recommendation.type) {
    case 'add': {
      if (recommendation.dimension === 'industry') {
        const industries = [...(profile.industries || [])];
        if (!industries.some((i: string) => i.toLowerCase() === recommendation.value.toLowerCase())) {
          industries.push(recommendation.value);
          await profile.update({ industries } as any);
        }
      } else if (recommendation.dimension === 'title') {
        const titles = [...(profile.person_titles || [])];
        if (!titles.some((t: string) => t.toLowerCase() === recommendation.value.toLowerCase())) {
          titles.push(recommendation.value);
          await profile.update({ person_titles: titles } as any);
        }
      }
      break;
    }
    case 'remove': {
      if (recommendation.dimension === 'industry') {
        const industries = (profile.industries || []).filter(
          (i: string) => i.toLowerCase() !== recommendation.value.toLowerCase(),
        );
        await profile.update({ industries } as any);
      } else if (recommendation.dimension === 'title') {
        const titles = (profile.person_titles || []).filter(
          (t: string) => !t.toLowerCase().includes(recommendation.value.toLowerCase()),
        );
        await profile.update({ person_titles: titles } as any);
      }
      break;
    }
    case 'adjust': {
      if (recommendation.dimension === 'company_size') {
        const [min, max] = recommendation.value.split('-').map(Number);
        const currentMin = profile.company_size_min ?? min;
        const currentMax = profile.company_size_max ?? max;
        await profile.update({
          company_size_min: Math.min(currentMin, min),
          company_size_max: Math.max(currentMax, max),
        } as any);
      }
      break;
    }
  }

  // Remove the applied recommendation from cached data
  const remaining = (profile.recommendation_data || []).filter(
    (r: any) => !(r.type === recommendation.type && r.dimension === recommendation.dimension && r.value === recommendation.value),
  );
  await profile.update({ recommendation_data: remaining } as any);

  return profile.reload();
}

// ── Score Preview (cold_outbound only, no DB writes) ────────────────────

export async function scorePreviewFromProfile(
  profileId: string,
  campaignId: string,
  maxResults = 25,
): Promise<{
  results: Array<{
    name: string;
    title: string;
    company: string;
    industry: string;
    employee_count: number | null;
    email: string;
    linkedin_url: string;
    intelligence_score: number;
    deal_probability_score: number;
    deal_probability_tier: string;
    combined_rank: number;
  }>;
  pool_total: number;
  summary: IntelligenceSummary;
}> {
  const profile = await getICPProfile(profileId);
  const icpIndustries = (profile as any).industries || [];

  // Fetch a preview sample from Apollo
  const people = await searchApolloFromProfileBulk(profileId, Math.min(maxResults * 3, 300));

  if (people.length === 0) {
    return {
      results: [],
      pool_total: 0,
      summary: buildIntelligenceSummary([], 0),
    };
  }

  // Score all
  const scored: CombinedLeadScore[] = people.map((p: any) =>
    scoreLeadForColdCampaign(p, icpIndustries)
  );
  scored.sort((a, b) => b.combined_rank - a.combined_rank);

  const topResults = scored.slice(0, maxResults);
  const summary = buildIntelligenceSummary(scored, topResults.length);

  return {
    results: topResults.map((s) => ({
      name: s.person.name || `${s.person.first_name} ${s.person.last_name}`.trim(),
      title: s.person.title || '',
      company: s.person.organization?.name || '',
      industry: s.person.organization?.industry || '',
      employee_count: s.person.organization?.estimated_num_employees || null,
      email: s.person.email || '',
      linkedin_url: s.person.linkedin_url || '',
      intelligence_score: s.intelligence.total,
      deal_probability_score: s.deal_probability.total,
      deal_probability_tier: s.deal_probability.tier,
      combined_rank: Math.round(s.combined_rank * 10) / 10,
    })),
    pool_total: people.length,
    summary,
  };
}
