import { Brand } from '../../models';
import { resolveBrandBySlug } from '../../modules/tenancy/tenantResolver';
import { EXPLORER_PROGRAM } from './explorerProgramBridge';

/**
 * Is a requested brand the one Explorer Growth's data belongs to?
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `explorer_journey_profiles` carries no brand, tenant or programme column. It is
 * single-brand by construction: Explorer Growth IS the Colaberry Training learner
 * journey, which `journey_programs` already records in that programme's own
 * description ("Explorer Growth is the first implementation on this programme").
 *
 * Measured on production 2026-11-21 across 1,191 profiles: 282 resolve to a
 * Colaberry Training brand context, 909 carry no brand context at all, and ZERO
 * belong to any other brand. So treating the whole population as Colaberry
 * Training is true today, and this module is what keeps a request for a DIFFERENT
 * brand from being served that population under the wrong name.
 *
 * Scoping is therefore resolved at read time rather than backfilled onto a column.
 * No row is written, and AD-1 holds: no `explorer_*` table is renamed, altered,
 * copied or migrated.
 *
 * ─── WHY THE LOOKUP TAKES A TENANT SLUG AS WELL AS A BRAND SLUG ─────────────
 *
 * `brands` is unique on `(tenant_id, slug)`, NOT on `slug` — `Brand.ts` says so in
 * its own header, and two tenants may legitimately carry the same brand slug. A
 * slug-only lookup is therefore a query that can return more than one row, and
 * "take the first" would bind a DIFFERENT tenant's brand while still reporting
 * `explorer_brand`, serving every Colaberry Training learner under it.
 *
 * The `unknown_brand` branch cannot catch that, because the row genuinely exists.
 * This is the single failure this whole piece of work exists to prevent, so the
 * identity comes from `EXPLORER_PROGRAM` — already the one definition of Explorer's
 * programme identity, and already depended on by `replyHandoffHook`,
 * `learnerStrategy`, `mayaJourneyHandoff` and the bridge itself — and the lookup
 * goes through `resolveBrandBySlug`, which resolves the tenant FIRST.
 *
 * ─── A REQUEST WITHOUT A BRAND IS NOT AUTOMATICALLY EVERY BRAND ─────────────
 *
 * Once `tenant_memberships` is populated, a caller can be confined to one brand.
 * If "no brand requested" meant "unfiltered", such an operator could simply omit
 * the parameter and be served everyone's rows — a widening, by the module whose
 * whole job is refusing to widen. So an absent request falls back to the caller's
 * own brand, and only a caller who is not brand-restricted at all sees everything.
 */

export type ExplorerScope =
  | {
      in_scope: true;
      /** Null only for a genuinely unnarrowed caller. */
      brand_id: string | null;
      reason: 'explorer_brand' | 'all_brands';
    }
  | {
      in_scope: false;
      brand_id: string;
      reason: 'other_brand' | 'unknown_brand';
    };

/** Structured, so a refusal is traceable without logging a person. */
function logScopeRefusal(reason: string, brandId: string | null): void {
  console.warn(
    JSON.stringify({
      level: 'warn',
      service: 'growth-journey-admin',
      event: 'explorer_scope_refused',
      outcome: 'success',
      reason,
      brand_id: brandId,
    })
  );
}

/**
 * Decide whether Explorer's population may be served for this request.
 *
 * @param requestedBrandId the `brand_id` query parameter, or null when absent
 * @param ctxBrandId       the brand the CALLER is confined to, or null when they
 *                         are not brand-restricted (an unpopulated membership
 *                         system, or a platform superadmin)
 */
export async function resolveExplorerScope(
  requestedBrandId: string | null,
  ctxBrandId: string | null = null
): Promise<ExplorerScope> {
  const effective = requestedBrandId || ctxBrandId || null;

  // Nobody asked for a brand and nobody is confined to one. Honest: nothing is
  // narrowed yet, so the whole population is the correct answer.
  if (!effective) {
    return { in_scope: true, brand_id: null, reason: 'all_brands' };
  }

  const explorerBrand = await resolveBrandBySlug(
    EXPLORER_PROGRAM.tenantSlug,
    EXPLORER_PROGRAM.brandSlug
  );

  // Explorer's brand is absent from this environment. Refuse rather than fall
  // through: without it there is nothing to compare against, and guessing would
  // mean serving the population to whoever asked.
  if (!explorerBrand) {
    logScopeRefusal('explorer_brand_not_resolvable', effective);
    return { in_scope: false, brand_id: effective, reason: 'unknown_brand' };
  }

  if (effective === explorerBrand.id) {
    return { in_scope: true, brand_id: effective, reason: 'explorer_brand' };
  }

  // A real brand that is not Explorer's, versus an id matching no brand at all.
  // Both are out of scope; they are distinguished so the UI can say which, and so
  // a bogus id can never read as a legitimately empty brand.
  const other = await Brand.findByPk(effective).catch(() => null);
  const reason = other ? 'other_brand' : 'unknown_brand';
  if (!other) logScopeRefusal('brand_not_found', effective);

  return { in_scope: false, brand_id: effective, reason };
}
