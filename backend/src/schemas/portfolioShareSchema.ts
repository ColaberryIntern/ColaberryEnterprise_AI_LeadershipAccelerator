import { z } from 'zod';

export const SetPortfolioSharingSchema = z.object({
  enabled: z.boolean(),
});
