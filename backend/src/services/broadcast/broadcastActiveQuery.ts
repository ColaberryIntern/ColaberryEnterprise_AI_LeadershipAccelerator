import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
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

  const sessions = await findSessionIds(rows.map((row) => row.id));

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
    session_id: sessions.get(row.id) ?? null,
  }));
}

/**
 * The class session each airing broadcast belongs to: its `live_session` source ref (UNIQUE per
 * session, indexed on occurrence_id), the authoritative one first. One query for the whole page.
 *
 * AN ENRICHMENT, NOT THE ANSWER. If this read fails, discovery still lists what is airing, with no
 * session ids, and the failure is logged: a missing check-in link must not take the live badge down
 * (which is what letting it throw into the controller's 503 would do). Not handled: a session ref
 * pointing at a deleted session; the check-in endpoint refuses that itself.
 */
export async function findSessionIds(occurrenceIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!occurrenceIds.length) return out;
  try {
    const rows = await sequelize.query<{ occurrence_id: string; source_id: string }>(
      `SELECT occurrence_id, source_id
         FROM broadcast_source_refs
        WHERE source_type = 'live_session' AND occurrence_id IN (:ids)
        ORDER BY is_authoritative DESC`,
      { replacements: { ids: [...occurrenceIds] }, type: QueryTypes.SELECT },
    );
    for (const r of rows) if (!out.has(r.occurrence_id)) out.set(r.occurrence_id, r.source_id);
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'broadcast_discovery_session_ids',
      outcome: 'partial', error_class: e?.name || 'UnknownError', context: { occurrences: occurrenceIds.length, message: String(e?.message ?? '').slice(0, 200) },
    }));
  }
  return out;
}
