import { z } from 'zod';
import { COMMS_HUB_EVENT_STATUSES, COMMS_HUB_EVENT_TYPES } from '../../db/ensureCommsHubSchema';
import { AudienceInput } from './eventInput';

/** The event as the admin API returns it (CH2.2). Instants are ISO UTC; `central` is the same moment on the Central clock. */
export const EventView = z.object({
  id: z.string().uuid(),
  title: z.string(),
  event_type: z.enum(COMMS_HUB_EVENT_TYPES),
  audience: AudienceInput,
  status: z.enum(COMMS_HUB_EVENT_STATUSES),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  central: z.object({
    date: z.string(),
    start_time: z.string(),
    end_time: z.string().nullable(),
    label: z.string(),
  }).strict(),
  repeat_rule: z.object({ freq: z.enum(['weekly', 'biweekly', 'monthly']), until: z.string() }).nullable(),
  next_occurrence_at: z.string().nullable(),
  upcoming_preview: z.array(z.string()).max(3),
  join_url: z.string().nullable(),
  registration_url: z.string().nullable(),
  hosts: z.array(z.object({ name: z.string(), role: z.string().optional() })),
  description: z.string().nullable(),
  placement: z.object({ calendar: z.boolean(), events_page: z.boolean(), campus_rail: z.boolean() }),
  thumbnail_id: z.string().uuid().nullable(),
  broadcast_occurrence_id: z.string().uuid().nullable(),
  /** CH9.5: set when this hub event manages an Eventbrite event; its title, times and link then come from Eventbrite. */
  ccpp_event_id: z.string().nullable(),
  /** CH9.5: when the managed event was last found missing from Eventbrite's public list, or null. */
  ccpp_missing_since: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();
export type EventView = z.infer<typeof EventView>;

export const EventListResponse = z.object({ events: z.array(EventView) }).strict();
export const EventResponse = z.object({ event: EventView }).strict();
/** CH7.3: what cancelling did beyond the event (null when it was already cancelled). */
export const CancelResponse = z.object({
  event: EventView,
  cancellation: z.object({
    messages_cancelled: z.number().int().nonnegative(),
    deliveries_cancelled: z.number().int().nonnegative(),
    sending_voided: z.number().int().nonnegative(),
    broadcast: z.enum(['cancelled', 'none', 'failed']),
    draft_message_id: z.string().uuid().nullable(),
  }).strict().nullable(),
}).strict();
