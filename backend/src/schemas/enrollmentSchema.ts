import { z } from 'zod';

export const createInvoiceSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255),
  email: z.string().email('Invalid email address').max(255),
  company: z.string().min(1, 'Company is required').max(255),
  title: z.string().max(255).optional().default(''),
  phone: z.string().max(50).optional().default(''),
  company_size: z.string().max(50).optional().default(''),
  cohort_id: z.string().uuid('Invalid cohort ID'),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
