import { z } from 'zod';
import { classInstant } from '../centralDate';
import { COMMS_HUB_EVENT_TYPES } from '../../db/ensureCommsHubSchema';
import { MAX_REPEAT_DAYS } from './eventRecurrence';
import type { CommsHubEventAttributes } from '../../models/CommsHubEvent';

/**
 * What the event form sends (CH2.2). The organizer types a Central date and clock time; this is
 * the one place they become instants (centralDate.classInstant). Elsewhere in the hub, dates are
 * only stepped on the calendar (noon-UTC "YYYY-MM-DD" arithmetic, explicit Z), never read as a
 * wall clock.
 */
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM (24-hour, Central)');
const URL_OR_NULL = z.string().trim().url().max(2000).nullable().optional();

export const AudienceInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all_members') }).strict(),
  z.object({ kind: z.literal('cohorts'), cohort_ids: z.array(z.string().uuid()).min(1).max(50) }).strict(),
]);

export const EventInput = z.object({
  title: z.string().trim().min(1).max(255),
  event_type: z.enum(COMMS_HUB_EVENT_TYPES).default('other'),
  audience: AudienceInput.default({ kind: 'all_members' }),
  date: DATE,
  start_time: TIME,
  end_time: TIME.nullable().optional(),
  repeat: z.object({ freq: z.enum(['weekly', 'biweekly', 'monthly']), until: DATE }).strict().nullable().optional(),
  // 500, not 2000: the join link is written through to community_events.location_url, a VARCHAR(500).
  join_url: z.string().trim().url().max(500).nullable().optional(),
  registration_url: URL_OR_NULL,
  hosts: z.array(z.object({ name: z.string().trim().min(1).max(120), role: z.string().trim().max(120).optional() }).strict()).max(6).default([]),
  description: z.string().max(5000).nullable().optional(),
  placement: z.object({ calendar: z.boolean(), events_page: z.boolean(), campus_rail: z.boolean() }).strict()
    .default({ calendar: true, events_page: true, campus_rail: true }),
  status: z.enum(['draft', 'scheduled']).default('scheduled'),
}).strict();
export type EventInput = z.infer<typeof EventInput>;

export class EventInputError extends Error {}

/** The row fields an input produces. Throws EventInputError for rules zod cannot see (end before start, repeat range). */
export function toEventFields(input: EventInput): Omit<CommsHubEventAttributes, 'id' | 'created_by' | 'updated_by'> {
  const starts = classInstant(input.date, input.start_time);
  const ends = input.end_time ? classInstant(input.date, input.end_time) : null;
  if (ends && ends.getTime() <= starts.getTime()) throw new EventInputError('The end time must be after the start time.');
  if (input.repeat) {
    if (input.repeat.until < input.date) throw new EventInputError('The repeat end date must be on or after the first date.');
    const days = (Date.parse(`${input.repeat.until}T12:00:00Z`) - Date.parse(`${input.date}T12:00:00Z`)) / 86_400_000;
    if (days > MAX_REPEAT_DAYS) throw new EventInputError('A repeating event can run for at most one year; set an earlier end date.');
  }
  return {
    title: input.title,
    event_type: input.event_type,
    audience: input.audience,
    starts_at: starts,
    ends_at: ends,
    repeat_rule: input.repeat ?? null,
    join_url: input.join_url ?? null,
    registration_url: input.registration_url ?? null,
    hosts: input.hosts,
    description: input.description ?? null,
    placement: input.placement,
    status: input.status,
  };
}
