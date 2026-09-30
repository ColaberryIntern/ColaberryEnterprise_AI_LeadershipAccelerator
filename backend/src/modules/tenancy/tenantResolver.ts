import { Tenant, Brand, BrandDomain, LeadSource } from '../../models';

/**
 * Server-side resolution of tenant/brand context.
 *
 * THE SECURITY INVARIANT OF THIS PROJECT: a browser never names its own tenant. Public
 * ingest and tracking endpoints accept a `site_slug` or arrive on a hostname; the server
 * turns that into a tenant and a brand. If a request body could carry `tenant_id`, any
 * visitor could write into any tenant's data by editing one field.
 *
 * PERFORMANCE: `page_events` is the highest-write table in the system, and a database
 * round trip per pageview to resolve tenancy would be a real regression. Every lookup
 * here is served from a bounded TTL cache; a miss costs one query and is then reused.
 *
 * FAILURE POSTURE: every function returns `null` rather than throwing. Tracking must
 * stay fail-soft — an unresolved brand records the event with null context and emits a
 * metric. Authorization is fail-closed, but that lives in `tenantAuthorization.ts`, not
 * here. Conflating the two is how a resolver outage becomes either lost telemetry or an
 * open door.
 */

export interface ResolvedTenantContext {
  tenantId: string;
  tenantSlug: string;
  brandId: string;
  brandSlug: string;
  /** Present when resolution started from a lead source rather than a hostname. */
  sourceId?: string;
}

/** How the context was resolved. Emitted in logs so legacy-fallback usage is measurable. */
export type ResolutionPath = 'source_slug' | 'brand_domain' | 'legacy_host_map' | 'unresolved';

interface CacheEntry {
  value: ResolvedTenantContext | null;
  expiresAt: number;
}

/**
 * 5 minutes. Long enough that a busy tracking endpoint almost never queries, short
 * enough that registering a new domain takes effect without a deploy. Bounded so a
 * hostname-enumeration attack cannot grow the cache without limit.
 */
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

function cacheSet(key: string, value: ResolvedTenantContext | null): void {
  // Simple bound: when full, drop the oldest insertion. Map preserves insertion order,
  // so this is FIFO rather than LRU — adequate for a set of hostnames that is small and
  // stable in practice, and far cheaper than tracking access times on a hot path.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/** Drop all cached resolutions. Called after seeding or domain registration. */
export function clearTenantResolutionCache(): void {
  cache.clear();
}

/** Cache statistics, for the admin ecosystem health view. */
export function tenantResolutionCacheStats(): { size: number; maxEntries: number; ttlMs: number } {
  return { size: cache.size, maxEntries: MAX_ENTRIES, ttlMs: TTL_MS };
}

async function loadBrandContext(
  brandId: string,
  sourceId?: string,
): Promise<ResolvedTenantContext | null> {
  const brand = await Brand.findByPk(brandId);
  if (!brand || brand.status !== 'active') return null;
  const tenant = await Tenant.findByPk(brand.tenant_id);
  if (!tenant || tenant.status !== 'active') return null;
  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    brandId: brand.id,
    brandSlug: brand.slug,
    ...(sourceId ? { sourceId } : {}),
  };
}

/**
 * Resolve from a `lead_sources.slug` — the path used by the tracker's `data-site`
 * attribute and by `/api/ingest?source=`.
 */
export async function resolveContextBySourceSlug(
  sourceSlug: string | null | undefined,
): Promise<ResolvedTenantContext | null> {
  if (!sourceSlug) return null;
  const key = `source:${sourceSlug.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached.value;

  let resolved: ResolvedTenantContext | null = null;
  try {
    const source = await LeadSource.findOne({ where: { slug: sourceSlug.toLowerCase() } });
    // A source with no brand yet is the normal state during migration, not an error.
    const brandId = source ? (source as any).brand_id : null;
    if (source && brandId) {
      resolved = await loadBrandContext(brandId, source.id);
    }
  } catch {
    // Swallowed on purpose: an unavailable database must degrade tracking to null
    // context, never take the endpoint down. The caller emits the unresolved metric.
    resolved = null;
  }

  cacheSet(key, resolved);
  return resolved;
}

/**
 * Resolve from a hostname via `brand_domains`. This is what replaces the hard-coded
 * HOST_TO_SITE_SLUG map in trackingController; the map remains as a logged fallback
 * until every live hostname is registered here (master plan §50 — no flag day).
 */
export async function resolveContextByHostname(
  hostname: string | null | undefined,
  purpose: 'web' | 'app' = 'web',
): Promise<ResolvedTenantContext | null> {
  if (!hostname) return null;
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return null;

  const key = `host:${purpose}:${normalized}`;
  const cached = cacheGet(key);
  if (cached) return cached.value;

  let resolved: ResolvedTenantContext | null = null;
  try {
    let domain = await BrandDomain.findOne({ where: { hostname: normalized, purpose } });
    // A hostname registered only for 'web' should still resolve an 'app' lookup rather
    // than failing: the brand is the same, and refusing would push the caller back onto
    // the legacy host map for no benefit.
    if (!domain && purpose === 'app') {
      domain = await BrandDomain.findOne({ where: { hostname: normalized, purpose: 'web' } });
    }
    if (domain) resolved = await loadBrandContext(domain.brand_id);
  } catch {
    resolved = null;
  }

  cacheSet(key, resolved);
  return resolved;
}

/** Extract a hostname from a page URL. Returns null on anything unparseable. */
export function hostnameFromUrl(pageUrl: string | null | undefined): string | null {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export interface ContextResolution {
  context: ResolvedTenantContext | null;
  path: ResolutionPath;
}

/**
 * The resolution order used by public endpoints: explicit source slug first (the site
 * told us what it is), then the hostname it arrived on. Returns the path taken so the
 * caller can emit `tenant_context_unresolved` and measure legacy-fallback usage.
 */
export async function resolvePublicContext(input: {
  sourceSlug?: string | null;
  pageUrl?: string | null;
  hostname?: string | null;
}): Promise<ContextResolution> {
  const bySource = await resolveContextBySourceSlug(input.sourceSlug);
  if (bySource) return { context: bySource, path: 'source_slug' };

  const host = input.hostname ?? hostnameFromUrl(input.pageUrl);
  const byHost = await resolveContextByHostname(host);
  if (byHost) return { context: byHost, path: 'brand_domain' };

  return { context: null, path: 'unresolved' };
}

/** Resolve a tenant by slug. Used by seeds, backfills and admin tooling. */
export async function resolveTenantBySlug(slug: string): Promise<Tenant | null> {
  if (!slug) return null;
  try {
    return await Tenant.findOne({ where: { slug: slug.toLowerCase() } });
  } catch {
    return null;
  }
}

/** Resolve a brand by (tenant slug, brand slug). */
export async function resolveBrandBySlug(
  tenantSlug: string,
  brandSlug: string,
): Promise<Brand | null> {
  const tenant = await resolveTenantBySlug(tenantSlug);
  if (!tenant) return null;
  try {
    return await Brand.findOne({ where: { tenant_id: tenant.id, slug: brandSlug.toLowerCase() } });
  } catch {
    return null;
  }
}
