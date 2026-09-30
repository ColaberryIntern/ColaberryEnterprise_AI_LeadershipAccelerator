import { Op } from 'sequelize';
import { classifyError } from '../../../utils/errorClassifier';
import {
  Brand,
  Campaign,
  EntryPoint,
  GrowthJourneyClassification,
  JourneyProgram,
  Lead,
  LeadSource,
  LeadTenantContext,
  OrgMember,
  Organization,
  PageEvent,
} from '../../../models';
import { subjectRef } from '../../../models/GrowthJourneyEnrollment';
import { resolvePublicContext } from '../../../modules/tenancy/tenantResolver';
import { resolveSubject, type SubjectAnchor, type SubjectView, type UnresolvedReason } from '../subjectResolver';
import {
  UNAVAILABLE,
  type AccountInput,
  type BehaviourInput,
  type BrandContext,
  type CampaignInput,
  type ClassificationInput,
  type FormInput,
  type LockedClassification,
  type ReplyInput,
} from './types';

/**
 * Loads a `ClassificationInput` for a subject (Phase 2, T225). READS ONLY.
 *
 * Every lookup is wrapped: a failed one marks its input `unavailable` and the
 * ladder records that — it never treats a missing input as an empty one
 * (Scenario J). Nothing here writes, sends, or reads a flag.
 *
 * The brand the subject is classified UNDER is the campaign's for a reply to
 * a registered campaign, otherwise the brand the lead's source resolves to.
 * A brand's default programme is offered only while that programme is
 * `active`, matching `resolveDefaultJourney`; while the four programmes are
 * draft (as shipped in Phase 1) the slug is null and the reason says why.
 */

export type ClassificationTrigger = 'lead_ingest' | 'reply' | 'form' | 'manual' | 'replay';

export interface LoadExtras {
  reply?: { body: string; channel: 'email' | 'sms'; campaign_id?: string | null; provider_message_id?: string | null };
  /** A campaign to classify under, when the caller knows it (e.g. a reply). */
  campaignId?: string | null;
}

export type LoadedInput =
  | {
      status: 'loaded';
      input: ClassificationInput;
      subject: SubjectView;
      /** The brand context the boundary will be checked against, or null. */
      brand: BrandContext | null;
      /** Which inputs could not be loaded — for the log line and the Why. */
      unavailable: string[];
    }
  | { status: 'unresolved'; reason: UnresolvedReason };

const BEHAVIOUR_WINDOW_DAYS = 30;

export async function loadClassificationInput(
  anchor: SubjectAnchor,
  extras: LoadExtras = {},
): Promise<LoadedInput> {
  const resolution = await resolveSubject(anchor);
  if (resolution.status === 'unresolved') return { status: 'unresolved', reason: resolution.reason };
  const subject = resolution.subject;
  const unavailable: string[] = [];

  const leadOrUnavailable = await guarded('lead', unavailable, () =>
    subject.lead_id === null ? null : Lead.findByPk(subject.lead_id),
  );
  // An unavailable lead row makes form and source brand unavailable too —
  // marked, not emptied.
  const lead: Lead | null = leadOrUnavailable === UNAVAILABLE ? null : leadOrUnavailable;
  const leadMissing = leadOrUnavailable === UNAVAILABLE;
  if (leadMissing) unavailable.push('form', 'source_brand');

  const form = leadMissing ? UNAVAILABLE : await guarded('form', unavailable, () => formFrom(lead));
  const campaign = await guarded('campaign', unavailable, () =>
    campaignFrom(extras.campaignId ?? extras.reply?.campaign_id ?? null, subject),
  );
  const sourceBrand = leadMissing ? UNAVAILABLE : await guarded('source_brand', unavailable, () => sourceBrandFrom(lead));
  const account = await guarded('account', unavailable, () => accountFrom(subject));
  const behaviour = await guarded('behaviour', unavailable, () => behaviourFrom(subject));

  const brand = campaignBrand(campaign) ?? asBrand(sourceBrand);
  const lock = await guarded('lock', unavailable, () => (brand ? lockFor(subject, brand.brand_id) : null));

  const reply: ReplyInput | null = extras.reply ? { body: extras.reply.body, channel: extras.reply.channel } : null;

  return {
    status: 'loaded',
    subject,
    brand,
    unavailable,
    input: {
      subject_ref: subjectRefOf(subject),
      lock: lock === UNAVAILABLE ? null : lock,
      form,
      campaign,
      source_brand: sourceBrand,
      account,
      behaviour,
      reply,
    },
  };
}

/** Run one lookup; on failure record the name (to the row) and the error class (to the log), and return UNAVAILABLE. */
async function guarded<T>(name: string, unavailable: string[], fn: () => Promise<T> | T): Promise<T | typeof UNAVAILABLE> {
  try {
    return await fn();
  } catch (err: unknown) {
    unavailable.push(name);
    console.error(JSON.stringify({ service: 'growth-journey', event: 'growth_journey.classification.input_unavailable', input: name, error_class: classifyError(err) }));
    return UNAVAILABLE;
  }
}

const asBrand = (b: BrandContext | typeof UNAVAILABLE | null): BrandContext | null => (b && b !== UNAVAILABLE ? b : null);
const campaignBrand = (c: CampaignInput | typeof UNAVAILABLE | null): BrandContext | null => (c && c !== UNAVAILABLE ? c.brand : null);

/**
 * The derived subject key, through the ONE builder Phase 1 established
 * (`subjectRef`: enrollment beats lead). A subject with neither anchor — an
 * org member or a visitor alone — gets the same shape with its own prefix, so
 * the two builders can never disagree on the cases they share.
 */
export function subjectRefOf(subject: SubjectView): string {
  const shared = subjectRef({ enrollmentId: subject.enrollment_id, leadId: subject.lead_id });
  if (shared) return shared;
  if (subject.org_member_id) return `org_member:${subject.org_member_id}`;
  return `visitor:${subject.visitor_id}`;
}

async function formFrom(lead: Lead | null): Promise<FormInput | null> {
  if (!lead) return null;
  const entry = lead.entry_point_id ? await EntryPoint.findByPk(lead.entry_point_id) : null;
  return {
    entry_slug: entry?.slug ?? null,
    entry_type: (entry as { entry_type?: string | null } | null)?.entry_type ?? null,
    form_type: lead.form_type ?? null,
    interest_area: lead.interest_area ?? null,
    // No lead column carries an explicit offer-family choice today; the field
    // exists so a form that adds one has somewhere to land without a rule change.
    explicit_offer_family: null,
    message: lead.message ?? null,
  };
}

/**
 * The brand context for a brand id: slug, tenant, and the default programme
 * ONLY while it is active (the `resolveDefaultJourney` rule).
 */
export async function brandContextFor(brandId: string): Promise<BrandContext | null> {
  const brand = await Brand.findByPk(brandId);
  if (!brand) return null;
  const programId = (brand as { default_journey_program_id?: string | null }).default_journey_program_id ?? null;
  const program = programId ? await JourneyProgram.findByPk(programId) : null;
  return {
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    brand_slug: brand.slug,
    default_program_slug: program && program.status === 'active' ? program.slug : null,
  };
}

async function sourceBrandFrom(lead: Lead | null): Promise<BrandContext | null> {
  if (!lead) return null;
  const source = lead.source_id ? await LeadSource.findByPk(lead.source_id) : null;
  const slug = source?.slug ?? lead.source ?? null;
  if (!slug) return null;
  const resolved = await resolvePublicContext({ sourceSlug: slug });
  if (!resolved.context) return null;
  return brandContextFor(resolved.context.brandId);
}

async function campaignFrom(campaignId: string | null, subject: SubjectView): Promise<CampaignInput | null> {
  let id = campaignId;
  if (!id && subject.lead_id !== null) {
    // The most recent brand relationship that names a campaign.
    const ctx = await LeadTenantContext.findOne({
      where: { lead_id: subject.lead_id, last_campaign_id: { [Op.ne]: null } },
      order: [['last_touch_at', 'DESC']],
    });
    id = ctx?.last_campaign_id ?? null;
  }
  if (!id) return null;
  const campaign = await Campaign.findByPk(id);
  if (!campaign) return null;
  const settings = ((campaign as { settings?: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
  const brandId = (campaign as { brand_id?: string | null }).brand_id ?? null;
  return {
    campaign_id: campaign.id,
    campaign_key: typeof settings.campaign_key === 'string' ? settings.campaign_key : null,
    brand: brandId ? await brandContextFor(brandId) : null,
    offer_family: typeof settings.offer_family === 'string' ? settings.offer_family : null,
    interest_group: (campaign as { interest_group?: string | null }).interest_group ?? null,
  };
}

async function accountFrom(subject: SubjectView): Promise<AccountInput | null> {
  if (!subject.org_member_id) return null;
  const member = await OrgMember.findByPk(subject.org_member_id);
  if (!member) return null;
  const org = await Organization.findByPk(member.org_id);
  return {
    has_organization: Boolean(org),
    organization_type: (org as { organization_type?: string | null } | null)?.organization_type ?? null,
  };
}

async function behaviourFrom(subject: SubjectView): Promise<BehaviourInput | null> {
  if (!subject.visitor_id) return null;
  const since = new Date(Date.now() - BEHAVIOUR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await PageEvent.findAll({
    where: { visitor_id: subject.visitor_id, created_at: { [Op.gte]: since }, page_category: { [Op.ne]: null } },
    attributes: ['page_category'],
  });
  const page_categories: Record<string, number> = {};
  for (const r of rows) {
    const c = r.page_category;
    if (c) page_categories[c] = (page_categories[c] ?? 0) + 1;
  }
  return { page_categories };
}

async function lockFor(subject: SubjectView, brandId: string): Promise<LockedClassification | null> {
  const row = await GrowthJourneyClassification.findOne({
    where: { subject_ref: subjectRefOf(subject), brand_id: brandId, locked: true },
    order: [['created_at', 'DESC']],
  });
  if (!row) return null;
  return {
    classification_id: row.id,
    brand_relationship: row.brand_relationship,
    journey_program: row.journey_program_slug,
    primary_path: row.primary_path,
    secondary_paths: row.secondary_paths ?? [],
    intent: row.intent,
    decided_by: row.decided_by ?? 'human',
  };
}
