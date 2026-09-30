import { z } from 'zod';
import BrandGovernanceRule from '../../models/BrandGovernanceRule';
import { checkContent, type BrandGovernanceRules, type ContentUnderReview, type GovernanceResult } from './brandGovernance';

/**
 * brandGovernanceService — reads the CURRENT rules for a brand and applies them.
 *
 * This is the "from data" half of "rules are read from data, not module constants". The pure
 * check takes rules as a parameter; this file is where that parameter comes from - the
 * highest-version row for the brand. Nothing here knows what any rule says.
 *
 * NO RULES MEANS NO CHECK PASSES BY DEFAULT. A brand with no governance rows gets
 * `EMPTY_RULES`, under which nothing is prohibited and nothing is required - and the result
 * says so through `rulesVersion: 0`, so a caller can refuse to publish ungoverned content
 * rather than reading "no violations" as "approved". Silently passing everything for a brand
 * nobody has configured is the failure this note exists to prevent.
 */

export const EMPTY_RULES: BrandGovernanceRules = {
  version: 0,
  voice: { tone: '', guidance: '' },
  approvedOffers: [],
  requiredDisclosures: [],
  prohibitedClaims: [],
  protectedTerms: [],
  audienceExclusions: [],
  allowedLinkDomains: [],
  requiredApprovers: [],
};

/**
 * The write-boundary contract for a rule set. Validated here so a malformed rule (a pattern
 * that is not a string, a disclosure with no text) is refused at publish time rather than
 * discovered when a check tries to apply it.
 */
export const BrandGovernanceRulesSchema = z.object({
  version: z.number().int().nonnegative(),
  voice: z.object({ tone: z.string().max(200), guidance: z.string().max(4000) }),
  approvedOffers: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), cta: z.string().min(1) })),
  requiredDisclosures: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    when: z.enum(['always', 'paid', 'ai_generated', 'offer']),
  })),
  prohibitedClaims: z.array(z.object({ id: z.string().min(1), pattern: z.string().min(1), reason: z.string().min(1) })),
  protectedTerms: z.array(z.object({
    canonical: z.string().min(1),
    rejectedForms: z.array(z.string().min(1)),
    caseSensitive: z.boolean(),
  })),
  audienceExclusions: z.array(z.string()),
  allowedLinkDomains: z.array(z.string().min(1)),
  requiredApprovers: z.array(z.object({ role: z.string().min(1), forContent: z.array(z.string()) })),
});

export async function getCurrentRules(brandId: string): Promise<BrandGovernanceRules> {
  const row = await BrandGovernanceRule.findOne({
    where: { brand_id: brandId },
    order: [['version', 'DESC']],
  });
  return row ? row.rules : EMPTY_RULES;
}

/**
 * Publish a new version. The version number is assigned here as previous + 1, never taken
 * from the caller, so two publishers racing cannot both claim version 4 - the unique index on
 * (brand_id, version) makes the loser's insert fail loudly instead of silently winning.
 */
export async function publishRules(
  tenantId: string,
  brandId: string,
  rules: Omit<BrandGovernanceRules, 'version'>,
  publishedBy: string | null,
  note: string | null,
): Promise<BrandGovernanceRule> {
  const current = await getCurrentRules(brandId);
  const version = current.version + 1;
  const parsed = BrandGovernanceRulesSchema.parse({ ...rules, version });

  // Every prohibited-claim pattern must compile. A rule that cannot be applied is worse than
  // no rule, because it looks like coverage.
  for (const claim of parsed.prohibitedClaims) {
    try {
      new RegExp(claim.pattern, 'i');
    } catch {
      throw new Error(`Prohibited-claim rule "${claim.id}" has an invalid pattern.`);
    }
  }

  return BrandGovernanceRule.create({
    tenant_id: tenantId,
    brand_id: brandId,
    version,
    rules: parsed,
    published_by: publishedBy,
    note,
  });
}

export async function checkContentForBrand(brandId: string, content: ContentUnderReview): Promise<GovernanceResult> {
  const rules = await getCurrentRules(brandId);
  return checkContent(content, rules);
}
