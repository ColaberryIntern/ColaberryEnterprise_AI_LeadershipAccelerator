import { QueryTypes } from 'sequelize';
import { assertLandingPage, buildContentRulesPlan, renderPlanSummary, type ContentRulesPlan } from './contentRulesPlan';

/**
 * R2 - the content-approval writer, reachable by an operator from the admin Content tab instead of only by a CLI run.
 *
 * WHY THIS IS THE WALL. assertContentAllowed refuses every candidate with content_not_approved because no brand policy has
 * an approved landing page, and nothing outside a one-off CLI could write one. This module exposes THAT SAME writer
 * (scripts/growthJourneyContentRules.ts: loadBrands, loadAssetsByBrandSlug, buildContentRulesPlan, applyPlan) to the
 * admin route; it does not add a parallel approval concept.
 *
 * WHAT IT WRITES (only on apply, only with a person's identity): growth_journey_content_rules rows for the brand's
 * authored assets (approved, idempotent on (brand_id, asset_id, version)) and the landing page on the brand's existing
 * brand_offer_policies row. It NEVER writes explorer_content_assets (that table is synced from the curriculum), so the
 * Explorer selector, which reads that table and ignores approval, is provably unchanged (its import guard test stays).
 *
 * REVERSIBLE: revoke sets those rules to 'revoked' (any non-'approved' status refuses: content_rule_not_approved:revoked)
 * and removes the landing page from the policy list. Nothing is deleted.
 */

export interface ContentApprovalInput { brandSlug: string; landingPage: string; version?: number }

export interface ContentApprovalPreview {
  brand_slug: string;
  landing_page: string;
  rules: number;
  policy_pages: number;
  skipped: number;
  counts: ContentRulesPlan['counts'];
  summary: string[];
}

export class ContentApprovalError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}

async function cli() {
  return import('../../../scripts/growthJourneyContentRules');
}

export async function planFor(input: ContentApprovalInput): Promise<ContentRulesPlan> {
  const landingPage = assertLandingPage(input.landingPage, input.brandSlug);
  const { loadBrands, loadAssetsByBrandSlug } = await cli();
  const brands = await loadBrands(input.brandSlug);
  if (brands.length !== 1) throw new ContentApprovalError(`No single active brand matches ${input.brandSlug}`);
  const assetsByBrandSlug = await loadAssetsByBrandSlug(brands);
  return buildContentRulesPlan({ brands, assetsByBrandSlug, landingPageByBrandSlug: { [input.brandSlug]: landingPage }, version: input.version });
}

export async function previewContentApproval(input: ContentApprovalInput): Promise<ContentApprovalPreview> {
  const plan = await planFor(input);
  return {
    brand_slug: input.brandSlug, landing_page: input.landingPage,
    rules: plan.rules.length, policy_pages: plan.policy_pages.length, skipped: plan.skipped.length,
    counts: plan.counts, summary: renderPlanSummary(plan, 'dry-run'),
  };
}

export async function applyContentApproval(input: ContentApprovalInput, approvedBy: string) {
  if (!approvedBy.trim()) throw new ContentApprovalError('An approver is required');
  const plan = await planFor(input);
  const { applyPlan } = await cli();
  const written = await applyPlan(plan);
  // Who approved, on the rows this plan covers that are still unattributed (applyPlan predates the operator route).
  const { sequelize } = await import('../../../config/database');
  const assetIds = plan.rules.map((r) => r.asset_id);
  let rulesRestored = 0;
  if (assetIds.length > 0) {
    // applyPlan inserts with ON CONFLICT DO NOTHING, so a rule revoked earlier would stay revoked. Restoring it is part of
    // approving: approve, revoke, approve must end approved (the 2026-11-09 verifier found this path broken).
    const restored = await sequelize.query<{ id: string }>(
      `UPDATE growth_journey_content_rules SET approval_status = 'approved', approved_by = :by, approved_at = NOW(), updated_at = NOW()
        WHERE brand_id = :brandId AND asset_id IN (:assetIds) AND version = :version AND approval_status = 'revoked' RETURNING id`,
      { type: QueryTypes.SELECT, replacements: { by: approvedBy.slice(0, 128), brandId: plan.rules[0].brand_id, assetIds, version: plan.rules[0].version } },
    );
    rulesRestored = restored.length;
    await sequelize.query(
      `UPDATE growth_journey_content_rules SET approved_by = :by, approved_at = COALESCE(approved_at, NOW()), updated_at = NOW()
        WHERE brand_id = :brandId AND asset_id IN (:assetIds) AND approval_status = 'approved' AND approved_by IS NULL`,
      { replacements: { by: approvedBy.slice(0, 128), brandId: plan.rules[0].brand_id, assetIds } },
    );
  }
  return { ...written, rules_restored: rulesRestored, explorer_content_assets_touched: 0 };
}

export async function revokeContentApproval(input: ContentApprovalInput, revokedBy: string) {
  if (!revokedBy.trim()) throw new ContentApprovalError('A reviewer is required');
  const plan = await planFor(input);
  const { sequelize } = await import('../../../config/database');
  let rulesRevoked = 0;
  let pagesRemoved = 0;
  await sequelize.transaction(async (transaction) => {
    for (const rule of plan.rules) {
      const r = await sequelize.query<{ id: string }>(
        `UPDATE growth_journey_content_rules SET approval_status = 'revoked', updated_at = NOW()
          WHERE brand_id = :brandId AND asset_id = :assetId AND version = :version AND approval_status = 'approved' RETURNING id`,
        { type: QueryTypes.SELECT, transaction, replacements: { brandId: rule.brand_id, assetId: rule.asset_id, version: rule.version } },
      );
      rulesRevoked += r.length;
    }
    for (const page of plan.policy_pages) {
      const p = await sequelize.query<{ id: string }>(
        `UPDATE brand_offer_policies SET approved_landing_pages = approved_landing_pages - CAST(:page AS text), updated_at = NOW()
          WHERE brand_id = :brandId AND offer_family = :family AND approved_landing_pages @> CAST(:pageJson AS jsonb) RETURNING id`,
        { type: QueryTypes.SELECT, transaction, replacements: { page: page.landing_page, pageJson: JSON.stringify([page.landing_page]), brandId: page.brand_id, family: page.offer_family } },
      );
      pagesRemoved += p.length;
    }
  });
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'content_approval_revoked', outcome: 'success',
    context: { brand_slug: input.brandSlug, rules_revoked: rulesRevoked, pages_removed: pagesRemoved, by: revokedBy } }));
  return { rules_revoked: rulesRevoked, policy_pages_removed: pagesRemoved, explorer_content_assets_touched: 0 };
}
