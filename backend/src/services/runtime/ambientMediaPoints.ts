/**
 * ambientMediaPoints — PURE. The reward table for listen-to-earn media and the
 * serve-time stamp that advertises it. No I/O, no models, no config.
 *
 * Split from ambientMediaGateService (the I/O shell) on purpose: the Today feed
 * composer imports THIS to stamp points onto items, and the composer's test
 * suites mock its sources by enumeration — an import that reached sequelize or
 * pointsService would break six of them on module load (it did, on 2026-09-11,
 * for exactly this reason with rehydrateProjectItems).
 */
import { DEFAULT_WATCH_PCT } from './watchProgressMath';

export type AmbientMediaKind = 'podcast' | 'testimonial';
export const AMBIENT_MEDIA_KINDS: readonly AmbientMediaKind[] = ['podcast', 'testimonial'] as const;

/**
 * Ali's rule (2026-09-11): 35 for a podcast, 10 for a testimonial, at 75%.
 * Stamped onto every ambient item at serve time so the tile advertises the same
 * number the gate awards — one source of truth, on the server.
 */
export const AMBIENT_MEDIA_POINTS: Record<AmbientMediaKind, number> = {
  podcast: 35,
  testimonial: 10,
};

/** 75% — the same bar as a video. */
export const AMBIENT_MEDIA_REQUIRED_PCT = DEFAULT_WATCH_PCT;

export function isAmbientMediaKind(k: string): k is AmbientMediaKind {
  return (AMBIENT_MEDIA_KINDS as readonly string[]).includes(k);
}

/** The feed ref for an item — also the idempotency key for its award. */
export function mediaRef(kind: AmbientMediaKind, mediaId: string): string {
  return `${kind}:${mediaId}`;
}

/**
 * Give every ambient podcast/testimonial item its reward so the tile can show
 * "Collect +35 pts". Runs on every served page, which is what makes it reach
 * the thousands of impressions already frozen in today_feed_impressions with
 * `points: {}` — the same append-only-snapshot trap as #2394 and #2441, closed
 * up front this time. Mutates in place; ignores everything else.
 */
export function stampAmbientMediaPoints(items: Array<{ ref?: string; points?: any }>): void {
  for (const it of items) {
    const kind = String(it.ref || '').split(':')[0];
    if (!isAmbientMediaKind(kind)) continue;
    const prev = it.points && typeof it.points === 'object' ? it.points : {};
    it.points = { ...prev, learning: AMBIENT_MEDIA_POINTS[kind] };
  }
}
