import { Op } from 'sequelize';
import { ICPProfile, Campaign } from '../models';
import { ApolloSearchParams, searchPeople, importApolloResults } from './apolloService';
import { getInsights } from './icpInsightService';

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

  if (profile.keywords?.length) {
    filters.q_keywords = profile.keywords.join(' ');
  }

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
) {
  const profile = await getICPProfile(profileId);
  const filters = buildApolloFilters(profile);
  const perPage = Math.min(maxLeads, 100); // Apollo max per page

  let allPeople: any[] = [];
  let currentPage = 1;

  while (allPeople.length < maxLeads) {
    const result = await searchPeople({
      ...filters,
      page: currentPage,
      per_page: perPage,
    });

    allPeople = allPeople.concat(result.people);

    // No more results
    if (result.people.length < perPage || allPeople.length >= result.total) {
      break;
    }

    currentPage++;

    // Safety: max 10 pages
    if (currentPage > 10) break;
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

// ── Refresh Profile Stats from ICP Insights ─────────────────────────────

export async function refreshProfileStats(profileId: string) {
  const profile = await getICPProfile(profileId);

  // Query ICP insights for dimensions matching this profile
  const insights = await getInsights({
    campaign_type: 'cold_outbound',
  });

  let totalResponseRate = 0;
  let totalBookingRate = 0;
  let matchCount = 0;
  let totalSampleSize = 0;

  for (const insight of insights) {
    let isMatch = false;

    // Match by industry
    if (
      insight.dimension_type === 'industry' &&
      profile.industries?.length &&
      profile.industries.some(
        (ind) => ind.toLowerCase() === insight.dimension_value.toLowerCase(),
      )
    ) {
      isMatch = true;
    }

    // Match by title category
    if (
      insight.dimension_type === 'title_category' &&
      profile.person_titles?.length &&
      profile.person_titles.some(
        (t) => t.toLowerCase().includes(insight.dimension_value.toLowerCase()),
      )
    ) {
      isMatch = true;
    }

    // Match by company size
    if (
      insight.dimension_type === 'company_size' &&
      profile.company_size_min != null
    ) {
      isMatch = true;
    }

    if (isMatch) {
      if (insight.metric_name === 'response_rate') {
        totalResponseRate += insight.metric_value * insight.sample_size;
      }
      if (insight.metric_name === 'booking_rate') {
        totalBookingRate += insight.metric_value * insight.sample_size;
      }
      totalSampleSize += insight.sample_size;
      matchCount++;
    }
  }

  const updates: any = {
    last_computed_at: new Date(),
    sample_size: totalSampleSize,
  };

  if (totalSampleSize > 0) {
    updates.response_rate = totalResponseRate / totalSampleSize;
    updates.booking_rate = totalBookingRate / totalSampleSize;
  }

  await profile.update(updates);
  return profile;
}
