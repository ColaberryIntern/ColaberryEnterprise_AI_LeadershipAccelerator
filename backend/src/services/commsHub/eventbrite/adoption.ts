import { Op, QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import CommsHubEvent from '../../../models/CommsHubEvent';
import { logActivity, WORKER_ACTOR, type Actor } from '../activityLog';
import { syncCalendarRows } from '../eventWriteThrough';
import { canonical, toView } from '../eventService';
import { cascadeEventEdit } from '../messages/eventCascade';
import type { EventView } from '../eventSchemas';
import { findPublicEvent } from './registrants';
import { listEventbriteEvents, type EventbriteEventView } from './eventbriteEvents';
import { PAST_DAYS, UPCOMING_DAYS } from './eventbriteSource';

/**
 * "Manage in the hub" for an Eventbrite event (CH9.5). Every live, plan and message feature works on
 * a hub event row, so managing an Eventbrite event means one hub event linked to it by
 * `ccpp_event_id`. Eventbrite stays the record: the hub never writes CCPP or calls Eventbrite.
 *
 * WHO OWNS WHAT. Eventbrite owns the title, start, end, registration link and picture; the hub re-reads
 * them (syncAdoptedEvents) and the editor and updateEvent refuse to change them. The hub owns everything
 * else: thumbnail, promotion plan, hosts, join link, placement, going live.
 *
 * WHERE IT SHOWS. Audience all members; the member Events page only (calendar and campus rail off), so
 * the event appears exactly where the Eventbrite event already did. Its registration link is the
 * Eventbrite URL, so /portal/events shows the hub card INSTEAD of the Eventbrite card (mergeCards), and
 * that hub card inherits the viewer's "You're registered" and the signup count from the card it replaces.
 *
 * IDEMPOTENT. A unique partial index on ccpp_event_id plus INSERT ... ON CONFLICT DO NOTHING: adopting
 * twice, or two people adopting at once, gives one hub event and the same answer.
 *
 * FAILURE. The public list unreadable: AdoptUnavailableError (503). Not public: AdoptNotFoundError (404).
 * Already over: AdoptEndedError (409). The sync isolates each event: one failing is logged and the
 * rest go on; when the Eventbrite list cannot be read the sync does nothing (it cannot tell "removed"
 * from "down").
 */
export class AdoptNotFoundError extends Error { constructor() { super('That event is not on the public Eventbrite list.'); this.name = 'AdoptNotFoundError'; } }
export class AdoptUnavailableError extends Error { constructor() { super('The Eventbrite list is unavailable right now. Try again in a few minutes.'); this.name = 'AdoptUnavailableError'; } }
export class AdoptEndedError extends Error { constructor() { super('This event has ended, so there is nothing left to manage.'); this.name = 'AdoptEndedError'; } }

/** An event with no end time is treated as running this long (the same rule as the portal). */
const OPEN_ENDED_MS = 4 * 3_600_000;

/** The Eventbrite-owned fields of a hub event, from the Eventbrite view. Pure. */
export function eventbriteFields(ev: EventbriteEventView): { title: string; starts_at: Date; ends_at: Date | null; registration_url: string | null; source_image_url: string | null } {
  const starts = new Date(ev.starts_at);
  const ends = ev.ends_at ? new Date(ev.ends_at) : null;
  return {
    title: ev.title.slice(0, 255),
    starts_at: starts,
    // The events table requires an end after the start; Eventbrite occasionally has neither.
    ends_at: ends && ends.getTime() > starts.getTime() ? ends : null,
    registration_url: ev.registration_url,
    source_image_url: ev.image_url,
  };
}

export async function adoptEventbriteEvent(
  ccppEventId: string, actor: Actor,
  deps: { findEvent?: typeof findPublicEvent; now?: () => number } = {},
): Promise<{ event: EventView; created: boolean }> {
  const now = (deps.now ?? Date.now)();
  const found = await (deps.findEvent ?? findPublicEvent)(ccppEventId);
  if (found === 'unavailable') throw new AdoptUnavailableError();
  if (found === null) throw new AdoptNotFoundError();
  const f = eventbriteFields(found);
  const end = f.ends_at ? f.ends_at.getTime() : f.starts_at.getTime() + OPEN_ENDED_MS;
  if (end <= now) throw new AdoptEndedError();

  const result = await sequelize.transaction(async (t) => {
    const inserted = await sequelize.query<{ id: string }>(
      `INSERT INTO comms_hub_events
         (id, title, event_type, audience, starts_at, ends_at, registration_url, description, placement, status,
          ccpp_event_id, source_image_url, created_by, updated_by, created_at, updated_at)
       VALUES (gen_random_uuid(), :title, :eventType, '{"kind":"all_members"}'::jsonb, :startsAt, :endsAt, :registrationUrl, :description,
          '{"calendar":false,"events_page":true,"campus_rail":false}'::jsonb, 'scheduled',
          :ccppEventId, :sourceImageUrl, :actorId, :actorId, now(), now())
       ON CONFLICT (ccpp_event_id) WHERE ccpp_event_id IS NOT NULL DO NOTHING
       RETURNING id`,
      {
        replacements: {
          title: f.title, eventType: /open house/i.test(f.title) ? 'open_house' : 'session',
          startsAt: f.starts_at, endsAt: f.ends_at, registrationUrl: f.registration_url,
          // Copied once, as a starting point: after that the description is the hub's to edit (the sync
          // never touches it), because it is what members read on the card the hub now shows.
          description: found.description ? found.description.slice(0, 5000) : null,
          ccppEventId, sourceImageUrl: f.source_image_url, actorId: actor.id,
        },
        type: QueryTypes.SELECT, transaction: t,
      },
    );
    const created = inserted.length > 0;
    const e = await CommsHubEvent.findOne({ where: { ccpp_event_id: ccppEventId }, transaction: t });
    if (!e) throw new Error(`adopted event ${ccppEventId} not found after insert`);
    if (created) {
      await syncCalendarRows(e, t);
      await logActivity(actor, 'event.adopted', 'event', e.id, { ccpp_event_id: ccppEventId, title: e.title }, t);
    }
    return { e, created };
  });
  return { event: toView(result.e), created: result.created };
}

const OWNED = ['title', 'starts_at', 'ends_at', 'registration_url', 'source_image_url'] as const;

/**
 * Bring one adopted event's Eventbrite-owned fields up to date, inside the caller's transaction.
 * Never touches hub-owned fields; skips cancelled and ended events. A changed date, time or link goes
 * through the same cascade an edit does (CH7.3): approvals on its messages are voided.
 */
export async function applyEventbriteFields(e: CommsHubEvent, ev: EventbriteEventView, actor: Actor, now: Date, t: Transaction): Promise<string[]> {
  if (e.status === 'cancelled' || e.status === 'ended') return [];
  const next = { ...eventbriteFields(ev), ccpp_missing_since: null };
  const changed = OWNED.filter((k) => canonical(e.get(k)) !== canonical(next[k]));
  const wasMissing = e.ccpp_missing_since !== null && e.ccpp_missing_since !== undefined;
  if (changed.length === 0 && !wasMissing) return [];
  await e.update({ ...next, updated_by: actor.id }, { transaction: t });
  if (changed.length) {
    await syncCalendarRows(e, t);
    await logActivity(actor, 'event.synced_from_eventbrite', 'event', e.id, { changed: [...changed], ccpp_event_id: e.ccpp_event_id }, t);
    await cascadeEventEdit(e, [...changed], actor, now, t);
  }
  return [...changed];
}

export interface SyncResult { status: 'synced' | 'skipped_unavailable'; checked: number; updated: number; missing: number; failed: number }

let lastSyncAt = 0;
export const SYNC_EVERY_MS = 15 * 60 * 1000;

/** Re-read every adopted event from Eventbrite. One failing event never stops the others. */
export async function syncAdoptedEvents(now: Date = new Date(), deps: { list?: typeof listEventbriteEvents } = {}): Promise<SyncResult> {
  const list = deps.list ?? listEventbriteEvents;
  const [up, past] = await Promise.all([list('upcoming'), list('past')]);
  if (up.status !== 'ok' || past.status !== 'ok') return { status: 'skipped_unavailable', checked: 0, updated: 0, missing: 0, failed: 0 };
  const byId = new Map([...up.events, ...past.events].map((ev) => [ev.ccpp_event_id, ev]));
  const rows = await CommsHubEvent.findAll({ where: { ccpp_event_id: { [Op.ne]: null }, status: { [Op.in]: ['draft', 'scheduled', 'live'] } }, order: [['starts_at', 'ASC']] });
  const out: SyncResult = { status: 'synced', checked: rows.length, updated: 0, missing: 0, failed: 0 };
  const windowFrom = now.getTime() - (PAST_DAYS - 1) * 86_400_000;
  const windowTo = now.getTime() + (UPCOMING_DAYS - 1) * 86_400_000;
  for (const row of rows) {
    try {
      const ev = byId.get(String(row.ccpp_event_id));
      if (ev) {
        // eslint-disable-next-line no-await-in-loop
        const changed = await sequelize.transaction(async (t) => {
          const locked = await CommsHubEvent.findByPk(row.id, { transaction: t, lock: t.LOCK.UPDATE });
          return locked ? applyEventbriteFields(locked, ev, WORKER_ACTOR, now, t) : [];
        });
        if (changed.length) out.updated += 1;
        continue;
      }
      // Not on either list. Only an event inside the windows can be "missing"; one that simply aged out
      // of the past window is not. Flagged once, never deleted; the flag clears if it comes back.
      const t0 = row.starts_at.getTime();
      if (t0 >= windowFrom && t0 <= windowTo && !row.ccpp_missing_since) {
        // eslint-disable-next-line no-await-in-loop
        await row.update({ ccpp_missing_since: now });
        // eslint-disable-next-line no-await-in-loop
        await logActivity(WORKER_ACTOR, 'event.missing_from_eventbrite', 'event', row.id, { ccpp_event_id: row.ccpp_event_id, title: row.title });
        out.missing += 1;
      }
    } catch (err) {
      out.failed += 1;
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'comms_hub', event: 'comms_hub_eventbrite_sync_event_failed',
        outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError',
        context: { hub_event_id: row.id, ccpp_event_id: row.ccpp_event_id, message: String((err as Error)?.message ?? err).slice(0, 200) },
      }));
    }
  }
  return out;
}

/** The worker's step: at most once every 15 minutes (the worker ticks every minute). */
export async function syncAdoptedEventsIfDue(now: Date = new Date()): Promise<SyncResult | null> {
  if (now.getTime() - lastSyncAt < SYNC_EVERY_MS) return null;
  lastSyncAt = now.getTime();
  return syncAdoptedEvents(now);
}

/** Test-only. */
export function __resetSyncClock(): void { lastSyncAt = 0; }

/**
 * Which hub event manages each listed Eventbrite event. Read fresh on every list call: the list itself
 * is cached for two minutes, and a card that just became "Managed in the hub" must say so at once.
 */
export async function adoptedIds(ccppEventIds: string[]): Promise<Map<string, string>> {
  if (ccppEventIds.length === 0) return new Map();
  const rows = await CommsHubEvent.findAll({ where: { ccpp_event_id: { [Op.in]: ccppEventIds } }, attributes: ['id', 'ccpp_event_id'] });
  return new Map(rows.map((r) => [String(r.ccpp_event_id), r.id]));
}
