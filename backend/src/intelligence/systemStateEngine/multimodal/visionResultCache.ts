/**
 * visionResultCache — TTL+LRU in-memory cache for vision analysis results.
 *
 * Cache key = sha256(image_bytes_or_path + viewport + comparing-flag).
 * TTL = 30 minutes by default. Max 500 entries.
 *
 * Phase 7 §16. Critical for cost control on GPT-4o calls.
 */
import { createHash } from 'crypto';
import type { MultimodalVisionAnalysis } from './visionResponseNormalizer';

interface CacheEntry {
  readonly key: string;
  readonly analysis: MultimodalVisionAnalysis;
  readonly stored_at: number;
  hit_count: number;
}

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map<string, CacheEntry>();
let hits = 0;
let misses = 0;

export function makeCacheKey(input: {
  screenshot_path?: string;
  screenshot_bytes_sha?: string;
  viewport?: { width: number; height: number; label?: string };
  comparing?: boolean;
  intent?: string;
}): string {
  const data = JSON.stringify({
    p: input.screenshot_path ?? '',
    b: input.screenshot_bytes_sha ?? '',
    v: input.viewport ?? null,
    c: !!input.comparing,
    i: input.intent ?? '',
  });
  return createHash('sha256').update(data).digest('hex');
}

/** sha256 helper for cache key inputs. Pure. */
export function shaOfBytes(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

export function getCached(key: string): MultimodalVisionAnalysis | null {
  const entry = cache.get(key);
  if (!entry) {
    misses++;
    return null;
  }
  if (Date.now() - entry.stored_at > TTL_MS) {
    cache.delete(key);
    misses++;
    return null;
  }
  entry.hit_count++;
  hits++;
  // Tag the source as cached when serving from here.
  return { ...entry.analysis, source: 'cached' };
}

export function setCached(key: string, analysis: MultimodalVisionAnalysis): void {
  if (cache.size >= MAX_ENTRIES) {
    // Evict the oldest (Map preserves insertion order).
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { key, analysis, stored_at: Date.now(), hit_count: 0 });
}

export function getCacheStats() {
  const total = hits + misses;
  return {
    size: cache.size,
    max_entries: MAX_ENTRIES,
    ttl_ms: TTL_MS,
    hits,
    misses,
    hit_rate: total > 0 ? Math.round((hits / total) * 100) / 100 : 0,
  };
}

export function _resetCacheForTests(): void {
  cache.clear();
  hits = 0;
  misses = 0;
}
