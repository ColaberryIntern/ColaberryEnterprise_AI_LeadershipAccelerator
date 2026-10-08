import { Op } from 'sequelize';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import type { DiscoverableOccurrence } from './broadcastDiscovery';

/**
 * The "what is airing" read.
 *
 * THE STATE LIST IS A SUBSET OF THE INDEX PREDICATE, ON PURPOSE.
 * `ensureBroadcastSchema` creates
 *
 *     idx_broadcast_occ_active ON (editorial_state, scheduled_start_at)
 *       WHERE editorial_state IN ('backstage', 'live', 'reconnecting')
 *
 * and this query asks for `('live', 'reconnecting')` — a strict subset, which Postgres can
 * still satisfy from that partial index because the query predicate implies the index
 * predicate. Widening this list beyond those three values would silently drop off the index
 * and turn a ticker poll into a sequential scan.
 *
 * `backstage` is excluded because it is a PRODUCER state. A broadcast being set up is not
 * airing, `broadcastEntitlement` already answers `not_watchable` for it, and listing it would
 * announce a class before anyone decided to go live — which is the opposite of §2's
 * "deliberately mark live".
 *
 * Only the columns `broadcastDiscovery` needs are selected. The model has twenty-odd; the
 * provider session ids and the policy snapshot have no business in a payload shaped for a
 * badge, and not selecting them is cheaper than remembering to strip them.
 */
export const ACTIVE_DISCOVERY_STATES = ['live', 'reconnecting'] as const;

const COLUMNS = [
  'id', 'title', 'room_id', 'access_mode', 'editorial_state',
  'scheduled_start_at', 'content_started_at', 'preview_seconds',
] as const;

/** Bounded: one airing per room is enforced by a partial UNIQUE index, so this stays small. */
export const ACTIVE_DISCOVERY_LIMIT = 25;

export type ActiveOccurrence = DiscoverableOccurrence & { preview_seconds: number };

export async function findActiveOccurrences(
  limit: number = ACTIVE_DISCOVERY_LIMIT,
): Promise<ActiveOccurrence[]> {
  const rows = await BroadcastOccurrence.findAll({
    where: { editorial_state: { [Op.in]: ACTIVE_DISCOVERY_STATES as unknown as string[] } },
    attributes: COLUMNS as unknown as string[],
    order: [['scheduled_start_at', 'ASC']],
    limit,
  });

  // Mapped explicitly rather than spread. Spreading a Sequelize instance loses every column,
  // because the values live behind getters on the prototype rather than on the instance.
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    room_id: row.room_id,
    access_mode: row.access_mode,
    editorial_state: row.editorial_state,
    scheduled_start_at: row.scheduled_start_at,
    content_started_at: row.content_started_at,
    preview_seconds: row.preview_seconds,
  }));
}
