import { resolveBrandBySlug } from '../modules/tenancy/tenantResolver';

/**
 * Which brand Explorer Growth's population belongs to.
 *
 * ─── WHY THIS IS ITS OWN MODULE AND NOT A CONSTANT IN EITHER TREE ───────────
 *
 * `services/growthJourney/**` imports `services/explorerGrowth/**` in at least
 * six places. So the moment anything in `explorerGrowth` needs Explorer's brand
 * identity - which `explorerProgramBridge` holds, over in `growthJourney` - the
 * import would close a cycle between two top-level service trees.
 *
 * CLAUDE.md's Modular Composition Rule names both the smell and the fix: *"A
 * imports B imports A is a code smell that signals a missing third module C that
 * both depend on."* This is module C. It depends on `modules/tenancy` only,
 * which imports no service, so it cannot be part of any cycle.
 *
 * ─── IT HOLDS THE BRAND, NOT THE PROGRAMME ──────────────────────────────────
 *
 * `EXPLORER_PROGRAM` also carries a `programSlug`, which is the journey's
 * concern and comes from the seed definitions. Pulling that in here would drag a
 * growthJourney dependency back into module C and undo the point of it. So this
 * module holds the two slugs that identify the BRAND, and
 * `explorerProgramBridge` composes the programme identity from them. There is
 * still exactly one definition of the brand.
 *
 * ─── THE LOOKUP TAKES A TENANT SLUG AS WELL AS A BRAND SLUG ─────────────────
 *
 * `brands` is unique on `(tenant_id, slug)` and NOT on `slug`, so two tenants
 * may legitimately carry the same brand slug. A slug-only lookup is a query that
 * can match more than one row, and "take the first" would bind a different
 * tenant's brand while reporting success. `resolveBrandBySlug` resolves the
 * tenant first, which is why it is used rather than a direct query.
 */
export const EXPLORER_BRAND = {
  tenantSlug: 'colaberry',
  brandSlug: 'colaberry-training',
} as const;

/**
 * Cached because a brand id for a slug does not change, and this is consulted on
 * every draft render.
 *
 * Only a SUCCESSFUL resolution is cached. A failure returns null and is retried
 * next time: caching a null would turn one transient database blip into a
 * process that reads global rules forever and never says why.
 */
let cachedBrandId: string | null = null;

/** Visible for tests, so one case cannot leak its stub into the next. */
export function resetExplorerBrandCache(): void {
  cachedBrandId = null;
}

/**
 * Explorer's brand id, or null when it cannot be resolved.
 *
 * NULL IS A REAL ANSWER AND CALLERS MUST TREAT IT AS ONE. It means "use the
 * global rules", which is exactly today's behaviour, so a caller that falls back
 * on null degrades to what it already did rather than to something new. A caller
 * that threw instead would take a working page down over a condition the system
 * has tolerated since the day it shipped.
 */
export async function resolveExplorerBrandId(): Promise<string | null> {
  if (cachedBrandId) return cachedBrandId;
  try {
    const brand = await resolveBrandBySlug(EXPLORER_BRAND.tenantSlug, EXPLORER_BRAND.brandSlug);
    if (!brand) return null;
    cachedBrandId = brand.id;
    return cachedBrandId;
  } catch {
    // Structured logging deliberately omitted: this runs per draft render, and a
    // database outage would turn one fault into thousands of identical lines.
    // The caller reports which rule set it used, which is the fact that matters.
    return null;
  }
}
