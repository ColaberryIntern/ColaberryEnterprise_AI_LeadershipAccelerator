import { Lead } from '../../models';
import { getTestOverrides } from '../settingsService';

// ── Persona Archetypes ──────────────────────────────────────────────────

export type PersonaArchetype =
  | 'enterprise_cto'
  | 'mid_market_vp'
  | 'startup_founder'
  | 'corporate_director'
  | 'skeptical_executive'
  | 'eager_adopter'
  | 'budget_conscious';

export const PERSONA_ARCHETYPES: Record<PersonaArchetype, {
  label: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  company_size: string;
  lead_temperature: string;
  interest_area: string;
  notes: string;
}> = {
  enterprise_cto: {
    label: 'Enterprise CTO',
    name: 'James Richardson',
    title: 'Chief Technology Officer',
    company: 'GlobalTech Solutions',
    industry: 'Technology',
    company_size: '5001-10000',
    lead_temperature: 'warm',
    interest_area: 'AI Strategy',
    notes: 'Looking to build AI capabilities across engineering org. Budget approved for Q2.',
  },
  mid_market_vp: {
    label: 'Mid-Market VP',
    name: 'Sarah Chen',
    title: 'VP of Engineering',
    company: 'DataFlow Analytics',
    industry: 'SaaS',
    company_size: '201-500',
    lead_temperature: 'warm',
    interest_area: 'Enterprise AI',
    notes: 'Exploring AI training for leadership team. Evaluating multiple vendors.',
  },
  startup_founder: {
    label: 'Startup Founder',
    name: 'Marcus Johnson',
    title: 'CEO & Co-Founder',
    company: 'AI Nexus',
    industry: 'AI/ML',
    company_size: '11-50',
    lead_temperature: 'hot',
    interest_area: 'AI Leadership',
    notes: 'Bootstrapped startup scaling fast. Needs to upskill leadership team on AI strategy.',
  },
  corporate_director: {
    label: 'Corporate Director',
    name: 'Emily Nakamura',
    title: 'Director of Digital Transformation',
    company: 'Heritage Financial Group',
    industry: 'Financial Services',
    company_size: '1001-5000',
    lead_temperature: 'warm',
    interest_area: 'Digital Transformation',
    notes: 'Leading enterprise-wide digital transformation. C-suite mandate to adopt AI.',
  },
  skeptical_executive: {
    label: 'Skeptical Executive',
    name: 'Robert Kline',
    title: 'CFO',
    company: 'Precision Manufacturing Corp',
    industry: 'Manufacturing',
    company_size: '501-1000',
    lead_temperature: 'cold',
    interest_area: 'ROI of AI',
    notes: 'Skeptical about AI training ROI. Needs hard numbers and case studies to justify investment.',
  },
  eager_adopter: {
    label: 'Eager Adopter',
    name: 'Priya Sharma',
    title: 'Chief Data Officer',
    company: 'HealthBridge Systems',
    industry: 'Healthcare',
    company_size: '201-500',
    lead_temperature: 'hot',
    interest_area: 'AI Implementation',
    notes: 'Already running AI pilots. Wants executive training to scale adoption across organization.',
  },
  budget_conscious: {
    label: 'Budget-Conscious',
    name: 'David Okonkwo',
    title: 'VP of Operations',
    company: 'MidWest Logistics',
    industry: 'Logistics',
    company_size: '51-200',
    lead_temperature: 'cold',
    interest_area: 'Cost Reduction',
    notes: 'Interested but constrained budget. Needs flexible payment options or group discounts.',
  },
};

/**
 * Create or reuse a synthetic test lead for campaign testing.
 * Uses the admin test email/phone from global test overrides.
 * Optionally accepts a persona archetype for realistic simulation.
 */
export async function createTestLead(
  campaignId: string,
  persona?: PersonaArchetype,
): Promise<InstanceType<typeof Lead>> {
  const testOverrides = await getTestOverrides();
  const testEmail = testOverrides.email || 'test@colaberry.com';
  const testPhone = testOverrides.phone || '';

  // Reuse existing lead with this email (unscoped to include campaign_test leads)
  const existing = await Lead.unscoped().findOne({
    where: { email: testEmail },
  });

  if (existing) {
    // Update with persona data if specified
    if (persona && PERSONA_ARCHETYPES[persona]) {
      const p = PERSONA_ARCHETYPES[persona];
      await existing.update({
        name: p.name,
        title: p.title,
        company: p.company,
        industry: p.industry,
        company_size: p.company_size,
        lead_temperature: p.lead_temperature,
        interest_area: p.interest_area,
        notes: p.notes,
      } as any);
    }
    return existing;
  }

  const p = persona ? PERSONA_ARCHETYPES[persona] : null;

  const lead = await Lead.unscoped().create({
    name: p?.name || 'Campaign Test Lead',
    email: testEmail,
    phone: testPhone,
    company: p?.company || 'Test Corp',
    title: p?.title || 'QA Test Lead',
    industry: p?.industry || 'Technology',
    source: 'campaign_test',
    status: 'new',
    pipeline_stage: 'new_lead',
    lead_source_type: 'warm',
    lead_temperature: p?.lead_temperature || 'warm',
    interest_area: p?.interest_area || 'Enterprise AI',
    consent_contact: true,
    notes: p?.notes,
    company_size: p?.company_size,
  } as any);

  return lead;
}

/** Get all available persona archetypes for the UI */
export function getPersonaArchetypes() {
  return Object.entries(PERSONA_ARCHETYPES).map(([key, val]) => ({
    id: key,
    label: val.label,
    name: val.name,
    title: val.title,
    company: val.company,
    industry: val.industry,
    temperature: val.lead_temperature,
  }));
}
