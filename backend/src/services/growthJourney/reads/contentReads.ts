import { BrandOfferPolicy, GrowthJourneyContentRule } from '../../../models';
import { safeField } from '../handoffs/assigneeDigest';
import { brandWhere, emptyPage, paging, type Page, type ReadScope } from './readPaging';

/**
 * What a brand is allowed to offer, and what content has been approved to say
 * it (Phase 6, T607). Two projections; no verdict.
 *
 * ─── A PROJECTION, NOT A SECOND ELIGIBILITY ENGINE ──────────────────────────
 *
 * `offerEligibility.ts` already decides whether a family is allowed for a brand
 * right now (`resolveOfferEligibility`, `allowedOfferFamilies`), and
 * `contentEligibility.ts` already decides whether an asset may be used
 * (`assertContentAllowed`). Neither is re-implemented here and neither is
 * called: this file answers a different question — what do the CONFIGURED ROWS
 * say — so a screen can show an operator the policy they are about to rely on.
 * Anything that looks like a verdict (`allowed`, a reason, an effective-window
 * decision) is deliberately absent; that answer has one home and it is not
 * this one.
 *
 * `explicit_deny`, which the plan named as a column here, is not one: it is a
 * member of `EligibilityReason` that `offerEligibility` emits when the row's
 * `decision` is `'deny'`. The column is `decision: 'allow' | 'deny'`, and that
 * is what is projected.
 *
 * ─── `notes` AND `source_evidence` ARE NEVER REQUESTED ──────────────────────
 *
 * `brand_offer_policies.notes` is free text an operator typed, and
 * `growth_journey_content_rules.source_evidence` is a JSONB array of whatever
 * evidence a reviewer pasted in — a quote from a customer call, an email
 * thread. Neither appears in an `attributes` list in this file, so neither is
 * loaded, let alone returned. (`contentEligibility.ts:214` reads the rule rows
 * with no `attributes` allow-list and therefore does pull `source_evidence`
 * into memory; it never projects it, and that query shape is deliberately NOT
 * copied here.)
 *
 * Claims and CTAs are reported as COUNTS. The copy itself is approved marketing
 * text rather than anything a person wrote to us, but an admin list has no use
 * for the wording and a count is what the plan asked for; the wording stays
 * where it is authored.
 *
 * `approved_by` on a content rule is a `STRING(128)` that in practice holds
 * whoever approved it — which may well be an address — so it goes through
 * T517's `safeField`.
 */

const URL_CAP = 300;
const LIST_CAP = 25;
const countOf = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Strings out of a JSONB array, capped in both length and number. */
const stringList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string').slice(0, LIST_CAP).map((s) => s.slice(0, URL_CAP))
    : [];

/* ── brand offer policies ───────────────────────────────────────────────────── */

export interface OfferPolicyRow {
  id: string;
  brand_id: string;
  offer_family: string;
  /** The row's own `'allow' | 'deny'`. Not a verdict — the window is not applied here. */
  decision: string;
  status: string;
  effective_from: string;
  effective_to: string | null;
  approved_landing_pages: string[];
  approved_landing_pages_total: number;
  claims_count: number;
  ctas_count: number;
  required_approvals: string[];
}

export interface OfferPolicyFilters extends ReadScope {
  offerFamily?: string;
  decision?: string;
  status?: string;
}

export async function readOfferPolicies(filters: OfferPolicyFilters): Promise<Page<OfferPolicyRow>> {
  const { limit, offset } = paging(filters);
  if (filters.brandIds.length === 0) return emptyPage(limit, offset);
  const where = brandWhere(filters.brandIds);
  if (filters.offerFamily) where.offer_family = filters.offerFamily;
  if (filters.decision) where.decision = filters.decision;
  if (filters.status) where.status = filters.status;
  const { rows, count } = await BrandOfferPolicy.findAndCountAll({
    where,
    attributes: [
      'id', 'brand_id', 'offer_family', 'decision', 'status', 'effective_from', 'effective_to',
      'approved_landing_pages', 'approved_claims', 'approved_ctas', 'required_approvals',
    ],
    order: [['offer_family', 'ASC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return {
    rows: rows.map((r) => ({
      id: String(r.get('id')),
      brand_id: String(r.get('brand_id')),
      offer_family: String(r.get('offer_family')),
      decision: String(r.get('decision')),
      status: String(r.get('status')),
      effective_from: new Date(r.get('effective_from') as Date).toISOString(),
      effective_to: r.get('effective_to') ? new Date(r.get('effective_to') as Date).toISOString() : null,
      approved_landing_pages: stringList(r.get('approved_landing_pages')),
      approved_landing_pages_total: countOf(r.get('approved_landing_pages')),
      claims_count: countOf(r.get('approved_claims')),
      ctas_count: countOf(r.get('approved_ctas')),
      required_approvals: stringList(r.get('required_approvals')),
    })),
    total: count,
    limit,
    offset,
  };
}

/* ── content rules ──────────────────────────────────────────────────────────── */

export interface ContentRuleRow {
  id: string;
  brand_id: string;
  offer_family: string | null;
  collection_key: string | null;
  asset_id: string | null;
  version: number;
  approval_status: string;
  /** Through `safeField`: this column holds whoever approved the rule, address and all. */
  approved_by: string;
  approved_by_redacted: boolean;
  approved_at: string | null;
  claims_count: number;
  access_tier: string | null;
  effective_from: string | null;
  expires_at: string | null;
}

export interface ContentRuleFilters extends ReadScope {
  offerFamily?: string;
  approvalStatus?: string;
}

export async function readContentRules(filters: ContentRuleFilters): Promise<Page<ContentRuleRow>> {
  const { limit, offset } = paging(filters);
  if (filters.brandIds.length === 0) return emptyPage(limit, offset);
  const where = brandWhere(filters.brandIds);
  if (filters.offerFamily) where.offer_family = filters.offerFamily;
  if (filters.approvalStatus) where.approval_status = filters.approvalStatus;
  const { rows, count } = await GrowthJourneyContentRule.findAndCountAll({
    where,
    attributes: [
      'id', 'brand_id', 'offer_family', 'collection_key', 'asset_id', 'version', 'approval_status',
      'approved_by', 'approved_at', 'approved_claims', 'access_tier', 'effective_from', 'expires_at',
    ],
    order: [['version', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
  const iso = (v: unknown): string | null => (v ? new Date(v as Date).toISOString() : null);
  return {
    rows: rows.map((r) => {
      const by = safeField(r.get('approved_by'));
      return {
        id: String(r.get('id')),
        brand_id: String(r.get('brand_id')),
        offer_family: (r.get('offer_family') as string | null) ?? null,
        collection_key: (r.get('collection_key') as string | null) ?? null,
        asset_id: (r.get('asset_id') as string | null) ?? null,
        version: Number(r.get('version')),
        approval_status: String(r.get('approval_status')),
        approved_by: by.value,
        approved_by_redacted: by.redacted,
        approved_at: iso(r.get('approved_at')),
        claims_count: countOf(r.get('approved_claims')),
        access_tier: (r.get('access_tier') as string | null) ?? null,
        effective_from: iso(r.get('effective_from')),
        expires_at: iso(r.get('expires_at')),
      };
    }),
    total: count,
    limit,
    offset,
  };
}
