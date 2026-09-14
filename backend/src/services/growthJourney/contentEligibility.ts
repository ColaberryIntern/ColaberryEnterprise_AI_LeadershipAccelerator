import { GrowthJourneyContentRule } from '../../models';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import { resolveOfferEligibility } from './offerEligibility';

/**
 * May this brand use this asset, for this offer, right now? (§10; Phase 3 T305.)
 *
 * ─── IT IS THE READER `approved_content_ready` NEVER HAD ────────────────────
 *
 * `offerEligibility` has computed `approved_content_ready` since Phase 2 and
 * nothing has ever branched on it: it is spread into the persisted
 * classification payload and read by no code path at all. A flag nobody reads is
 * indistinguishable from a comment. This is the branch.
 *
 * It is FALSE for every policy row in production, because it is derived from
 * `approved_landing_pages` and `content_collections` — two JSONB lists that
 * default to `[]` and that nothing in this repo writes. So today this gate
 * refuses, every growth-journey candidate that wants an asset becomes a `WAIT`
 * with `content_not_approved`, and that is the SPECIFIED behaviour rather than a
 * defect: §15 asks for one governed action per subject or a named refusal, and
 * "nobody has approved any content for this brand yet" is the honest refusal.
 * `growth_journey_content_rules` is the writer that changes it, in Phase 4.
 *
 * ─── EXPLORER DOES NOT CALL THIS, AND MUST NOT ──────────────────────────────
 *
 * Explorer's own path resolves content through
 * `explorerGrowth/content/resolveContentAssets` with
 * `{brand_id: null, allow_unscoped: true}` and never consults this gate. If it
 * did, every one of its learners would lose their content on the day this
 * shipped — for exactly the reason above. A test asserts no file under
 * `explorerGrowth/` imports this module.
 *
 * ─── IT ANSWERS TWO QUESTIONS, AND THEY ARE NOT THE SAME ────────────────────
 *
 * Called WITHOUT an asset it answers "may this brand cite content for this offer
 * at all": the brand boundary, `approved_content_ready`, and any collection-level
 * declaration. Called WITH one it also checks that asset's own columns and its
 * own declaration. The pre-selection caller asks the first, because there is no
 * point selecting an asset a brand may not cite - and an early version of this
 * file conflated the two, passing an empty object and refusing everything on the
 * strength of columns that were never populated.
 *
 * ─── WHEN A RULE EXISTS, THE RULE DECIDES ───────────────────────────────────
 *
 * A `growth_journey_content_rules` row IS the §10 declaration, so an approved
 * rule supersedes the asset's own unreviewed columns. The absence of a rule is
 * NOT a denial — it falls back to the asset's own columns. That asymmetry is
 * deliberate and load-bearing: the table ships empty (declaring 646 existing
 * assets is a human review job), and "no rule means no" would have been a
 * second way to take everyone's content away.
 *
 * ─── EVERY REFUSAL IS NAMED, AND A LOOKUP FAILURE REFUSES ───────────────────
 *
 * No boolean is returned without a reason, and no path returns a permissive
 * answer on an error: an unreadable declaration is not an approval.
 */

/** The asset fields this gate reads. A row from `explorer_content_assets`. */
export interface ContentAssetFacts {
  id?: string | null;
  brand_id?: string | null;
  offer_family?: string | null;
  approval_status?: string | null;
  eligible_programs?: string[] | null;
  eligible_paths?: string[] | null;
}

export interface ContentAllowedInput {
  brandId: string;
  tenantId: string;
  /** The family this asset would speak for. Deliberately `string`: callers pass classifier output. */
  offerFamily: string;
  /**
   * OMITTED for the pre-selection question - "may this brand cite content for
   * this offer at all" - which is what the content adapter asks before it looks
   * anything up. Supplied for the per-asset question, which additionally checks
   * the asset's own columns and its own declaration.
   *
   * Those columns are enforced in SQL too, by the resolver's brand predicate, so
   * omitting the asset here loses no protection: it asks a narrower question.
   */
  asset?: ContentAssetFacts;
  /**
   * Whether an UNDECLARED asset counts as this brand's. True only for Colaberry
   * Training, which is Explorer's own brand and therefore owns the Explorer-era
   * rows. The same marker the SQL predicate takes, for the same reason.
   */
  allowUnscoped: boolean;
  programSlug?: string | null;
  state?: string | null;
  at?: Date;
}

export interface ContentVerdict {
  allowed: boolean;
  /** Machine-readable, always present — a bare `false` is unactionable downstream. */
  reason: string;
  /** The declaration that answered, when one did. */
  rule_id: string | null;
}

const ALLOWED_RULE_STATUS = 'approved';
const ALLOWED_ASSET_STATUS = 'approved';

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(
    redactForLogs(
      JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields }),
    ),
  );
}

function listed(list: unknown, value: string | null | undefined): boolean | null {
  // `null` means the declaration says nothing about this dimension, which is not
  // the same as declaring an empty set. An empty list is read the same way: a
  // declaration that named no programme is not a declaration that excluded them
  // all, and reading it the other way would refuse every asset in the table.
  if (!Array.isArray(list) || list.length === 0) return null;
  if (!value) return false;
  return list.includes(value);
}

function withinWindow(from: unknown, to: unknown, at: Date): boolean {
  const start = from ? new Date(from as string).getTime() : Number.NEGATIVE_INFINITY;
  const end = to ? new Date(to as string).getTime() : Number.POSITIVE_INFINITY;
  return at.getTime() >= start && at.getTime() <= end;
}

/** The asset's own columns, consulted only when no declaration exists. */
function assetVerdict(input: ContentAllowedInput & { asset: ContentAssetFacts }): ContentVerdict {
  const { asset, brandId, offerFamily, allowUnscoped } = input;

  if (asset.brand_id && asset.brand_id !== brandId) {
    return { allowed: false, reason: 'asset_other_brand', rule_id: null };
  }
  if (!asset.brand_id && !allowUnscoped) {
    return { allowed: false, reason: 'asset_unscoped_not_this_brand', rule_id: null };
  }
  if (asset.offer_family && asset.offer_family !== offerFamily) {
    return { allowed: false, reason: 'asset_other_offer_family', rule_id: null };
  }
  const program = listed(asset.eligible_programs, input.programSlug ?? null);
  if (program === false) {
    return { allowed: false, reason: 'asset_other_program', rule_id: null };
  }
  if (asset.approval_status !== ALLOWED_ASSET_STATUS) {
    // NULL on every Explorer-era row, and named as such rather than as a
    // generic refusal: nobody reviewed it, which is different from rejecting it.
    return {
      allowed: false,
      reason: `asset_not_approved:${asset.approval_status ?? 'none'}`,
      rule_id: null,
    };
  }
  return { allowed: true, reason: 'asset_declares_this_brand', rule_id: null };
}

export async function assertContentAllowed(input: ContentAllowedInput): Promise<ContentVerdict> {
  const at = input.at ?? new Date();

  // 1. The brand boundary first. A brand that may not make this offer may not
  //    cite content for it either, whatever any declaration says — this is the
  //    same question `resolveOfferEligibility` answers for a candidate, asked
  //    through the same function rather than re-derived here.
  const offer = await resolveOfferEligibility({
    brandId: input.brandId,
    offerFamily: input.offerFamily,
    at,
  });
  if (!offer.allowed) {
    return { allowed: false, reason: `offer_not_eligible:${offer.reason}`, rule_id: null };
  }

  // 2. THE BRANCH `approved_content_ready` never had.
  if (!offer.approved_content_ready) {
    return { allowed: false, reason: 'content_not_approved', rule_id: null };
  }

  // 3. The declaration, when there is one.
  let rules: unknown[];
  try {
    rules = await GrowthJourneyContentRule.findAll({
      where: {
        brand_id: input.brandId,
        tenant_id: input.tenantId,
        ...(input.asset?.id ? { asset_id: input.asset.id } : {}),
      },
      order: [['version', 'DESC']],
      limit: 10,
    });
  } catch (err: unknown) {
    // Fail closed. An unreadable declaration is not an approval.
    log('growth_journey.content_rule_lookup_failed', {
      error_class: classifyError(err),
      brand_id: input.brandId,
      asset_id: input.asset?.id ?? null,
    });
    return { allowed: false, reason: 'content_rule_lookup_failed', rule_id: null };
  }

  const rule = (input.asset?.id ? rules[0] : undefined) as
    | {
        id: string;
        approval_status?: string;
        offer_family?: string | null;
        eligible_programs?: unknown;
        lifecycle_states?: unknown;
        effective_from?: unknown;
        expires_at?: unknown;
      }
    | undefined;

  // 4. No asset named: the caller asked the policy question, and every policy
  //    check has passed. A collection-level declaration that denies would have
  //    been found above; there is nothing else this question can consult.
  if (!input.asset) {
    return { allowed: true, reason: 'policy_allows', rule_id: null };
  }

  // 5. No declaration falls back to the asset's own columns — never to a denial.
  //    The table ships empty, and a denial here would refuse every asset in the
  //    registry the moment this shipped.
  if (!rule) return assetVerdict({ ...input, asset: input.asset });

  if (rule.approval_status !== ALLOWED_RULE_STATUS) {
    return {
      allowed: false,
      reason: `content_rule_not_approved:${rule.approval_status ?? 'none'}`,
      rule_id: rule.id,
    };
  }
  if (!withinWindow(rule.effective_from, rule.expires_at, at)) {
    return { allowed: false, reason: 'content_rule_window', rule_id: rule.id };
  }
  if (rule.offer_family && rule.offer_family !== input.offerFamily) {
    return { allowed: false, reason: 'content_rule_offer_family', rule_id: rule.id };
  }
  if (listed(rule.eligible_programs, input.programSlug ?? null) === false) {
    return { allowed: false, reason: 'content_rule_program', rule_id: rule.id };
  }
  if (listed(rule.lifecycle_states, input.state ?? null) === false) {
    return { allowed: false, reason: 'content_rule_state', rule_id: rule.id };
  }

  // An approved declaration SUPERSEDES the asset's own unreviewed columns: the
  // declaration is the review.
  return { allowed: true, reason: 'content_rule_approved', rule_id: rule.id };
}
