/**
 * ambientMediaGateService — points for LISTENING to a podcast and WATCHING a
 * testimonial on the Today feed.
 *
 * Why this exists: podcasts and testimonials in the Today feed are AMBIENT
 * items (`podcast:<id>`, `testimonial:<id>`) — provider picks with no
 * timeline_card and no TimelineCardProgress row. The card watch gate
 * (watchProgressService) is keyed on a card id, so it could never see them,
 * and on production that meant 5,628 podcast and 2,988 testimonial placements
 * across 201 students that earned nothing however long you listened.
 *
 * Ali's rule (2026-09-11): 35 points for a podcast, 10 for a testimonial, at
 * 75% consumed, tracked the same way videos are. So this mirrors the blog read
 * gate's SHAPE (a separate store for ambient media, record → assert → collect)
 * and REUSES the card gate's MATH (accumulateWatch / meetsWatchRequirement) so
 * "75% watched" means exactly the same thing on a podcast as on a video.
 *
 * Store: today_media_watch (enrollment_id, ref) → watch_state JSONB, one row
 * per student per media item. Additive boot DDL; no migration.
 *
 * Idempotent by contract: collect awards through pointsService.award with the
 * media ref as the event key, so the same episode can never pay twice.
 * Fail-soft on reads; collect is the only side effect and is flag-guarded.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  accumulateWatch, meetsWatchRequirement, type WatchBeat, type WatchState,
} from './watchProgressMath';
import { award } from '../pointsService';
import { env } from '../../config/env';

export {
  AMBIENT_MEDIA_KINDS, AMBIENT_MEDIA_POINTS, AMBIENT_MEDIA_REQUIRED_PCT,
  isAmbientMediaKind, mediaRef, stampAmbientMediaPoints,
} from './ambientMediaPoints';
export type { AmbientMediaKind } from './ambientMediaPoints';
import {
  AMBIENT_MEDIA_POINTS, AMBIENT_MEDIA_REQUIRED_PCT, mediaRef, type AmbientMediaKind,
} from './ambientMediaPoints';

export interface MediaVerdict { watched_pct: number; required_pct: number; met: boolean }

async function loadState(enrollmentId: string, ref: string): Promise<WatchState | null> {
  const rows = await sequelize.query<{ watch_state: WatchState | null }>(
    `SELECT watch_state FROM today_media_watch WHERE enrollment_id = :eid AND ref = :ref`,
    { replacements: { eid: enrollmentId, ref }, type: QueryTypes.SELECT },
  );
  return rows[0]?.watch_state ?? null;
}

function verdictOf(state: WatchState | null): MediaVerdict {
  const v = meetsWatchRequirement(state, AMBIENT_MEDIA_REQUIRED_PCT);
  return { watched_pct: v.watched_pct, required_pct: Math.round(AMBIENT_MEDIA_REQUIRED_PCT * 100), met: v.met };
}

/** Fold one beat into the student's state for this media item and return the verdict. */
export async function recordMediaBeat(
  enrollmentId: string, kind: AmbientMediaKind, mediaId: string, beat: WatchBeat,
): Promise<MediaVerdict> {
  const ref = mediaRef(kind, mediaId);
  const prev = await loadState(enrollmentId, ref);
  // The player is the only thing that knows an ambient episode's length, so the
  // beat's own duration_s is the authoritative one (no catalog lookup here).
  const next = accumulateWatch(prev, beat, undefined, beat.duration_s ?? undefined);
  await sequelize.query(
    `INSERT INTO today_media_watch (enrollment_id, ref, watch_state, updated_at)
       VALUES (:eid, :ref, :ws::jsonb, NOW())
     ON CONFLICT (enrollment_id, ref)
       DO UPDATE SET watch_state = :ws::jsonb, updated_at = NOW()`,
    { replacements: { eid: enrollmentId, ref, ws: JSON.stringify(next) }, type: QueryTypes.INSERT },
  );
  return verdictOf(next);
}

/** Current verdict without recording anything (drawer/tile hydration). */
export async function getMediaVerdict(enrollmentId: string, kind: AmbientMediaKind, mediaId: string): Promise<MediaVerdict> {
  return verdictOf(await loadState(enrollmentId, mediaRef(kind, mediaId)));
}

/** Gate: 422 in the card gate's shape when the bar is not met. */
export async function assertMediaWatched(enrollmentId: string, kind: AmbientMediaKind, mediaId: string): Promise<MediaVerdict> {
  const v = await getMediaVerdict(enrollmentId, kind, mediaId);
  if (v.met) return v;
  const noun = kind === 'podcast' ? 'listen to' : 'watch';
  throw Object.assign(
    new Error(`Keep going — ${noun} ${v.required_pct}% to collect your points (you’re at ${v.watched_pct}%).`),
    { status: 422, code: 'watch_requirement', watched_pct: v.watched_pct, required_pct: v.required_pct },
  );
}

/** Collect the reward once the bar is met. Idempotent per (student, media item). */
export async function collectMedia(
  enrollmentId: string, kind: AmbientMediaKind, mediaId: string,
): Promise<{ points_awarded: number; already: boolean; watched_pct: number }> {
  const v = await assertMediaWatched(enrollmentId, kind, mediaId);
  if (!env.portalPointsAwardEnabled) return { points_awarded: 0, already: false, watched_pct: v.watched_pct };
  const res = await award(enrollmentId, {
    eventType: 'card_complete',
    eventKey: mediaRef(kind, mediaId),          // same ref the feed uses ⇒ once per episode
    points: AMBIENT_MEDIA_POINTS[kind],
    metadata: { media_id: mediaId, kind, source: 'ambient_media_watch', watched_pct: v.watched_pct },
  });
  return { points_awarded: res.awarded ? res.points : 0, already: !res.awarded, watched_pct: v.watched_pct };
}
