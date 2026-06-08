import Lead from '../models/Lead';
import { V1LeadInput } from '../schemas/v1LeadSchema';
import { calculateLeadScore } from './leadService';

export interface ExternalLeadResult {
  id: number;
  created_at: Date;
  was_duplicate: boolean;
}

// Idempotent lead upsert for service-to-service ingest (POST /api/v1/leads).
//
// Dedup order:
//   1. strapi_lead_id + source match  → return existing (true idempotency for retries)
//   2. email match (any age)          → return existing (prevents duplicate lead rows)
//   3. otherwise                      → create new lead
//
// The DB-level unique index on (strapi_lead_id, source) WHERE strapi_lead_id IS NOT NULL
// is a safety net; this service-layer check returns the existing record cleanly without
// relying on a constraint violation path.
export async function ingestExternalLead(payload: V1LeadInput): Promise<ExternalLeadResult> {
  // 1. Idempotency check by strapi_lead_id + source.
  // The default scope only excludes source='campaign_test'; training.colaberry.com
  // leads are visible without removing the scope.
  if (payload.strapi_lead_id) {
    const existing = await Lead.findOne({
      where: { strapi_lead_id: payload.strapi_lead_id, source: payload.source },
    });
    if (existing) {
      return { id: existing.id, created_at: existing.created_at, was_duplicate: true };
    }
  }

  // 2. Email dedup — prevents a second Lead row for a known contact.
  // Matches the pattern in leadService.createLead (same table, same unique constraint).
  const byEmail = await Lead.findOne({
    where: { email: payload.email },
    order: [['created_at', 'DESC']],
  });
  if (byEmail) {
    return { id: byEmail.id, created_at: byEmail.created_at, was_duplicate: true };
  }

  // 3. Create new lead
  const leadScore = calculateLeadScore({
    name: payload.name,
    email: payload.email,
    company: payload.company ?? '',
    role: payload.role ?? '',
    phone: payload.phone ?? '',
    title: payload.title ?? '',
    company_size: payload.company_size ?? '',
    evaluating_90_days: false,
    interest_area: '',
    message: payload.message ?? '',
    source: payload.source,
    form_type: 'training_registration',
    consent_contact: payload.consent_contact ?? false,
    utm_source: payload.utm_source ?? '',
    utm_campaign: payload.utm_campaign ?? '',
    page_url: payload.landing_page ?? '',
    corporate_sponsorship_interest: false,
    timeline: '',
  });

  // Attribution fields beyond what the Lead model stores natively are kept in
  // strapi_attribution JSONB so no data is lost and they remain queryable.
  const strapiAttribution = {
    utm_medium: payload.utm_medium,
    utm_term: payload.utm_term,
    utm_content: payload.utm_content,
    referrer: payload.referrer,
    landing_page: payload.landing_page,
    first_touch_at: payload.first_touch_at,
    last_touch_at: payload.last_touch_at,
    last_touch_page: payload.last_touch_page,
    device: payload.device,
  };

  const lead = await Lead.create({
    name: payload.name,
    email: payload.email,
    company: payload.company,
    role: payload.role,
    phone: payload.phone,
    title: payload.title,
    industry: payload.industry,
    company_size: payload.company_size,
    message: payload.message,
    consent_contact: payload.consent_contact ?? false,
    source: payload.source,
    form_type: 'training_registration',
    lead_source_type: 'warm',
    utm_source: payload.utm_source,
    utm_campaign: payload.utm_campaign,
    page_url: payload.landing_page,
    lead_score: leadScore,
    strapi_lead_id: payload.strapi_lead_id ?? null,
    strapi_attribution: strapiAttribution,
    status: 'new',
    pipeline_stage: 'new_lead',
    lead_temperature: 'cold',
  });

  return { id: lead.id, created_at: lead.created_at, was_duplicate: false };
}
