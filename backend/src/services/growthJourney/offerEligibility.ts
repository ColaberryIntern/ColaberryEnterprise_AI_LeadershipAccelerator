import { BrandOfferPolicy } from '../../models/BrandOfferPolicy';
import { isOfferFamilySlug, type OfferFamilySlug } from '../../models/OfferFamily';

/**
 * Brand × offer eligibility, enforced server-side (§4, T202).
 *
 * §4: "Every content lookup, candidate action, AI prompt, landing-page
 * suggestion and campaign enrollment must enforce brand × offer eligibility
 * server-side." This module is that gate. Nothing calls it yet — T203 onward
 * wire it in — and it exists now rather than later because a policy table with
 * no resolver is the failure this programme has already paid for repeatedly: a
 * correct producer with no consumer, green tests over nothing.
 *
 * ─── THE THREE RULES ────────────────────────────────────────────────────────
 *
 * 1. FAIL CLOSED. No row means denied. An unrecognised family means denied. A
 *    failed lookup means denied. There is no input, and no upstream failure,
 *    that produces "allowed" by default.
 *
 * 2. DENY OUTRANKS ALLOW, unconditionally. `status` and the effective window
 *    soften an allow, never a deny. §4:287's requirement is that AI Flotation
 *    cannot receive business-training assets "even when the classifier, content
 *    tags or caller request are wrong" — so the deny must not be liftable by
 *    pausing a row or letting it expire, only by deleting it deliberately.
 *
 * 3. ELIGIBILITY IS NOT CONTENT APPROVAL. `allowed` says the brand may offer the
 *    family. It does not say any page, claim or CTA has been approved — the seed
 *    ships those lists empty on purpose. `approved_content_ready` is returned
 *    separately so a content lookup cannot read one as the other.
 */

export type EligibilityReason =
  | 'allowed'
  /** An operator (or the seed) recorded a deny. Outranks any allow. */
  | 'explicit_deny'
  /** No policy row at all. The default, and it denies. */
  | 'no_policy'
  /** An allow row exists but is paused or retired. */
  | 'policy_inactive'
  /** An allow row exists but `at` falls outside its effective window. */
  | 'outside_effective_window'
  /** The caller named something that is not in §4's catalog. */
  | 'unknown_offer_family'
  /** The policy lookup itself failed. Denies — see rule 1. */
  | 'lookup_failed';

export interface EligibilityDecision {
  allowed: boolean;
  reason: EligibilityReason;
  brand_id: string;
  offer_family: string;
  policy_id: string | null;
  /**
   * Whether the row carries any approved page or content collection. Separate
   * from `allowed` on purpose — see rule 3.
   */
  approved_content_ready: boolean;
}

export interface EligibilityInput {
  brandId: string;
  /** Deliberately `string`: callers pass classifier output and request bodies. */
  offerFamily: string;
  /** Defaults to now. Injectable so effective-window behaviour is testable. */
  at?: Date;
}

const DENIED = (
  brandId: string,
  offerFamily: string,
  reason: EligibilityReason,
  policyId: string | null = null,
): EligibilityDecision => ({
  allowed: false,
  reason,
  brand_id: brandId,
  offer_family: offerFamily,
  policy_id: policyId,
  approved_content_ready: false,
});

function withinWindow(row: BrandOfferPolicy, at: Date): boolean {
  const from = row.effective_from ? new Date(row.effective_from).getTime() : Number.NEGATIVE_INFINITY;
  const to = row.effective_to ? new Date(row.effective_to).getTime() : Number.POSITIVE_INFINITY;
  return at.getTime() >= from && at.getTime() <= to;
}

function contentReady(row: BrandOfferPolicy): boolean {
  const pages = row.approved_landing_pages ?? [];
  const collections = row.content_collections ?? [];
  return pages.length > 0 || collections.length > 0;
}

/**
 * Resolve one brand × family question.
 *
 * The unique index on `(brand_id, offer_family)` means at most one row can
 * match, so this reads a single row rather than reconciling overlapping grants.
 */
export async function resolveOfferEligibility(
  input: EligibilityInput,
): Promise<EligibilityDecision> {
  const { brandId, offerFamily } = input;
  const at = input.at ?? new Date();

  // Checked before the query: an unrecognised family cannot be allowed by a row
  // that happens to exist, and this keeps a typo from reaching the database as a
  // silent miss that reads identically to "no policy".
  if (!isOfferFamilySlug(offerFamily)) {
    return DENIED(brandId, offerFamily, 'unknown_offer_family');
  }

  let row: BrandOfferPolicy | null;
  try {
    row = await BrandOfferPolicy.findOne({ where: { brand_id: brandId, offer_family: offerFamily } });
  } catch (err: unknown) {
    // Rule 1. A database problem must never open the gate. No learner
    // identifier is in scope here — brand id and family name only — so there is
    // nothing to redact.
    console.error(
      JSON.stringify({
        event: 'growth_journey.offer_eligibility.lookup_failed',
        brand_id: brandId,
        offer_family: offerFamily,
        error_class: (err as { name?: string })?.name ?? 'Error',
        message: (err as { message?: string })?.message,
      }),
    );
    return DENIED(brandId, offerFamily, 'lookup_failed');
  }

  if (!row) return DENIED(brandId, offerFamily, 'no_policy');

  // Rule 2. Before status, before the window: a deny is unconditional.
  if (row.decision === 'deny') {
    return DENIED(brandId, offerFamily, 'explicit_deny', row.id);
  }

  if (row.status !== 'active') {
    return DENIED(brandId, offerFamily, 'policy_inactive', row.id);
  }

  if (!withinWindow(row, at)) {
    return DENIED(brandId, offerFamily, 'outside_effective_window', row.id);
  }

  return {
    allowed: true,
    reason: 'allowed',
    brand_id: brandId,
    offer_family: offerFamily,
    policy_id: row.id,
    approved_content_ready: contentReady(row),
  };
}

/**
 * Every family a brand may currently offer.
 *
 * Applies the same three rules in one pass, so this and
 * `resolveOfferEligibility` cannot disagree: denies are subtracted after allows
 * are collected, rather than the two being filtered independently.
 */
export async function allowedOfferFamilies(brandId: string, at?: Date): Promise<OfferFamilySlug[]> {
  const when = at ?? new Date();

  let rows: BrandOfferPolicy[];
  try {
    rows = await BrandOfferPolicy.findAll({ where: { brand_id: brandId } });
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        event: 'growth_journey.offer_eligibility.list_failed',
        brand_id: brandId,
        error_class: (err as { name?: string })?.name ?? 'Error',
        message: (err as { message?: string })?.message,
      }),
    );
    return [];
  }

  const denied = new Set<string>();
  const allowed = new Set<OfferFamilySlug>();

  for (const row of rows) {
    if (!isOfferFamilySlug(row.offer_family)) continue;
    if (row.decision === 'deny') {
      denied.add(row.offer_family);
      continue;
    }
    if (row.status !== 'active') continue;
    if (!withinWindow(row, when)) continue;
    allowed.add(row.offer_family);
  }

  // Subtracted last, so a row pair that contradicts itself resolves to denied.
  return [...allowed].filter((f) => !denied.has(f)).sort();
}

export class OfferNotEligibleError extends Error {
  readonly error_class = 'OfferNotEligibleError';
  constructor(readonly decision: EligibilityDecision) {
    super(
      `brand ${decision.brand_id} may not offer ${decision.offer_family} (${decision.reason})`,
    );
    this.name = 'OfferNotEligibleError';
  }
}

/**
 * Throwing form, for call sites where continuing past a denial is the bug —
 * campaign enrolment, content lookup, landing-page suggestion.
 *
 * A caller that wants to branch should use `resolveOfferEligibility`; this
 * exists so the safe thing is also the short thing to write.
 */
export async function assertOfferAllowed(input: EligibilityInput): Promise<EligibilityDecision> {
  const decision = await resolveOfferEligibility(input);
  if (!decision.allowed) throw new OfferNotEligibleError(decision);
  return decision;
}
