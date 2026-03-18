import { z } from 'zod';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const updateCohortSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  core_day: z.enum(DAYS_OF_WEEK).optional(),
  core_time: z.string().min(1).max(50).optional(),
  optional_lab_day: z.string().max(50).nullable().optional(),
  timezone: z.string().min(1).max(50).optional(),
  max_seats: z.number().int().positive().optional(),
  status: z.enum(['open', 'closed', 'completed']).optional(),
});

export type UpdateCohortInput = z.infer<typeof updateCohortSchema>;
