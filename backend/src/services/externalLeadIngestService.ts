import Lead from '../models/Lead';
import { V1LeadInput } from '../schemas/v1LeadSchema';
import { calculateLeadScore } from './leadService';

export interface ExternalLeadResult {
  id: number;
  created_at: Date;
  was_duplicate: boolean;
}

// Hardcoded enum values for training-site leads — training_registration is the only
// form type delivered by this endpoint; warm is correct because these are self-selected
// registrants, not cold outbound contacts.
const FORM_TYPE = 'training_registration' as const;
const LEAD_SOURCE_TYPE = 'warm' as const;
const LEAD_STATUS = 'new' as const;
const PIPELINE_STAGE = 'new_lead' as const;
const LEAD_TEMPERATURE = 'cold' as const;

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {}
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-lead-ingest', event, outcome, ...context }) + '\n'
  );
}

// Idempotent lead upsert for service-to-service ingest (POST /api/v1/leads).
//
// Dedup order:
//   1. strapi_lead_id + source match  → return existing (true idempotency for retries)
//   2. email match (any source)       → return existing (first-touch wins; see note below)
//   3. otherwise                      → create new lead
//
// Design decisions (intentional — do not "fix" without consulting Ali):
//
//   First-touch-wins: if a lead already exists by email, the incoming payload's
//   attribution data is NOT merged into the existing row. The original source and
//   UTM data are preserved. A second-touch event from a different campaign is not
//   recorded. Rationale: the sales process begins on first touch; subsequent touches
//   from the same person don't change which cohort or rep owns them. If multi-touch
//   attribution becomes a requirement, add a lead_touches table rather than mutating
//   the canonical lead row.
//
//   Cross-source email dedup: the email lookup has no source filter. A lead originally
//   from landing_page will be treated as the duplicate for a training.colaberry.com POST
//   with the same email. This is intentional: we treat a person as a single lead
//   regardless of which Colaberry property they came through first.
//
// The DB-level unique index on (strapi_lead_id, source) WHERE strapi_lead_id IS NOT NULL
// is a safety net; this service-layer check returns the existing record cleanly without
// relying on a constraint violation path.
export async function ingestExternalLead(payload: V1LeadInput, correlation_id?: string): Promise<ExternalLeadResult> {
  // 1. Idempotency check by strapi_lead_id + source.
  if (payload.strapi_lead_id) {
    const existing = await Lead.findOne({
      where: { strapi_lead_id: payload.strapi_lead_id, source: payload.source },
    });
    if (existing) {
      log('info', 'lead_dedup_hit', 'success', { correlation_id, tier: 1, dedup_by: 'strapi_lead_id', existing_id: existing.id });
      return { id: existing.id, created_at: existing.created_at, was_duplicate: true };
    }
  }

  // 2. Email dedup — first-touch wins (see design note above).
  const byEmail = await Lead.findOne({
    where: { email: payload.email },
    order: [['created_at', 'DESC']],
  });
  if (byEmail) {
    log('info', 'lead_dedup_hit', 'success', { correlation_id, tier: 2, dedup_by: 'email', existing_id: byEmail.id });
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
    form_type: FORM_TYPE,
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

  try {
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
      form_type: FORM_TYPE,
      lead_source_type: LEAD_SOURCE_TYPE,
      utm_source: payload.utm_source,
      utm_campaign: payload.utm_campaign,
      page_url: payload.landing_page,
      lead_score: leadScore,
      strapi_lead_id: payload.strapi_lead_id ?? null,
      strapi_attribution: strapiAttribution,
      status: LEAD_STATUS,
      pipeline_stage: PIPELINE_STAGE,
      lead_temperature: LEAD_TEMPERATURE,
    });

    log('info', 'lead_created', 'success', { correlation_id, lead_id: lead.id, source: payload.source });
    return { id: lead.id, created_at: lead.created_at, was_duplicate: false };
  } catch (err) {
    log('error', 'lead_create_failed', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
      source: payload.source,
    });
    throw err;
  }
}
