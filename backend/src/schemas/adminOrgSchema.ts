import { z } from 'zod';
import { ORGANIZATION_STATUSES } from '../models/Organization';

/**
 * Runtime contracts for the admin business-account routes.
 *
 * Every inbound value crosses a trust boundary, so it is validated here rather
 * than trusted at the controller — the repo rule is that malformed input is
 * rejected with a 400 and never reaches business logic. Note Zod v4 in this repo:
 * validation failures expose `err.issues`, not `err.errors`.
 */

const statusEnum = z.enum(ORGANIZATION_STATUSES as unknown as [string, ...string[]]);

export const orgListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
  status: statusEnum.optional(),
});

export const orgStatusSchema = z.object({
  status: statusEnum,
});

export const orgAddCohortSchema = z.object({
  cohort_id: z.string().uuid(),
  // Null and "not supplied" both mean "not specified"; zero is a real answer and
  // is allowed, because a company can be linked to a cohort it sponsors no seats in.
  seats_sponsored: z.coerce.number().int().min(0).max(100000).nullable().optional(),
});

export type OrgListQuery = z.infer<typeof orgListQuerySchema>;
export type OrgStatusBody = z.infer<typeof orgStatusSchema>;
export type OrgAddCohortBody = z.infer<typeof orgAddCohortSchema>;
// C8.5 - linking a canonical artifact to an account. LINKS ONLY: there is
// deliberately no field here that could carry a document, because copying an
// artifact into the app is the failure mode the ticket names.
export const orgLinkArtifactSchema = z.object({
  artifact_kind: z.enum([
    'deck', 'research', 'account_brief', 'proposal',
    'contract', 'pilot_outcome', 'case_study',
  ]),
  title: z.string().trim().min(1).max(300),
  // The pointer to the one canonical copy. Validated as a URL here and checked
  // against the C0.3 naming rule in the service.
  canonical_url: z.string().trim().url().max(2048),
  source_type: z.enum(['basecamp_vault', 'repo', 'external']).optional(),
  source_id: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type OrgLinkArtifactBody = z.infer<typeof orgLinkArtifactSchema>;

