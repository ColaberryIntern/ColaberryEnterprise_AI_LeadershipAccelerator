import { z } from 'zod';

const priorityEnum = z.enum(['High', 'Medium', 'Low']);
const automationEnum = z.enum(['High', 'Medium', 'Low']);

// Query params always arrive as strings ("true"/"false"), never real booleans.
// Plain z.boolean() rejects them; z.coerce.boolean() is worse (Boolean('false') === true).
const queryBoolean = (defaultValue: boolean) =>
  z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean()).optional().default(defaultValue);

export const CreateEntrySchema = z.object({
  course_id: z.string().uuid().nullable().optional(),
  main_category: z.string().min(1).max(100),
  sub_category: z.string().max(100).optional(),
  question_pattern: z.string().min(1),
  answer_template: z.string().min(1),
  primary_person_id: z.string().uuid().nullable().optional(),
  team_person_ids: z.array(z.string().uuid()).optional().default([]),
  escalation_logic: z.string().optional(),
  priority: priorityEnum.optional().default('Medium'),
  response_time: z.string().max(50).optional(),
  automation_potential: automationEnum.optional().default('Medium'),
  emotional_tone: z.string().max(100).optional(),
  calendar_link: z.string().url().optional().or(z.literal('')),
  email_examples: z.string().optional(),
  keywords: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean().optional().default(true),
});

export const UpdateEntrySchema = CreateEntrySchema.partial();

export const CreatePersonSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  work_hours: z.string().max(100).optional(),
  time_zone: z.string().max(50).optional(),
  calendar_link: z.string().url().optional().or(z.literal('')),
  areas: z.array(z.string()).optional().default([]),
  shift_note: z.string().max(200).optional(),
});

export const UpdatePersonSchema = CreatePersonSchema.partial();

export const CreateCohortSchema = z.object({
  course_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  cohort_number: z.number().int().positive(),
  open_house_date: z.string().max(100).optional(),
  open_house_url: z.string().max(500).optional(),
  start_date: z.string().max(100).optional(),
  end_date: z.string().max(100).optional(),
  expo_date: z.string().max(100).optional(),
  price_annual: z.number().int().positive().optional(),
  price_monthly: z.number().int().positive().optional(),
  seats_total: z.number().int().positive().optional(),
  seats_remaining: z.number().int().min(0).optional(),
  enrollment_url: z.string().max(500).optional(),
  waitlist_url: z.string().max(500).optional(),
  is_active: z.boolean().optional().default(false),
});

export const UpdateCohortSchema = CreateCohortSchema.partial();

export const PreviewSchema = z.object({
  entry_id: z.string().uuid(),
  cohort_id: z.string().uuid().optional(),
});

export const ExportSchema = z.object({
  course_id: z.string().uuid().optional(),
  include_inactive: queryBoolean(false),
  force_include_unresolved: queryBoolean(false),
});

export type CreateEntryInput = z.infer<typeof CreateEntrySchema>;
export type UpdateEntryInput = z.infer<typeof UpdateEntrySchema>;
export type CreatePersonInput = z.infer<typeof CreatePersonSchema>;
export type UpdatePersonInput = z.infer<typeof UpdatePersonSchema>;
export type CreateCohortInput = z.infer<typeof CreateCohortSchema>;
export type UpdateCohortInput = z.infer<typeof UpdateCohortSchema>;
