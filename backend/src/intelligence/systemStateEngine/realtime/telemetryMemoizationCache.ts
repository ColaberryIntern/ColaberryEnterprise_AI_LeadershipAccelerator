/**
 * telemetryMemoizationCache — 30s per-project memoize layer for vision +
 * visual telemetry loaders.
 *
 * Why: each loader hits the DB (visionTelemetrySynchronizer does ~100-row
 * + ~5000-row queries; visualTelemetrySynchronizer does 2 unbounded
 * scans). The Phase 11 metric pipeline calls them on every "Generate
 * prompt for these N issues" click — without memoization a user
 * experimenting with multiple BPs hits the DB 4×/click.
 *
 * Cache invalidates on `remediation_outcome_recorded` trigger publication
 * so a freshly-resolved outcome is reflected in the next loader call.
 *
 * Phase 11 §A.
 */

const TTL_MS = 30_000;

interface CacheEntry<T> {
  value: T;
  expires_at: number;
}

const visionCache = new Map<string, CacheEntry<any>>();
const visualCache = new Map<string, CacheEntry<any>>();

export async function getMemoizedVisionTelemetry(projectId: string): Promise<any | null> {
  const now = Date.now();
  const hit = visionCache.get(projectId);
  if (hit && hit.expires_at > now) return hit.value;
  try {
    const { loadVisionTelemetry } = await import('../vision/visionTelemetrySynchronizer');
    const value = await loadVisionTelemetry(projectId);
    visionCache.set(projectId, { value, expires_at: now + TTL_MS });
    return value;
  } catch (err: any) {
    console.warn('[telemetryMemoizationCache] vision load failed:', err?.message);
    return null;
  }
}

export async function getMemoizedVisualTelemetry(projectId: string): Promise<any | null> {
  const now = Date.now();
  const hit = visualCache.get(projectId);
  if (hit && hit.expires_at > now) return hit.value;
  try {
    const { loadVisualTelemetry } = await import('../visual/visualTelemetrySynchronizer');
    const value = await loadVisualTelemetry(projectId);
    visualCache.set(projectId, { value, expires_at: now + TTL_MS });
    return value;
  } catch (err: any) {
    console.warn('[telemetryMemoizationCache] visual load failed:', err?.message);
    return null;
  }
}

/** Invalidate both caches for a project. Called from refresh-trigger handler. */
export function invalidateTelemetryCache(projectId: string): void {
  visionCache.delete(projectId);
  visualCache.delete(projectId);
}

/** Test-only cache reset. */
export function _resetTelemetryCache(): void {
  visionCache.clear();
  visualCache.clear();
}

/** Diagnostics for the stability-protection audit. */
export function getTelemetryCacheStats(): { vision_size: number; visual_size: number; ttl_ms: number } {
  return { vision_size: visionCache.size, visual_size: visualCache.size, ttl_ms: TTL_MS };
}
