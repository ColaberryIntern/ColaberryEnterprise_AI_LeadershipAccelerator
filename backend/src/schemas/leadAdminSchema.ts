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
  source: z.string().max(100).optional(),
  // Website/origin filter: comma-separated leadSourceGroups keys. Kept apart
  // from `source` above, which filters form_type despite its name.
  website: z.string().max(300).optional(),
  temperature: z.enum(['cold', 'cool', 'warm', 'hot', 'qualified']).optional(),
  scoreMin: z.coerce.number().int().min(0).optional(),
  scoreMax: z.coerce.number().int().max(200).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  sort: z.enum(['created_at', 'updated_at', 'name', 'email', 'status', 'lead_score', 'priority']).optional(),
  order: z.enum(['ASC', 'DESC']).optional(),
});

/**
 * Body for POST /api/admin/leads/apollo-import.
 *
 * `commit` defaults to false so a mis-fired request reports rather than writes.
 * `limit` is additionally clamped to MAX_CONTACTS_PER_RUN in the service, so a
 * crafted request cannot turn one call into an unbounded walk of the account.
 */
export const apolloImportSchema = z.object({
  labelIds: z.array(z.string().max(64)).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  startPage: z.coerce.number().int().min(1).max(1000).optional(),
  commit: z.coerce.boolean().optional(),
});

export type ApolloImportInput = z.infer<typeof apolloImportSchema>;
