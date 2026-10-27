import { sequelize } from '../config/database';

/**
 * L8.3 — the index the replay list reads through.
 *
 * `ensureBroadcastSchema` creates a partial index covering `backstage`, `live` and
 * `reconnecting`, because those are what the live ticker asks for. A replay list asks for
 * `replay_ready`, which that index does not cover at all — so without this the query falls to a
 * sequential scan over every occurrence ever created.
 *
 * That is survivable today with two rows and is exactly the kind of thing nobody notices until
 * there are two years of classes in the table and a student page gets slow for reasons no one
 * can place.
 *
 * PARTIAL, AND MATCHING THE QUERY'S PREDICATE EXACTLY. The query asks for `replay_ready` AND a
 * non-null `provider_instance_uuid`, because a replay with no bound recording cannot play. The
 * index carries the same condition, so Postgres can satisfy the whole predicate from it rather
 * than filtering afterwards — and the index stays small, since it only ever holds rows that are
 * genuinely watchable.
 *
 * Ordered by `ended_at DESC` to match the list's own ordering: somebody looking for a replay
 * wants the class they just missed.
 *
 * THE RETENTION WINDOW NEEDS NO INDEX CHANGE, and it is worth saying why rather than leaving the
 * next reader to wonder. `ended_at >= cutoff` is a range predicate on this index's leading — and
 * only — key, so it is served as a range scan that stops at the cutoff instead of walking every
 * watchable row. Had the window been expressed any other way, say a computed age column or a
 * `NOW() - interval` on the row, it would not have been indexable at all. The window is also
 * deliberately NOT baked into the index's WHERE clause: a partial index whose predicate contains
 * a moving `NOW()` is not immutable and Postgres will refuse it, and even if it accepted one the
 * index would silently stop matching the query as the clock moved.
 */
export const REPLAY_INDEX_STATEMENTS: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_broadcast_occ_replay
     ON broadcast_occurrences (ended_at DESC)
   WHERE editorial_state = 'replay_ready' AND provider_instance_uuid IS NOT NULL`,
];

export async function ensureBroadcastReplayIndexSchema(): Promise<void> {
  for (const sql of REPLAY_INDEX_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] broadcast replay index stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Broadcast replay index ensured');
}
