import type { Transaction } from 'sequelize';
import Cohort from '../../models/Cohort';
import CommunityEvent, { type CommunityEventType } from '../../models/CommunityEvent';
import type CommsHubEvent from '../../models/CommsHubEvent';
import { expandOccurrences } from './eventRecurrence';

/**
 * Write-through to the member calendar (CH2.2). The calendar reads community_events per viewer
 * cohort (communityCalendarService), so the hub writes one row per audience cohort per occurrence,
 * each carrying hub_event_id. Readers audit (run dir): no reader can double-count a viewer, because
 * a viewer resolves to one cohort.
 *
 * Idempotent by construction: every sync deletes this event's rows and re-inserts the current set
 * inside the caller's transaction, so a retry, an edit or a cancel always converges on one truth.
 */
export function calendarType(t: CommsHubEvent['event_type']): CommunityEventType {
  return t === 'workshop' ? 'other' : t;
}

/** The cohorts an audience reaches. "All members" means every cohort that is open right now. */
export async function audienceCohortIds(event: CommsHubEvent, transaction?: Transaction): Promise<string[]> {
  if (event.audience.kind === 'cohorts') return [...new Set(event.audience.cohort_ids)];
  const open = await Cohort.findAll({ where: { status: 'open' }, attributes: ['id'], transaction });
  return open.map((c) => c.get('id') as string);
}

/** True when this event belongs on the calendar at all. */
export function onCalendar(event: CommsHubEvent): boolean {
  return event.placement?.calendar !== false && (event.status === 'scheduled' || event.status === 'live');
}

export async function syncCalendarRows(event: CommsHubEvent, transaction: Transaction): Promise<number> {
  await CommunityEvent.destroy({ where: { hub_event_id: event.id }, transaction });
  if (!onCalendar(event)) return 0;
  const cohorts = await audienceCohortIds(event, transaction);
  const occurrences = expandOccurrences(event.starts_at, event.ends_at, event.repeat_rule);
  const rows = cohorts.flatMap((cohort_id) => occurrences.map((o) => ({
    cohort_id,
    title: event.title,
    description: event.description,
    event_type: calendarType(event.event_type),
    starts_at: o.starts_at,
    ends_at: o.ends_at,
    location_url: event.join_url,
    hub_event_id: event.id,
  })));
  if (rows.length) await CommunityEvent.bulkCreate(rows, { transaction });
  return rows.length;
}
