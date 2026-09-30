import { GrowthJourneyTransition } from '../../models';
import type { GrowthJourneyTransitionAttributes } from '../../models/GrowthJourneyTransition';
import { computeIdempotencyKey } from '../inboxCase/textNormalization';
import { isUniqueViolation } from '../../utils/uniqueViolation';
import { classifyError } from '../../utils/errorClassifier';
import { brandsAllowingFamily, resolveOfferEligibility } from './offerEligibility';
import { resolveSubject, type SubjectAnchor } from './subjectResolver';
import { subjectRefOf } from './classification/inputs';

/**
 * Cross-brand referral REQUEST (Phase 2, T228). A request record and nothing
 * more: a `growth_journey_transitions` row saying "brand A cannot offer this
 * family; brand B can; somebody should decide". It creates no relationship,
 * no lead, no account and no task — the approval that writes the second
 * `lead_tenant_contexts` row is Phase 4's and independently gated (spec §14).
 *
 * Who may be a target: exactly ONE other brand whose active `allow` policy
 * covers the family (`brandsAllowingFamily`). None → refused; several →
 * refused as ambiguous with the candidates named, for a human. And a referral
 * is only for what the source brand may NOT offer: if the source brand's own
 * policy allows the family, there is nothing to refer.
 *
 * Append-only and replay-safe: the idempotency key covers (subject, from, to,
 * family, 'requested'), so the same request twice is the same row.
 */

export interface ReferralRequestArgs {
  anchor: SubjectAnchor;
  fromBrandId: string;
  fromTenantId: string;
  offerFamily: string;
  reason: string;
  evidence?: string[];
  /** `classifier` | `routing_rule:<raw payload id>` | `human:<admin id>` */
  requestedBy: string;
}

export type ReferralRequestResult =
  | { ok: true; row: GrowthJourneyTransition; replayed: boolean; to_brand_id: string; to_brand_slug: string }
  | { ok: false; reason: 'unresolved_subject' | 'from_brand_can_offer' | 'no_brand_offers_family' | 'same_brand'; detail?: string }
  | { ok: false; reason: 'ambiguous_target'; candidates: Array<{ brand_id: string; brand_slug: string }> };

export async function requestBrandReferral(args: ReferralRequestArgs): Promise<ReferralRequestResult> {
  const resolution = await resolveSubject(args.anchor);
  if (resolution.status === 'unresolved') return { ok: false, reason: 'unresolved_subject', detail: resolution.reason };
  const subject = resolution.subject;

  // A referral is for what the source brand may NOT offer.
  const own = await resolveOfferEligibility({ brandId: args.fromBrandId, offerFamily: args.offerFamily });
  if (own.allowed) return { ok: false, reason: 'from_brand_can_offer' };

  const candidates = (await brandsAllowingFamily(args.offerFamily)).filter((b) => b.brand_id !== args.fromBrandId);
  if (candidates.length === 0) return { ok: false, reason: 'no_brand_offers_family' };
  if (candidates.length > 1) {
    return { ok: false, reason: 'ambiguous_target', candidates: candidates.map((c) => ({ brand_id: c.brand_id, brand_slug: c.brand_slug })) };
  }
  const to = candidates[0];
  if (to.brand_id === args.fromBrandId) return { ok: false, reason: 'same_brand' };

  const subject_ref = subjectRefOf(subject);
  const row: GrowthJourneyTransitionAttributes = {
    tenant_id: args.fromTenantId,
    brand_id: args.fromBrandId,
    program_id: null,
    subject_ref,
    lead_id: subject.lead_id,
    enrollment_id: subject.enrollment_id,
    transition_type: 'brand_referral_requested',
    from_value: { brand_id: args.fromBrandId },
    to_value: { brand_id: to.brand_id, brand_slug: to.brand_slug, tenant_id: to.tenant_id, offer_family: args.offerFamily },
    status: 'requested',
    reason: args.reason,
    evidence: [...(args.evidence ?? []), `from_brand_eligibility:${own.reason}`, `target:${to.brand_slug}`],
    requested_by: args.requestedBy,
    idempotency_key: computeIdempotencyKey([subject_ref, args.fromBrandId, to.brand_id, args.offerFamily, 'requested']),
  };

  try {
    const created = await GrowthJourneyTransition.create(row);
    log({ event: 'growth_journey.referral.requested', subject_ref, from_brand_id: args.fromBrandId, to_brand_slug: to.brand_slug, offer_family: args.offerFamily, requested_by: args.requestedBy });
    return { ok: true, row: created, replayed: false, to_brand_id: to.brand_id, to_brand_slug: to.brand_slug };
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) {
      log({ event: 'growth_journey.referral.write_failed', subject_ref, error_class: classifyError(err) });
      throw err;
    }
    const existing = await GrowthJourneyTransition.findOne({ where: { idempotency_key: row.idempotency_key } });
    if (!existing) throw err;
    return { ok: true, row: existing, replayed: true, to_brand_id: to.brand_id, to_brand_slug: to.brand_slug };
  }
}

/** Subject refs and slugs only — never a person's text. */
function log(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ service: 'growth-journey', ...fields }));
}
