/**
 * The Today payload contract for the Admissions & Ops Command Center (AO2.1, kit SPEC 4.1).
 * Validated at the route boundary (sendValidated) and in tests. Every figure carries a source and a pull time;
 * a source can be down, and the payload says so rather than presenting stale numbers as current.
 */
import { z } from 'zod';

export const SourceStatus = z.enum(['ok', 'stale', 'down', 'not_connected']);
export type SourceStatus = z.infer<typeof SourceStatus>;

export const SystemId = z.enum(['ghl', 'app_colaberry', 'retool', 'tfc', 'paysimple', 'gmail', 'zendesk', 'sheets']);
export type SystemId = z.infer<typeof SystemId>;

export const SectionId = z.enum(['admissions', 'communications', 'students', 'payments', 'compliance', 'events']);
export type SectionId = z.infer<typeof SectionId>;

const IsoTime = z.string().datetime({ offset: true });

export const SystemState = z.object({
  id: SystemId,
  name: z.string().min(1),
  record_for: z.string().min(1),
  status: SourceStatus,
  /** Last successful pull. Null when never synced (or not connected). */
  synced_at: IsoTime.nullable(),
});

export const QueueItem = z.object({
  id: z.string().min(1),
  section: SectionId,
  when: z.enum(['today', 'this_week']),
  trigger: z.string().min(1),
  subject: z.object({ kind: z.enum(['student', 'group']), label: z.string().min(1), ref: z.string().min(1).nullable() }),
  why: z.string().min(1),
  systems_checked: z.array(SystemId).min(1),
  next_step: z.string().min(1),
  /** The approval the next step needs, or 'read_only' when it changes nothing. */
  approval: z.enum(['read_only', 'needs_approval', 'bulk_needs_approval']),
  /** The oldest pull among the systems checked, so the item is never fresher than its stalest source. */
  pulled_at: IsoTime.nullable(),
  /** Systems behind this item that are down: the item is shown as possibly out of date. */
  down_systems: z.array(SystemId),
});
export type QueueItem = z.infer<typeof QueueItem>;

export const EnrollmentTarget = z.object({
  target: z.number().int().positive(),
  confirmed_paid: z.number().int().nonnegative(),
  days_left: z.number().int().positive(),
  assumed_rate: z.number().gt(0).lte(1),
  remaining: z.number().int().nonnegative(),
  daily_required: z.number().int().nonnegative(),
  prospects_needed: z.number().int().nonnegative(),
  source: SystemId,
  pulled_at: IsoTime.nullable(),
});
export type EnrollmentTarget = z.infer<typeof EnrollmentTarget>;

export const TodayPayload = z.object({
  /** True while Today runs on the invented sample (Release 1). The screen labels it on every view. */
  sample: z.boolean(),
  generated_at: IsoTime,
  briefing: z.object({ headline: z.string().min(1), start_with: z.string().nullable(), detail: z.string().min(1) }),
  target: EnrollmentTarget,
  sections: z.array(z.object({ id: SectionId, label: z.string().min(1), count: z.number().int().nonnegative(), systems: z.array(SystemId) })),
  queue: z.array(QueueItem),
  may_do: z.array(z.object({ level: z.number().int().min(1).max(5), name: z.string().min(1), rule: z.string().min(1) })).length(5),
  systems: z.array(SystemState).length(8),
});
export type TodayPayload = z.infer<typeof TodayPayload>;
