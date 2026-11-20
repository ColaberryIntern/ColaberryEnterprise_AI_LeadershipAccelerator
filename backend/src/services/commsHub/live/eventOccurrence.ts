import { sequelize } from '../../../config/database';
import { env } from '../../../config/env';
import BroadcastOccurrence, { type BroadcastAccessMode } from '../../../models/BroadcastOccurrence';
import Cohort from '../../../models/Cohort';
import CommunityRoom from '../../../models/CommunityRoom';
import type CommsHubEvent from '../../../models/CommsHubEvent';
import { deriveStartInstant, occurrenceKeyFor } from '../../broadcast/broadcastIdentity';
import { resolveLiveInput } from '../../broadcast/broadcastInputBinding';
import { cohortRoomSlug, ensureRoomForCohort } from '../../communityRooms/cohortRoomService';
import { centralDateKey } from '../../centralDate';
import { expandOccurrences } from '../eventRecurrence';
import { OPEN_ENDED_MS } from '../portalHubEvents';

/**
 * A Communications Hub event becomes a Colaberry Live broadcast occurrence (CH5.1), beside
 * ensureOccurrenceForSession (broadcastSessionOccurrence.ts) and following the same rules:
 * creation is not a transition (no producer command), the database's unique source ref is the
 * idempotency, nothing guesses a time, and a live input is resolved before anything is written.
 *
 * ONE OCCURRENCE PER DATE. A weekly event airs many times; broadcast_source_refs is UNIQUE on
 * (source_type, source_id), so the source id is "<hub event id>@<Central date>". Re-timing the
 * event on the same date re-times that date's occurrence while it is still scheduled or backstage;
 * a date that has aired or was cancelled is refused, exactly as for sessions. source_type is
 * 'community_event' (already in the broadcast schema's list); the "@date" suffix keeps these ids
 * distinct from the plain community_events UUIDs the backfill planner reads.
 *
 * WHO CAN WATCH (decision, CH5.1):
 * - All members: access_mode 'free' (the broadcast enum value) with no room. The playback grant
 *   (broadcastEntitlement.decideBroadcastAccess) gives any signed-in member full access for
 *   'free' before it ever looks at a room, and a null room only makes room eligibility false,
 *   which 'free' does not consult. Signed-out visitors are still refused ('guest').
 * - One cohort: access_mode 'private' in that batch's own room (cohortRoomService.ensureRoomForCohort),
 *   so room eligibility limits it to that batch (and staff).
 * - Several cohorts: refused. There is no single room for them and 'free' would widen it to every
 *   member; the organizer is told to pick one cohort or all members.
 * The access mode is written once at creation, never widened in place (ensureBroadcastSchema). If the
 * event's audience is edited after a date was prepared, that date is REFUSED ('audience_changed')
 * rather than reported as the new policy: the stored one is what governs playback.
 *
 * THE EVENT'S LINK (comms_hub_events.broadcast_occurrence_id) is the date most recently prepared,
 * except that it never moves off an occurrence that is backstage, live or reconnecting. A specific
 * date's occurrence is always found through its source ref (sourceIdFor), never through this link.
 */
export type LiveRefusal = 'no_live_input' | 'undeterminable_start' | 'no_room' | 'several_cohorts' | 'already_aired' | 'cancelled' | 'not_a_date_of_this_event' | 'event_closed' | 'event_draft' | 'audience_changed';

const MESSAGE: Record<LiveRefusal, string> = {
  no_live_input: 'No live stream input is set up on this server, so this event cannot go live.',
  undeterminable_start: 'This event has no start time that can be read, so it cannot be prepared for live.',
  no_room: 'This cohort has no batch room to stream into. Pick all members, or ask an admin to set up the room.',
  several_cohorts: 'An event for several cohorts cannot stream yet. Choose one cohort, or all members.',
  already_aired: 'That date has already gone live, so it cannot be prepared again.',
  cancelled: 'The stream for that date was cancelled and cannot be used again.',
  not_a_date_of_this_event: 'That is not one of this event\'s dates.',
  event_closed: 'This event is cancelled or over, so it cannot go live.',
  event_draft: 'Save the event first (not as a draft), then prepare it for live.',
  audience_changed: 'Who this event is for changed after this date was prepared for live, and a stream\'s audience cannot change. Change it back, or duplicate the event for the new audience.',
};

export class LiveRefusedError extends Error {
  constructor(public readonly reason: LiveRefusal, public readonly detail?: string) { super(MESSAGE[reason]); }
}

export interface EnsureLiveResult { outcome: 'created' | 'retimed' | 'unchanged'; occurrenceId: string; startsAt: Date; accessMode: BroadcastAccessMode; roomId: string | null }

const RETIMEABLE = new Set(['scheduled', 'backstage']);

export const sourceIdFor = (eventId: string, startsAt: Date): string => `${eventId}@${centralDateKey(startsAt.getTime())}`;

/** The date to stream: the one asked for (must be a real date of the event), else the next one not yet over. */
export function pickOccurrence(e: Pick<CommsHubEvent, 'starts_at' | 'ends_at' | 'repeat_rule'>, at: Date | null, now: Date): Date | null {
  const all = expandOccurrences(e.starts_at, e.ends_at, e.repeat_rule);
  if (at) return all.find((o) => Math.floor(o.starts_at.getTime() / 60000) === Math.floor(at.getTime() / 60000))?.starts_at ?? null;
  const next = all.find((o) => (o.ends_at ? o.ends_at.getTime() : o.starts_at.getTime() + OPEN_ENDED_MS) >= now.getTime());
  return next?.starts_at ?? null;
}

/**
 * Where it streams and who may watch, from the event's audience. `create` false only LOOKS UP the
 * batch room (used to compare with an existing occurrence, so a refusal never creates a room).
 */
export async function accessFor(e: Pick<CommsHubEvent, 'audience'>, create = true): Promise<{ accessMode: BroadcastAccessMode; roomId: string | null }> {
  if (e.audience.kind === 'all_members') return { accessMode: 'free', roomId: null };
  if (e.audience.cohort_ids.length !== 1) throw new LiveRefusedError('several_cohorts');
  if (!env.communityRoomsEnabled) throw new LiveRefusedError('no_room', 'community rooms are off');
  const cohort = await Cohort.findByPk(e.audience.cohort_ids[0]);
  if (!cohort) throw new LiveRefusedError('no_room', 'cohort not found');
  const room = create
    ? await ensureRoomForCohort({ id: cohort.id, name: cohort.name, cohort_type: cohort.cohort_type })
    : await CommunityRoom.findOne({ where: { slug: cohortRoomSlug(cohort.id) } });
  if (!room) throw new LiveRefusedError('no_room', 'not a batch cohort');
  return { accessMode: 'private', roomId: room.id };
}

interface ExistingRow { id: string; occurrence_key: string; editorial_state: string; access_mode: BroadcastAccessMode; room_id: string | null }

const ACTIVE = new Set(['backstage', 'live', 'reconnecting']);

async function findExisting(sourceId: string): Promise<ExistingRow | null> {
  const [rows] = await sequelize.query(
    `SELECT o.id, o.occurrence_key, o.editorial_state, o.access_mode, o.room_id
       FROM broadcast_source_refs r JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.source_type = 'community_event' AND r.source_id = :sid LIMIT 1`,
    { replacements: { sid: sourceId } },
  );
  const list = rows as ExistingRow[];
  return list.length ? list[0] : null;
}

/** Whether the event's currently linked occurrence is on air (backstage, live or reconnecting): then the link stays. */
async function linkedIsActive(occurrenceId: string | null): Promise<boolean> {
  if (!occurrenceId) return false;
  const [rows] = await sequelize.query('SELECT editorial_state FROM broadcast_occurrences WHERE id = :id', { replacements: { id: occurrenceId } });
  const state = (rows as Array<{ editorial_state: string }>)[0]?.editorial_state;
  return state !== undefined && ACTIVE.has(state);
}

function log(event: string, outcome: 'success' | 'failure', context: Record<string, unknown>): void {
  console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'warn' : 'info', service: 'comms_hub', event, outcome, context }));
}

/**
 * Ensure the occurrence for one date of a hub event exists and is scheduled at the right instant,
 * and link it on the event. Refusals throw LiveRefusedError (typed, with a sentence for the
 * organizer); infrastructure errors propagate.
 */
export async function ensureOccurrenceForCommunityEvent(event: CommsHubEvent, at: Date | null = null, now: Date = new Date()): Promise<EnsureLiveResult> {
  const refuse = (reason: LiveRefusal, detail?: string): never => {
    log('comms_hub_live_refused', 'failure', { eventId: event.id, reason, detail });
    throw new LiveRefusedError(reason, detail);
  };
  if (event.status === 'cancelled' || event.status === 'ended') refuse('event_closed', event.status);
  if (event.status === 'draft') refuse('event_draft');

  const picked = pickOccurrence(event, at, now);
  if (!picked) refuse(at ? 'not_a_date_of_this_event' : 'undeterminable_start', at ? at.toISOString() : 'no upcoming date');
  const sourceId = sourceIdFor(event.id, picked!);
  const instant = deriveStartInstant({ sourceType: 'community_event', sourceId, startsAt: picked });
  if (!instant.derived || !instant.startsAt) refuse('undeterminable_start', instant.reason);
  const startsAt = instant.startsAt!;

  // Resolved BEFORE anything is written: an occurrence that cannot play is found by the audience, not the organizer.
  const binding = resolveLiveInput();
  if (!binding.bound) refuse('no_live_input', binding.reason);
  const key = occurrenceKeyFor('community_event', sourceId, startsAt);

  const existing = await findExisting(sourceId);
  let result: EnsureLiveResult;
  if (!existing) {
    const { accessMode, roomId } = await accessFor(event, true);
    try {
      let id = '';
      await sequelize.transaction(async (tx) => {
        const o = await BroadcastOccurrence.create({
          occurrence_key: key, title: event.title, room_id: roomId, scheduled_start_at: startsAt,
          access_mode: accessMode, editorial_state: 'scheduled',
          provider: binding.bound ? binding.provider : undefined, provider_session_id: binding.bound ? binding.providerSessionId : undefined,
        } as never, { transaction: tx });
        await sequelize.query(
          `INSERT INTO broadcast_source_refs (occurrence_id, source_type, source_id, is_authoritative, linked_reason)
           VALUES (:occurrenceId, 'community_event', :sourceId, true, :reason)`,
          { replacements: { occurrenceId: o.id, sourceId, reason: 'prepared for live from the Communications Hub' }, transaction: tx },
        );
        id = o.id;
      });
      log('comms_hub_live_occurrence_created', 'success', { eventId: event.id, occurrenceId: id, key, accessMode });
      result = { outcome: 'created', occurrenceId: id, startsAt, accessMode, roomId };
    } catch (err) {
      // The unique source ref is the arbiter: a lost race converges on the row that won (reported as stored).
      if ((err as { name?: string })?.name !== 'SequelizeUniqueConstraintError') throw err;
      const won = await findExisting(sourceId);
      if (!won) throw err;
      result = { outcome: 'unchanged', occurrenceId: won.id, startsAt, accessMode: won.access_mode, roomId: won.room_id };
    }
  } else {
    if (existing.occurrence_key !== key && !RETIMEABLE.has(existing.editorial_state)) {
      refuse(existing.editorial_state === 'cancelled' ? 'cancelled' : 'already_aired', existing.editorial_state);
    }
    // The stored policy governs playback and is never widened in place: an edited audience is refused, not reported.
    const wanted = await accessFor(event, false);
    if (wanted.accessMode !== existing.access_mode || wanted.roomId !== existing.room_id) {
      refuse('audience_changed', `stored ${existing.access_mode}/${existing.room_id ?? 'no room'}, event now ${wanted.accessMode}/${wanted.roomId ?? 'no room'}`);
    }
    if (existing.occurrence_key === key) {
      result = { outcome: 'unchanged', occurrenceId: existing.id, startsAt, accessMode: existing.access_mode, roomId: existing.room_id };
    } else {
      await sequelize.query(
        `UPDATE broadcast_occurrences SET occurrence_key = :key, scheduled_start_at = :startsAt, title = :title, version = version + 1, updated_at = now() WHERE id = :id`,
        { replacements: { key, startsAt, title: event.title, id: existing.id } },
      );
      log('comms_hub_live_occurrence_retimed', 'success', { eventId: event.id, occurrenceId: existing.id, key });
      result = { outcome: 'retimed', occurrenceId: existing.id, startsAt, accessMode: existing.access_mode, roomId: existing.room_id };
    }
  }
  if (event.broadcast_occurrence_id !== result.occurrenceId && !(await linkedIsActive(event.broadcast_occurrence_id))) {
    await event.update({ broadcast_occurrence_id: result.occurrenceId });
  }
  return result;
}
