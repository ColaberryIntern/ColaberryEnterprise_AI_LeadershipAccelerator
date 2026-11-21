import { z } from 'zod';
import { COMMS_HUB_MESSAGE_KINDS } from '../../../db/ensureCommsHubSchema';

/** CH7.4 response contracts for the board, settings and activity routes (checked at the route boundary). */
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const Iso = z.string().datetime();
const Status = z.enum(['draft', 'needs_approval', 'approved', 'scheduled', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled']);

export const QuietHours = z.object({ start: z.string().regex(HHMM, 'Use a time like 21:00.'), end: z.string().regex(HHMM, 'Use a time like 08:00.') }).strict()
  .refine((q) => q.start !== q.end, 'Quiet hours need a different start and end.');

export const SettingsView = z.object({
  sending_paused: z.boolean(),
  quiet_hours: z.object({ start: z.string(), end: z.string() }).nullable(),
  alert_recipients: z.array(z.string()),
  test_cohort: z.object({ id: z.string(), name: z.string() }).nullable(),
  updated_at: Iso.nullable(),
}).strict();

export const SettingsBody = z.object({
  quiet_hours: QuietHours.nullable().optional(),
  alert_recipients: z.array(z.string().trim().email('Each alert recipient must be an email address.').max(254)).max(10, 'Up to 10 alert recipients.').optional(),
  test_cohort_id: z.string().uuid().nullable().optional(),
}).strict();

export const PauseBody = z.object({ paused: z.boolean() }).strict();

export const BoardQuery = z.object({
  scope: z.enum(['approval', 'schedule', 'history']),
  status: z.string().max(200).optional(),
  channel: z.enum(['community_post', 'in_app']).optional(),
  event_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
}).strict();

export const BoardRow = z.object({
  id: z.string(), status: Status, kind: z.enum(COMMS_HUB_MESSAGE_KINDS as unknown as [string, ...string[]]), title: z.string(),
  event: z.object({ id: z.string(), title: z.string(), thumbnail_id: z.string().nullable() }).nullable(),
  send_at: Iso.nullable(), updated_at: Iso,
  destinations: z.array(z.object({ channel: z.enum(['community_post', 'in_app']), label: z.string().nullable() })),
  preview: z.string().nullable(),
  include: z.object({ thumbnail: z.boolean(), join_link: z.boolean(), registration_link: z.boolean() }),
  approved_by: z.string().nullable(),
  deliveries: z.object({ total: z.number(), sent: z.number(), failed: z.number(), pending: z.number(), cancelled: z.number() }),
  failure: z.object({ reason: z.string(), missed: z.array(z.string()), attempts: z.number() }).nullable(),
}).strict();
export const BoardResponse = z.object({ rows: z.array(BoardRow) }).strict();

export const ActivityResponse = z.object({
  activity: z.array(z.object({ id: z.string(), at: Iso, who: z.string(), did: z.string(), about: z.string().nullable(), entity_type: z.string(), entity_id: z.string().nullable() }).strict()),
}).strict();
