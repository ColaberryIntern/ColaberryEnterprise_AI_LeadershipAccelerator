import { z } from 'zod';

// Runtime validation for ManagerDirective writes (AI Workforce Management,
// Checkpoint C). A standing instruction from a manager to an agent.

export const managerDirectiveInputSchema = z.object({
  directiveText: z.string().trim().min(1).max(2000),
});

export type ManagerDirectiveInput = z.infer<typeof managerDirectiveInputSchema>;
