import { z } from 'zod';

export const updateLeadSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'enrolled', 'lost']).optional(),
  interest_level: z.string().max(50).optional(),
  notes: z.string().max(10000).optional(),
  assigned_admin: z.string().uuid().nullable().optional(),
});

export const leadFilterSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'enrolled', 'lost']).optional(),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['created_at', 'updated_at', 'name', 'email', 'status']).optional(),
  order: z.enum(['ASC', 'DESC']).optional(),
});
