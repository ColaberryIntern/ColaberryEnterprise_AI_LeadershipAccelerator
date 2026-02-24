import { z } from 'zod';

export const updateCohortSchema = z.object({
  status: z.enum(['open', 'closed', 'completed']).optional(),
  max_seats: z.number().int().positive().optional(),
  name: z.string().min(1).max(255).optional(),
});

export type UpdateCohortInput = z.infer<typeof updateCohortSchema>;
