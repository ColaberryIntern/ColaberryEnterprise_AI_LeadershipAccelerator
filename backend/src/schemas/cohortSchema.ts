import { z } from 'zod';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

// Multi-day, per-day-time schedule input — replaces the old single
// core_day/optional_lab_day pair on the create/edit form. A cohort meets on every
// listed day, each at its own time (e.g. Tuesday 6:00 PM AND Saturday 10:00 AM).
// `core_day`/`core_time`/`optional_lab_day` are still accepted directly (other
// callers, e.g. SessionControlTab.tsx, still send them) and are still derived from
// schedule_days server-side when schedule_days is present, so every consumer that
// only knows the flat legacy fields keeps working. See cohortService.ts's
// `deriveScheduleFromDays`.
export const scheduleDaySchema = z.object({
  day: z.enum(DAYS_OF_WEEK),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Must be 24h HH:MM format'),
});
export type ScheduleDayInput = z.infer<typeof scheduleDaySchema>;

export const updateCohortSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  core_day: z.enum(DAYS_OF_WEEK).optional(),
  core_time: z.string().min(1).max(50).optional(),
  optional_lab_day: z.string().max(50).optional(),
  schedule_days: z.array(scheduleDaySchema).min(1).optional(),
  timezone: z.string().min(1).max(50).optional(),
  max_seats: z.number().int().positive().optional(),
  status: z.enum(['open', 'closed', 'completed']).optional(),
  settings_json: z.record(z.string(), z.any()).optional(),
});

export type UpdateCohortInput = z.infer<typeof updateCohortSchema>;

export const createCohortSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
    core_day: z.enum(DAYS_OF_WEEK).optional(),
    core_time: z.string().min(1).max(50).optional(),
    optional_lab_day: z.string().max(50).optional(),
    schedule_days: z.array(scheduleDaySchema).min(1).optional(),
    timezone: z.string().min(1).max(50).optional(),
    max_seats: z.number().int().positive().optional(),
    status: z.enum(['open', 'closed', 'completed']).optional(),
    cohort_type: z.string().min(1).max(50).optional(),
    curriculum_version: z.string().max(20).optional(),
    program_id: z.string().uuid().optional(),
    settings_json: z.record(z.string(), z.any()).optional(),
  })
  // core_day is a NOT NULL DB column — a new cohort needs it from one of the two
  // schedule inputs (schedule_days is derived server-side into core_day/core_time).
  .refine((data) => !!data.core_day || !!data.schedule_days?.length, {
    message: 'Either core_day or schedule_days is required',
    path: ['schedule_days'],
  });

export type CreateCohortInput = z.infer<typeof createCohortSchema>;
