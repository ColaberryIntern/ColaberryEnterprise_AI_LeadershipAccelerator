import { Op } from 'sequelize';
import { env } from '../config/env';
import Lead from '../models/Lead';

const APOLLO_BASE_URL = 'https://api.apollo.io';

interface ApolloSearchParams {
  q_person_title?: string[];
  person_seniorities?: string[];
  q_organization_industries?: string[];
  organization_num_employees_ranges?: string[];
  person_locations?: string[];
  q_keywords?: string;
  per_page?: number;
  page?: number;
}

interface ApolloPersonResult {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string;
  phone_numbers?: { raw_number: string }[];
  linkedin_url?: string;
  organization?: {
    name: string;
    industry: string;
    estimated_num_employees?: number;
    annual_revenue_printed?: string;
    technology_names?: string[];
  };
}

export async function searchPeople(params: ApolloSearchParams): Promise<{
  people: ApolloPersonResult[];
  total: number;
  page: number;
  per_page: number;
}> {
  const apiKey = env.apolloApiKey;
  if (!apiKey) throw new Error('Apollo API key not configured');

  const body: Record<string, any> = {
    api_key: apiKey,
    per_page: params.per_page || 25,
    page: params.page || 1,
  };

  if (params.q_person_title?.length) body.q_person_title = params.q_person_title;
  if (params.person_seniorities?.length) body.person_seniorities = params.person_seniorities;
  if (params.q_organization_industries?.length) body.q_organization_industries = params.q_organization_industries;
  if (params.organization_num_employees_ranges?.length) body.organization_num_employees_ranges = params.organization_num_employees_ranges;
  if (params.person_locations?.length) body.person_locations = params.person_locations;
  if (params.q_keywords) body.q_keywords = params.q_keywords;

  const response = await fetch(`${APOLLO_BASE_URL}/v1/mixed_people/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo API error ${response.status}: ${errorText}`);
  }

  const data: any = await response.json();

  return {
    people: data.people || [],
    total: data.pagination?.total_entries || 0,
    page: data.pagination?.page || 1,
    per_page: data.pagination?.per_page || 25,
  };
}

export async function enrichPerson(email: string): Promise<ApolloPersonResult | null> {
  const apiKey = env.apolloApiKey;
  if (!apiKey) throw new Error('Apollo API key not configured');

  const response = await fetch(`${APOLLO_BASE_URL}/v1/people/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, email }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo enrichment error ${response.status}: ${errorText}`);
  }

  const data: any = await response.json();
  return data.person || null;
}

export async function importApolloResults(
  people: ApolloPersonResult[]
): Promise<{ imported: number; duplicates: number; errors: number; leads: any[] }> {
  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  const leads: any[] = [];

  for (const person of people) {
    try {
      if (!person.email) {
        errors++;
        continue;
      }

      // Dedup by email or apollo_id
      const existing = await Lead.findOne({
        where: {
          [Op.or]: [
            { email: { [Op.iLike]: person.email.trim() } },
            ...(person.id ? [{ apollo_id: person.id }] : []),
          ],
        },
      });

      if (existing) {
        duplicates++;
        leads.push(existing);
        continue;
      }

      const phone = person.phone_numbers?.[0]?.raw_number || '';
      const org = person.organization;

      const leadScore = calculateColdLeadScore({
        title: person.title,
        email: person.email,
        phone,
        industry: org?.industry,
        employee_count: org?.estimated_num_employees,
        annual_revenue: org?.annual_revenue_printed,
        technology_stack: org?.technology_names,
      });

      const lead = await Lead.create({
        name: person.name || `${person.first_name} ${person.last_name}`.trim(),
        email: person.email.trim().toLowerCase(),
        company: org?.name || '',
        title: person.title || '',
        phone,
        lead_source_type: 'cold',
        source: 'apollo',
        form_type: 'apollo_import',
        industry: org?.industry || '',
        annual_revenue: org?.annual_revenue_printed || '',
        employee_count: org?.estimated_num_employees || null,
        technology_stack: org?.technology_names || null,
        linkedin_url: person.linkedin_url || '',
        apollo_id: person.id || '',
        lead_score: leadScore,
        status: 'new',
        pipeline_stage: 'new_lead',
      } as any);

      imported++;
      leads.push(lead);
    } catch (err: any) {
      console.error(`[Apollo] Failed to import ${person.email}:`, err.message);
      errors++;
    }
  }

  return { imported, duplicates, errors, leads };
}

/** Cold lead scoring algorithm — different criteria than warm leads */
export function calculateColdLeadScore(lead: {
  title?: string;
  email?: string;
  phone?: string;
  industry?: string;
  employee_count?: number;
  annual_revenue?: string;
  technology_stack?: string[];
}): number {
  let score = 0;

  // Industry match to ICP target list (+15)
  const icpIndustries = [
    'saas', 'software', 'technology', 'financial services', 'fintech',
    'healthcare', 'manufacturing', 'professional services', 'consulting',
  ];
  if (lead.industry) {
    const lower = lead.industry.toLowerCase();
    if (icpIndustries.some((i) => lower.includes(i))) score += 15;
  }

  // Executive title — C-suite/VP/Director (+20)
  const execPattern = /\b(chief|ceo|cto|cio|cdo|cfo|coo|vp|vice\s*president|svp|evp|director|head\s+of)\b/i;
  if (lead.title && execPattern.test(lead.title)) score += 20;

  // Company size in sweet spot 51-500 (+15)
  if (lead.employee_count) {
    if (lead.employee_count >= 51 && lead.employee_count <= 500) score += 15;
    else if (lead.employee_count > 500) score += 10;
  }

  // Revenue bracket match (+10)
  if (lead.annual_revenue) {
    const rev = lead.annual_revenue.toLowerCase();
    if (rev.includes('million') || rev.includes('m') || rev.includes('billion') || rev.includes('b')) {
      score += 10;
    }
  }

  // Corporate email (+10)
  if (lead.email) {
    const domain = lead.email.split('@')[1]?.toLowerCase() || '';
    const freeProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com'];
    if (domain && !freeProviders.includes(domain)) score += 10;
  }

  // Phone provided (+15)
  if (lead.phone && lead.phone.trim().length > 0) score += 15;

  // Technology stack overlap (+15)
  const icpTech = ['salesforce', 'aws', 'azure', 'gcp', 'snowflake', 'databricks', 'python', 'tensorflow'];
  if (lead.technology_stack?.length) {
    const overlap = lead.technology_stack.filter((t) =>
      icpTech.some((icp) => t.toLowerCase().includes(icp))
    );
    if (overlap.length > 0) score += 15;
  }

  return Math.min(score, 100);
}

export async function getApolloQuota(): Promise<{ available: boolean; message: string }> {
  const apiKey = env.apolloApiKey;
  if (!apiKey) return { available: false, message: 'Apollo API key not configured' };

  try {
    // Simple check — try a minimal search
    const response = await fetch(`${APOLLO_BASE_URL}/v1/mixed_people/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, per_page: 1, page: 1, q_person_title: ['CEO'] }),
    });

    if (response.ok) {
      return { available: true, message: 'Apollo API is available' };
    }

    const errorText = await response.text();
    return { available: false, message: `Apollo API error: ${errorText}` };
  } catch (err: any) {
    return { available: false, message: `Apollo API unreachable: ${err.message}` };
  }
}
