import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import CommsHubEvent from '../../models/CommsHubEvent';
import { listRegistrants } from './eventbrite/registrants';

/**
 * Three numbers on an event (CH9.7): how many registered, how many watched it live, how many watched
 * the replay. Each is a real count or null WITH A REASON, never a made-up 0: 0 means "nobody", and
 * showing 0 for "we could not tell" would be a false fact on an organizer's screen.
 *
 * LIVE vs REPLAY. The viewer telemetry counts anyone who pressed play, live or replay, in one row per
 * person per stream (broadcast_viewer_people). They are told apart by WHEN the person first started
 * watching: at or before the stream ended is live; after it ended is the replay. Staff and test
 * viewers are left out (the same exclusion the live audience reader uses). A person is counted once
 * per kind across all of the event's dates.
 *
 * FAILURE. Telemetry unreadable: both watch counts null, "Viewing numbers are unavailable right now."
 * Eventbrite unreadable: registered null, because a count of only our own site's registrations would
 * read as the whole number.
 */
export interface Count { value: number | null; reason: string | null }
export interface EventCounts { registered: Count; watched_live: Count; watched_replay: Count }

export class EventCountsNotFound extends Error { constructor() { super('Event not found.'); this.name = 'EventCountsNotFound'; } }

const known = (value: number): Count => ({ value, reason: null });
const unknown = (reason: string): Count => ({ value: null, reason });

interface StreamRow { id: string; content_started_at: Date | null; ended_at: Date | null }
interface ViewerRow { occurrence_id: string; enrollment_id: string; first_seen_at: Date }

/** Pure: the two watch counts from the event's streams and their viewers. Exported for its tests. */
export function watchCounts(streams: StreamRow[], viewers: ViewerRow[]): Pick<EventCounts, 'watched_live' | 'watched_replay'> {
  const aired = streams.filter((s) => s.content_started_at);
  if (aired.length === 0) return { watched_live: unknown('Not streamed yet.'), watched_replay: unknown('Not streamed yet.') };
  const endOf = new Map(aired.map((s) => [s.id, s.ended_at ? new Date(s.ended_at).getTime() : null]));
  const live = new Set<string>();
  const replay = new Set<string>();
  for (const v of viewers) {
    if (!endOf.has(v.occurrence_id)) continue;
    const end = endOf.get(v.occurrence_id)!;
    if (end === null || new Date(v.first_seen_at).getTime() <= end) live.add(v.enrollment_id); else replay.add(v.enrollment_id);
  }
  const anyEnded = aired.some((s) => s.ended_at);
  return {
    watched_live: known(live.size),
    watched_replay: anyEnded ? known(replay.size) : unknown('The stream has not ended yet, so there is no replay.'),
  };
}

async function registered(e: CommsHubEvent): Promise<Count> {
  if (!e.ccpp_event_id) {
    return unknown(e.registration_url ? 'Registration for this event is taken outside the hub.' : 'This event has no registration.');
  }
  try {
    const list = await listRegistrants(String(e.ccpp_event_id));
    if (list.eventbrite === 'ok') return known(list.rows.length);
    // Not connected is permanent on this server; unreadable is "right now". Each says which.
    return unknown(list.eventbrite === 'not_configured' ? 'Eventbrite is not connected on this server.' : 'Eventbrite could not be read just now.');
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'comms_hub', event: 'comms_hub_counts_registered_failed', outcome: 'partial', error_class: (err as Error)?.name ?? 'UnknownError', context: { hub_event_id: e.id } }));
    return unknown('The registrations could not be counted just now.');
  }
}

async function watched(eventId: string): Promise<Pick<EventCounts, 'watched_live' | 'watched_replay'>> {
  try {
    const streams = await sequelize.query<StreamRow>(
      `SELECT o.id, o.content_started_at, o.ended_at
         FROM broadcast_source_refs r JOIN broadcast_occurrences o ON o.id = r.occurrence_id
        WHERE r.source_type = 'community_event' AND split_part(r.source_id, '@', 1) = :eventId AND position('@' in r.source_id) > 0`,
      { replacements: { eventId }, type: QueryTypes.SELECT },
    );
    const ids = streams.map((s) => s.id);
    const viewers = ids.length ? await sequelize.query<ViewerRow>(
      `SELECT occurrence_id, enrollment_id, first_seen_at FROM broadcast_viewer_people
        WHERE occurrence_id IN (:ids) AND is_staff = false AND is_test = false`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    ) : [];
    return watchCounts(streams, viewers);
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'comms_hub', event: 'comms_hub_counts_watch_failed', outcome: 'partial', error_class: (err as Error)?.name ?? 'UnknownError', context: { hub_event_id: eventId } }));
    return { watched_live: unknown('Viewing numbers are unavailable right now.'), watched_replay: unknown('Viewing numbers are unavailable right now.') };
  }
}

export async function eventCounts(hubEventId: string): Promise<EventCounts> {
  const e = await CommsHubEvent.findByPk(hubEventId, { attributes: ['id', 'ccpp_event_id', 'registration_url'] });
  if (!e) throw new EventCountsNotFound();
  const [reg, watch] = await Promise.all([registered(e), watched(e.id)]);
  return { registered: reg, ...watch };
}
