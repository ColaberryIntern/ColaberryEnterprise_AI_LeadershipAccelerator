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

/** Explorer's brand, as the two ids every tenant-scoped write needs. */
export interface ExplorerBrandContext {
  tenantId: string;
  brandId: string;
}

/**
 * Cached because a brand id for a slug does not change, and this is consulted on
 * every draft render.
 *
 * Only a SUCCESSFUL resolution is cached. A failure returns null and is retried
 * next time: caching a null would turn one transient database blip into a
 * process that reads global rules forever and never says why.
 *
 * BOTH IDS ARE CACHED TOGETHER, as one object, so they cannot drift apart. Two
 * independent caches would admit a state where the brand id is populated and the
 * tenant id is not, and a tenant-scoped write built from that pair would land a
 * row under the wrong tenant while reporting success.
 */
let cachedContext: ExplorerBrandContext | null = null;

/** Visible for tests, so one case cannot leak its stub into the next. */
export function resetExplorerBrandCache(): void {
  cachedContext = null;
}

/**
 * Explorer's tenant AND brand id, or null when they cannot be resolved.
 *
 * WHY THIS EXISTS ALONGSIDE `resolveExplorerBrandId`. `lead_tenant_contexts` is
 * keyed on `(lead_id, tenant_id, brand_id)`, so a writer needs the tenant as
 * well as the brand. The brand row already carries its `tenant_id`, so taking
 * both from the SAME lookup is what guarantees they agree. Resolving the tenant
 * separately by slug would be a second query that can succeed against a
 * different row, which is the class of bug `resolveBrandBySlug` exists to avoid.
 *
 * Null is a real answer and means "Explorer's brand is not resolvable right
 * now". Callers must degrade rather than invent a tenant.
 */
export async function resolveExplorerBrandContext(): Promise<ExplorerBrandContext | null> {
  if (cachedContext) return cachedContext;
  try {
    const brand = await resolveBrandBySlug(EXPLORER_BRAND.tenantSlug, EXPLORER_BRAND.brandSlug);
    if (!brand) return null;
    // A brand row without a tenant id cannot key a tenant-scoped write. Treat it
    // as unresolved rather than coercing it, so the caller skips the write
    // instead of inserting a row nobody can authorize later.
    const tenantId = (brand as unknown as { tenant_id?: string | null }).tenant_id ?? null;
    if (!tenantId) return null;
    cachedContext = { tenantId, brandId: brand.id };
    return cachedContext;
  } catch {
    // Structured logging deliberately omitted, for the reason given on
    // `resolveExplorerBrandId` below: this runs on high-frequency paths and a
    // database outage would turn one fault into thousands of identical lines.
    return null;
  }
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
  // Delegates rather than repeating the lookup, so there is ONE query, ONE cache
  // and no way for the brand id this returns to disagree with the tenant id
  // `resolveExplorerBrandContext` returns for the same brand.
  //
  // Its four existing call sites are unaffected: this still answers a brand id
  // or null, and null still means "use the global rules", which is the
  // behaviour each of them already handles.
  const context = await resolveExplorerBrandContext();
  return context ? context.brandId : null;
}
