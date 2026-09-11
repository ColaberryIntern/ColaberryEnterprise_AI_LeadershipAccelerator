import { GrowthJourneyEnrollment, JourneyPath, JourneyProgram } from '../../models';
import { subjectRef } from '../../models/GrowthJourneyEnrollment';
import { env } from '../../config/env';
import type { GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { isUniqueViolation } from '../../utils/uniqueViolation';
import type { ActionContext, ActionHandler, ActionResult } from '../routingActionsService';
import { classifySubject, requestClassificationReview, type ClassifySubjectResult } from '../growthJourney/classificationService';
import { OfferNotEligibleError, assertOfferAllowed } from '../growthJourney/offerEligibility';
import { resolveDefaultJourneyProgramId } from '../growthJourney/journeyDefaults';
import { recordTransition } from '../growthJourney/transitionService';
import { requestBrandReferral } from '../growthJourney/referralRequestService';

/**
 * The Phase 2 routing actions (spec §7.2), registered as keys of the EXISTING
 * engine's `ACTION_HANDLERS` (T227). Five act on journey tables; four that
 * would contact a person or create an account are RECORDED, NOT APPLIED —
 * `deferred`, never `ok` — because Phase 2 executes nothing.
 *
 * Every handler: master-gated through the flags module (`growth_journey_disabled`
 * when off); honest — a no-op is `ok: false` with a reason, never a green
 * light; idempotent under replay by the engine's claim row above and by the
 * unique indexes beneath. No handler writes outside the growth-journey tables
 * and the enrolment it owns. No handler sends.
 *
 * The engine puts `rule_id` and `rule_version` on the context at dispatch; an
 * enrolment's metadata carries them with the payload id and the classification
 * id, so it and the execution audit row join both ways.
 */

type Flags = () => GrowthJourneyFlags;

const DISABLED: ActionResult = { ok: false, error: 'growth_journey_disabled' };

function requestedBy(ctx: ActionContext): string {
  return `routing_rule:${ctx.raw_payload_id}`;
}

async function classify(ctx: ActionContext, flags: GrowthJourneyFlags): Promise<ClassifySubjectResult> {
  return classifySubject({ anchor: { leadId: Number(ctx.lead.id) }, trigger: 'lead_ingest', flags });
}

async function programFor(ctx: ActionContext, action: Record<string, unknown>, classified: ClassifySubjectResult): Promise<JourneyProgram | null | { error: string }> {
  const brandId = ctx.brand_id ?? null;
  if (!brandId) return { error: 'unresolved_context' };
  const slug = typeof action.program_slug === 'string' && action.program_slug
    ? action.program_slug
    : classified.status === 'classified' ? classified.result.journey_program : null;
  if (slug) {
    const program = await JourneyProgram.findOne({ where: { brand_id: brandId, slug } });
    if (!program) return { error: `program_not_found:${slug}` };
    if (program.status !== 'active') return { error: `program_not_active:${slug}` };
    return program;
  }
  const id = await resolveDefaultJourneyProgramId({ sourceSlug: ctx.source_slug });
  if (!id) return { error: 'brand_has_no_default' };
  return JourneyProgram.findByPk(id);
}

/** A `needs_review` classification row naming the family the policy refused; null when the subject cannot be classified. */
async function reviewRefusedPath(ctx: ActionContext, flags: GrowthJourneyFlags, family: string, why: string): Promise<string | null> {
  const classified = await classify(ctx, flags);
  if (classified.status !== 'classified') return null;
  const r = await requestClassificationReview({ classificationId: classified.row.id, requestedBy: requestedBy(ctx), reason: `offer_not_eligible:${family}:${why}` });
  return r.status === 'not_found' ? null : r.row.id;
}

/* ── The handlers, at module scope; `flags` is a parameter, never a closure ── */


const assignJourneyProgram = (flags: Flags): ActionHandler => async (action, ctx) => {
  const classified = await classify(ctx, flags());
  if (classified.status === 'unresolved') return { ok: false, error: `subject_unresolved:${classified.reason}` };
  const program = await programFor(ctx, action, classified);
  if (!program) return { ok: false, error: 'program_row_missing' };
  if ('error' in program) return { ok: false, error: program.error };

  const ref = subjectRef({ leadId: Number(ctx.lead.id) });
  if (!ref) return { ok: false, error: 'no_subject_anchor' };
  const classificationId = classified.status === 'classified' ? classified.row.id : null;
  try {
    const row = await GrowthJourneyEnrollment.create({
      tenant_id: program.tenant_id,
      brand_id: program.brand_id,
      program_id: program.id,
      path_id: null,
      subject_ref: ref,
      lead_id: Number(ctx.lead.id),
      enrollment_id: null,
      status: 'active',
      source: 'routing_rule',
      metadata: { rule_id: ctx.rule_id ?? null, rule_version: ctx.rule_version ?? null, raw_payload_id: ctx.raw_payload_id, classification_id: classificationId },
    });
    await recordTransition({
      tenantId: program.tenant_id, brandId: program.brand_id, programId: program.id, subjectRef: ref, leadId: Number(ctx.lead.id), enrollmentId: null,
      type: 'program_assigned', from: null, to: { program_id: program.id, program_slug: program.slug }, reason: 'routing rule assigned the programme',
      evidence: classificationId ? [`classification:${classificationId}`] : [], requestedBy: requestedBy(ctx),
    });
    return { ok: true, detail: { enrollment_id: row.id, program_slug: program.slug, classification_id: classificationId } };
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await GrowthJourneyEnrollment.findOne({ where: { program_id: program.id, subject_ref: ref } });
    return { ok: true, detail: { enrollment_id: existing?.id ?? null, program_slug: program.slug, reason: 'already_enrolled' } };
  }
};

const assignServicePath = (flags: Flags): ActionHandler => async (action, ctx) => {
  const brandId = ctx.brand_id ?? null;
  if (!brandId) return { ok: false, error: 'unresolved_context' };
  const ref = subjectRef({ leadId: Number(ctx.lead.id) });
  if (!ref) return { ok: false, error: 'no_subject_anchor' };
  const enrollment = await GrowthJourneyEnrollment.findOne({ where: { brand_id: brandId, subject_ref: ref }, order: [['enrolled_at', 'DESC']] });
  if (!enrollment) return { ok: false, error: 'no_enrollment' };

  let family = typeof action.offer_family === 'string' && action.offer_family ? action.offer_family : null;
  if (!family) {
    const classified = await classify(ctx, flags());
    family = classified.status === 'classified' ? classified.result.primary_path : null;
  }
  if (!family) return { ok: false, error: 'no_path_named' };

  // The boundary, again, before any write: policy beats the rule author too. A
  // refusal leaves the enrolment alone and puts the subject in front of a human.
  try {
    await assertOfferAllowed({ brandId, offerFamily: family });
  } catch (err: unknown) {
    if (!(err instanceof OfferNotEligibleError)) throw err;
    await reviewRefusedPath(ctx, flags(), family, err.decision.reason);
    return { ok: false, error: `offer_not_eligible:${err.decision.reason}` };
  }
  const path = await JourneyPath.findOne({ where: { program_id: enrollment.program_id, offer_family: family } });
  if (!path) return { ok: false, error: `path_not_defined:${family}` };
  if (enrollment.path_id === path.id) return { ok: true, detail: { path_id: path.id, offer_family: family, reason: 'already_on_path' } };

  const from = enrollment.path_id;
  await enrollment.update({ path_id: path.id });
  await recordTransition({
    tenantId: enrollment.tenant_id, brandId, programId: enrollment.program_id, subjectRef: ref, leadId: Number(ctx.lead.id), enrollmentId: enrollment.enrollment_id,
    type: from ? 'path_changed' : 'path_assigned', from: from ? { path_id: from } : null, to: { path_id: path.id, offer_family: family },
    reason: 'routing rule assigned the path', requestedBy: requestedBy(ctx),
  });
  return { ok: true, detail: { path_id: path.id, offer_family: family, changed_from: from } };
};

const requestReview = (flags: Flags): ActionHandler => async (action, ctx) => {
  const classified = await classify(ctx, flags());
  if (classified.status !== 'classified') return { ok: false, error: `not_classified:${classified.status}` };
  const r = await requestClassificationReview({
    classificationId: classified.row.id,
    requestedBy: requestedBy(ctx),
    reason: typeof action.reason === 'string' ? action.reason : 'routing rule requested review',
  });
  if (r.status === 'not_found') return { ok: false, error: 'classification_not_found' };
  return { ok: true, detail: { classification_id: r.row.id, replayed: r.replayed } };
};

const referralRequest = (flags: Flags): ActionHandler => async (action, ctx) => {
  if (!ctx.brand_id || !ctx.tenant_id) return { ok: false, error: 'unresolved_context' };
  let family = typeof action.offer_family === 'string' && action.offer_family ? action.offer_family : null;
  if (!family) {
    const classified = await classify(ctx, flags());
    // The ladder proposes a referral only when it dropped a denied family; that family is the one to refer.
    const denied = classified.status === 'classified' ? classified.result.eligibility?.offer_family ?? null : null;
    family = classified.status === 'classified' && classified.result.referral_target_brand_id ? denied : null;
  }
  if (!family) return { ok: false, error: 'no_family_to_refer' };
  const r = await requestBrandReferral({
    anchor: { leadId: Number(ctx.lead.id) }, fromBrandId: ctx.brand_id, fromTenantId: ctx.tenant_id, offerFamily: family,
    reason: typeof action.reason === 'string' ? action.reason : 'routing rule requested a cross-brand referral', requestedBy: requestedBy(ctx),
  });
  if (!r.ok) return { ok: false, error: r.reason === 'ambiguous_target' ? `ambiguous_target:${r.candidates.map((c) => c.brand_slug).join(',')}` : r.reason };
  return { ok: true, detail: { transition_id: r.row.id, to_brand_slug: r.to_brand_slug, replayed: r.replayed } };
};

const suppressOrWait: ActionHandler = async (action) => ({
  ok: 'deferred',
  detail: { kind: action.kind === 'suppress' ? 'suppress' : 'wait', reason: action.reason ?? null, until: action.until ?? null },
});

/** Recorded, not applied: Phase 2 executes nothing that contacts a person or creates an account. */
const deferred = (would: string): ActionHandler => async (action) => {
  const { type: _type, ...payload } = action;
  return { ok: 'deferred', detail: { would, payload, deferred_reason: 'phase2_no_execution' } };
};

/** Builds the nine handlers. `flags` is injected so tests never touch the environment. */
export function makeGrowthJourneyActions(flags: Flags = () => env.growthJourney): Record<string, ActionHandler> {
  const gated = (fn: ActionHandler): ActionHandler => async (action, ctx) => (flags().growthJourneyEnabled ? fn(action, ctx) : DISABLED);
  return {
    assign_journey_program: gated(assignJourneyProgram(flags)),
    assign_service_path: gated(assignServicePath(flags)),
    request_classification_review: gated(requestReview(flags)),
    create_cross_brand_referral_request: gated(referralRequest(flags)),
    suppress_or_wait: gated(suppressOrWait),
    create_business_account: gated(deferred('create_business_account')),
    enter_governed_campaign: gated(deferred('enter_governed_campaign')),
    schedule_ai_qualification: gated(deferred('schedule_ai_qualification')),
    create_handoff: gated(deferred('create_handoff')),
  };
}

export const GROWTH_JOURNEY_ACTION_TYPES = [
  'assign_journey_program',
  'assign_service_path',
  'request_classification_review',
  'create_cross_brand_referral_request',
  'suppress_or_wait',
  'create_business_account',
  'enter_governed_campaign',
  'schedule_ai_qualification',
  'create_handoff',
] as const;
