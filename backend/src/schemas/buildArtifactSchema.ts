import { z } from 'zod';

export const UpdateBuildArtifactSchema = z.object({
  url: z.string().url().max(2048).nullable().optional(),
  status: z.enum(['not_started', 'in_progress', 'submitted', 'reviewed']).optional(),
});
