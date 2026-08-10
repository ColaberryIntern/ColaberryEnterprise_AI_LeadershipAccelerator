/**
 * feedTypeExposureService — per-student, per-TYPE exposure history, read from
 * `today_feed_impressions`. Backs Feed Control's type-level suppression
 * (`env.feedControlTypeSuppressionEnabled`, see `todayAnchoredSources.ts`):
 * a type's `feed_frequency_cap`/`feed_cooldown_days` (set via the Feed
 * Control board) can only suppress a real candidate once we know how many
 * distinct cards of that type a student has already been shown, and when the
 * most recent one landed.
 *
 * `today_feed_impressions` has no `type` column — `item` is the full
 * TodayFeedItem JSONB snapshot, which always carries `type` (see
 * `anchoredItemFromCard`/`communityItem`/`projectItem`/`sessionReplayItem`),
 * uniformly across weekBound and evergreenByType candidates. Grouping on
 * `item->>'type'` avoids a join and works for every anchored-kind item.
 *
 * Fail-soft, matching `capeAiPulseExposureService.ts`: a DB hiccup degrades
 * to "treat every type as never-shown" (an empty map), which is the same as
 * suppression never firing — never a thrown error, never a blocked feed.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export interface TypeExposure {
  count: number;
  lastShownAt: Date | null;
}

/** Per-type exposure history for one enrollment, across every card ever shown. */
export async function getTypeExposureMap(enrollmentId: string): Promise<Map<string, TypeExposure>> {
  try {
    const rows = await sequelize.query<{ type: string | null; n: string; last: string | Date | null }>(
      `SELECT item->>'type' AS type, COUNT(*)::int AS n, MAX(served_at) AS last
         FROM today_feed_impressions
        WHERE enrollment_id = :eid AND item->>'type' IS NOT NULL
        GROUP BY item->>'type'`,
      { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
    );
    const map = new Map<string, TypeExposure>();
    for (const row of rows) {
      if (!row?.type) continue;
      const last = row.last ? (row.last instanceof Date ? row.last : new Date(row.last)) : null;
      map.set(row.type, { count: Number(row.n) || 0, lastShownAt: last && !Number.isNaN(last.getTime()) ? last : null });
    }
    return map;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'feed_type_exposure_read_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, message: err?.message },
    }));
    return new Map(); // fail-soft: every type reads as never-shown -> suppression never fires for this request
  }
}
