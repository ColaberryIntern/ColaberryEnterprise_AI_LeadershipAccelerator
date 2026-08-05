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

export const createInvoiceRequestSchema = createInvoiceSchema;
export type CreateInvoiceRequestInput = CreateInvoiceInput;

// POST /api/create-free-account — the public /enroll page's free-signup path.
// No cohort_id: free accounts are auto-placed in the Explorer cohort
// (createExplorerEnrollment), and company is optional since a personal free
// trial shouldn't require B2B lead-qual fields to complete.
export const createFreeAccountSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255),
  email: z.string().email('Invalid email address').max(255),
  company: z.string().max(255).optional().default(''),
  title: z.string().max(255).optional().default(''),
  phone: z.string().max(50).optional().default(''),
  company_size: z.string().max(50).optional().default(''),
});

export type CreateFreeAccountInput = z.infer<typeof createFreeAccountSchema>;
