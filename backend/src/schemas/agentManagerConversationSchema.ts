import { z } from 'zod';

// Runtime validation for sending a manager message (AI Workforce Management,
// Checkpoint C — Direct Agent Communication).

export const sendManagerMessageInputSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export type SendManagerMessageInput = z.infer<typeof sendManagerMessageInputSchema>;
