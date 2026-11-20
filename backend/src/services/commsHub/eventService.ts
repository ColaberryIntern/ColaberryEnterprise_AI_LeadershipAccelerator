import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import CommsHubEvent, { type CommsHubEventAttributes } from '../../models/CommsHubEvent';
import { centralDateKey, formatCentralDateTime } from '../centralDate';
import { toEventFields, type EventInput } from './eventInput';
import { centralClock, upcomingOccurrences } from './eventRecurrence';
import { syncCalendarRows } from './eventWriteThrough';
import { logActivity, type Actor } from './activityLog';
import { registerSummaryCounters } from './commsHubSummary';
import type { EventView } from './eventSchemas';

/**
 * Communications Hub events (CH2.2): create, update, duplicate, cancel, list. Every mutation runs in
 * one transaction with its calendar write-through and its activity row, so the three never disagree.
 */
export class EventNotFoundError extends Error {}
export class EventStateError extends Error {}

const ACTIVE = ['scheduled', 'live'];
const COMPARED: Array<keyof CommsHubEventAttributes> = [
  'title', 'event_type', 'audience', 'starts_at', 'ends_at', 'repeat_rule', 'join_url', 'registration_url', 'hosts', 'description', 'placement', 'status',
];

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toView(e: CommsHubEvent, now: Date = new Date()): EventView {
  const upcoming = upcomingOccurrences(e.starts_at, e.ends_at, e.repeat_rule, now);
  return {
    id: e.id, title: e.title, event_type: e.event_type, audience: e.audience, status: e.status,
    starts_at: e.starts_at.toISOString(), ends_at: iso(e.ends_at),
    central: {
      date: centralDateKey(e.starts_at.getTime()),
      start_time: centralClock(e.starts_at),
      end_time: e.ends_at ? centralClock(e.ends_at) : null,
      label: formatCentralDateTime(e.starts_at),
    },
    repeat_rule: e.repeat_rule,
    next_occurrence_at: upcoming[0] ? upcoming[0].starts_at.toISOString() : null,
    upcoming_preview: upcoming.slice(0, 3).map((o) => o.starts_at.toISOString()),
    join_url: e.join_url, registration_url: e.registration_url, hosts: e.hosts, description: e.description,
    placement: e.placement, thumbnail_id: e.thumbnail_id, broadcast_occurrence_id: e.broadcast_occurrence_id,
    created_at: e.created_at.toISOString(), updated_at: e.updated_at.toISOString(),
  };
}

export type EventScope = 'upcoming' | 'past' | 'cancelled' | 'all';

export async function listEvents(scope: EventScope, now: Date = new Date()): Promise<EventView[]> {
  const where = scope === 'cancelled' ? { status: 'cancelled' } : scope === 'all' ? {} : { status: { [Op.ne]: 'cancelled' } };
  const rows = await CommsHubEvent.findAll({ where, order: [['starts_at', 'ASC']], limit: 500 });
  const views = rows.map((r) => toView(r, now));
  if (scope === 'upcoming') return views.filter((v) => v.next_occurrence_at !== null).sort((a, b) => a.next_occurrence_at!.localeCompare(b.next_occurrence_at!));
  if (scope === 'past') return views.filter((v) => v.next_occurrence_at === null).reverse();
  return views;
}

async function load(id: string): Promise<CommsHubEvent> {
  const e = await CommsHubEvent.findByPk(id);
  if (!e) throw new EventNotFoundError('Event not found.');
  return e;
}

export async function getEvent(id: string): Promise<EventView> {
  return toView(await load(id));
}

export async function createEvent(input: EventInput, actor: Actor): Promise<EventView> {
  const fields = toEventFields(input);
  const created = await sequelize.transaction(async (t) => {
    const e = await CommsHubEvent.create({ ...fields, created_by: actor.id, updated_by: actor.id }, { transaction: t });
    const rows = await syncCalendarRows(e, t);
    await logActivity(actor, 'event.created', 'event', e.id, { title: e.title, status: e.status, calendar_rows: rows }, t);
    return e;
  });
  return toView(created);
}

/** Field names whose stored value differs from the incoming value. */
function changedFields(e: CommsHubEvent, next: Partial<CommsHubEventAttributes>): string[] {
  const norm = (v: unknown): string => JSON.stringify(v instanceof Date ? v.toISOString() : v ?? null);
  return COMPARED.filter((k) => k in next && norm(e.get(k)) !== norm(next[k]));
}

export async function updateEvent(id: string, input: EventInput, actor: Actor): Promise<EventView> {
  const fields = toEventFields(input);
  const updated = await sequelize.transaction(async (t) => {
    const e = await CommsHubEvent.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!e) throw new EventNotFoundError('Event not found.');
    if (e.status === 'cancelled' || e.status === 'ended') throw new EventStateError(`A ${e.status} event cannot be edited; duplicate it instead.`);
    // A live event keeps its live status; the form only chooses draft or scheduled.
    const next = { ...fields, status: e.status === 'live' ? 'live' as const : fields.status };
    const changed = changedFields(e, next);
    if (changed.length === 0) return e;
    await e.update({ ...next, updated_by: actor.id }, { transaction: t });
    const rows = await syncCalendarRows(e, t);
    await logActivity(actor, 'event.updated', 'event', e.id, { changed, calendar_rows: rows }, t);
    return e;
  });
  return toView(updated);
}

export async function duplicateEvent(id: string, actor: Actor): Promise<EventView> {
  const src = await load(id);
  const copy = await sequelize.transaction(async (t) => {
    const e = await CommsHubEvent.create({
      title: src.title, event_type: src.event_type, audience: src.audience, starts_at: src.starts_at, ends_at: src.ends_at,
      repeat_rule: src.repeat_rule, join_url: src.join_url, registration_url: src.registration_url, hosts: src.hosts,
      description: src.description, placement: src.placement, status: 'draft', created_by: actor.id, updated_by: actor.id,
    }, { transaction: t });
    await logActivity(actor, 'event.duplicated', 'event', e.id, { from: src.id }, t);
    return e;
  });
  return toView(copy);
}

/** Cancel is idempotent: cancelling a cancelled event changes nothing and logs nothing. */
export async function cancelEvent(id: string, actor: Actor): Promise<EventView> {
  const result = await sequelize.transaction(async (t) => {
    const e = await CommsHubEvent.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!e) throw new EventNotFoundError('Event not found.');
    if (e.status === 'cancelled') return e;
    if (e.status === 'live') throw new EventStateError('End the live stream before cancelling this event.');
    await e.update({ status: 'cancelled', updated_by: actor.id }, { transaction: t });
    await syncCalendarRows(e, t);
    await logActivity(actor, 'event.cancelled', 'event', e.id, { title: e.title }, t);
    return e;
  });
  return toView(result);
}

/** The Today tiles this feature owns. */
registerSummaryCounters({
  upcomingEvents: async (now) => (await listEvents('upcoming', now)).filter((v) => ACTIVE.includes(v.status)).length,
  eventsMissingThumbnail: async (now) => (await listEvents('upcoming', now)).filter((v) => ACTIVE.includes(v.status) && !v.thumbnail_id).length,
});
