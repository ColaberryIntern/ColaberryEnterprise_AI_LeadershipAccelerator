import { z } from 'zod';

/**
 * Career Prep v27: the outbound shapes, validated at the route boundary (fail loud in development
 * and test, log and continue in production; see campusRoutes.sendValidated). Every number is
 * optional because a value without data is omitted, never zero-filled. `.strict()` so a field
 * added by mistake (a fee, another student's id) fails the contract instead of shipping.
 */
const score = z.number().min(0).max(100);

export const InterviewViewSchema = z.object({
  id: z.string(), source: z.enum(['real', 'added', 'practice']), company: z.string(), role: z.string(),
  type: z.enum(['recruiter', 'hiring_manager', 'technical', 'behavioral']),
  startsAt: z.string().optional(), readiness: score.optional(), target: score,
}).strict();

export const DashboardResponse = z.object({
  anchorId: z.string().optional(),
  readiness: z.object({
    value: score, target: score.optional(), changeSinceFirst: z.number().optional(),
    trend: z.array(z.object({ week: z.string(), value: score }).strict()),
  }).strict().optional(),
  interviews: z.array(InterviewViewSchema),
  skills: z.array(z.object({
    key: z.string(), label: z.string(), score: score.optional(), change30: z.number().optional(),
    count: z.number().int().min(0), sources: z.array(z.string()),
  }).strict()),
  sources: z.object({ video: z.number().int(), phone_mock: z.number().int(), real_interview: z.number().int(), training: z.number().int(), project: z.number().int() }).strict(),
  weeklyMinutes: z.array(z.object({ week: z.string(), minutes: z.number().int().min(0) }).strict()),
  streak: z.number().int().min(0),
  thisWeek: z.number().int().min(0),
}).strict();

export const SummaryResponse = z.object({
  firstName: z.string().optional(),
  nextInterview: InterviewViewSchema.optional(),
  stops: z.object({ readiness: score.optional(), readyAt: score.optional(), streak: z.number().int().optional(), thisWeek: z.number().int().optional() }).strict(),
  interviews: z.array(InterviewViewSchema),
  today: z.string(),
}).strict();

export const StaffPrepResponse = z.object({ enrollmentId: z.string(), dashboard: DashboardResponse }).strict();

export const StaffStudentListResponse = z.object({
  students: z.array(z.object({
    enrollmentId: z.string(), name: z.string(), lastObserved: z.string(), observations: z.number().int().min(0), readiness: score.optional(),
  }).strict()).max(500),
}).strict();
