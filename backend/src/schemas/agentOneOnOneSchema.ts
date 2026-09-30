import { z } from 'zod';

// Runtime validation for AgentOneOnOne writes (AI Workforce Management,
// Checkpoint D).

export const createOneOnOneInputSchema = z.object({
  agenda: z.string().trim().min(1).max(2000),
});
export type CreateOneOnOneInput = z.infer<typeof createOneOnOneInputSchema>;

export const completeOneOnOneInputSchema = z.object({
  outcomeNotes: z.string().trim().min(1).max(4000),
});
export type CompleteOneOnOneInput = z.infer<typeof completeOneOnOneInputSchema>;
