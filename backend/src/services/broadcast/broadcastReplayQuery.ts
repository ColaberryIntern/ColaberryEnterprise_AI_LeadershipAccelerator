import { Op } from 'sequelize';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import type { DiscoverableOccurrence } from './broadcastDiscovery';
import { findSessionIds } from './broadcastActiveQuery';

/**
 * The "what can I watch back" read (L8.3).
 *
 * Deliberately a SIBLING of `findActiveOccurrences` rather than a widening of it. That query
 * asks a question with a bounded answer — a partial UNIQUE index permits one airing per room,
 * so "what is live" is a handful of rows and is polled every 45 seconds by every open tab.
 * A replay list grows for the life of the product and is read when somebody opens a page. Same
 * shape, different economics, and folding them together would mean the ticker inherits a query
 * that scans a year of classes.
 *
 * ONLY WHAT CAN ACTUALLY PLAY IS LISTED, and that is the whole reason this ticket waited on
 * L8.4. A `replay_ready` occurrence with no bound recording produces a signed url that resolves
 * to nothing: the entry looks real, the click fails, and the student concludes the recording is
 * lost. The ticket says it plainly — built on the original premise, every entry in the list
 * would 404. So the binding is part of the WHERE clause, not an afterthought at render time.
 *
 * `ended` and `processing` are excluded for the same reason `backstage` is excluded from the
 * active list: they are states on the way to somewhere, not states a viewer should be offered.
 * `broadcastEntitlement` already answers `not_watchable` for both, so listing them would offer
 * a row that refuses itself on click.
 */
export const REPLAY_DISCOVERY_STATES = ['replay_ready'] as const;

const COLUMNS = [
  'id', 'title', 'room_id', 'access_mode', 'editorial_state',
  'scheduled_start_at', 'content_started_at', 'ended_at', 'preview_seconds',
] as const;

/**
 * A page, not a feed.
 *
 * Unlike the active list this has no natural ceiling, so the limit is the ceiling. Twenty-five
 * is roughly a term of weekly classes, which is as far back as "I missed last week" ever
 * reaches; anything older is a search problem, not a list problem, and pretending otherwise
 * would ship an unbounded query to every student.
 */
export const REPLAY_DISCOVERY_LIMIT = 25;

export type ReplayOccurrence = DiscoverableOccurrence & {
  preview_seconds: number;
  /** When it finished. The only sensible sort key for a list of past classes. */
  ended_at: Date | null;
};

export async function findReplayOccurrences(
  limit: number = REPLAY_DISCOVERY_LIMIT,
): Promise<ReplayOccurrence[]> {
  const rows = await BroadcastOccurrence.findAll({
    where: {
      editorial_state: { [Op.in]: REPLAY_DISCOVERY_STATES as unknown as string[] },
      // The L8.4 join. Without a bound recording there is nothing to sign, so the row is not a
      // replay yet however finished the class is.
      provider_instance_uuid: { [Op.ne]: null },
    },
    attributes: COLUMNS as unknown as string[],
    // Most recent first: somebody looking for a replay is looking for the class they just
    // missed, not the first one of the course.
    order: [['ended_at', 'DESC']],
    limit,
  });

  const sessions = await findSessionIds(rows.map((row) => row.id));

  // Mapped explicitly rather than spread, for the same reason the active query does it: the
  // values live behind getters on the Sequelize prototype, so a spread loses every column.
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    room_id: row.room_id,
    access_mode: row.access_mode,
    editorial_state: row.editorial_state,
    scheduled_start_at: row.scheduled_start_at,
    content_started_at: row.content_started_at,
    ended_at: row.ended_at,
    preview_seconds: row.preview_seconds,
    session_id: sessions.get(row.id) ?? null,
  }));
}
