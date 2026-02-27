import { z } from 'zod';

export const bookCallSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  company: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  slot_start: z.string().min(1, 'Time slot is required'),
  timezone: z.string().min(1, 'Timezone is required'),
});

export type BookCallInput = z.infer<typeof bookCallSchema>;
