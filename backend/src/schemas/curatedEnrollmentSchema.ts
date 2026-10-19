import { z } from 'zod';

/**
 * Runtime validation for curated enrollment (C6.6).
 *
 * WHY `emailStatus` IS REQUIRED AND IS A CLOSED ENUM. There is no verified-email column on
 * `leads` and nothing in this repo records one. The only verification signal that exists is
 * Apollo's request-side `contact_email_status`, and `importApolloResults` drops it rather
 * than persisting it. So a curated list has to CARRY its own provenance, and the service
 * refuses anything that is not explicitly `verified`.
 *
 * Making it an enum rather than a free string is the point: "trust me, it's verified" is
 * exactly the input this ticket exists to reject. The caller has to name which of Apollo's
 * four states the contact is in, and three of the four are refusals.
 */
export const CONTACT_EMAIL_STATUSES = [
  'verified',
  'likely_to_engage',
  'unverified',
  'unavailable',
] as const;

/** The only status that may be enrolled. Everything else is rejected with a reason. */
export const ENROLLABLE_EMAIL_STATUS = 'verified';

export const curatedContactSchema = z.object({
  email: z.string().trim().min(3).max(320).email(),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullish(),
  title: z.string().trim().max(200).nullish(),
  emailStatus: z.enum(CONTACT_EMAIL_STATUSES),
  /** Where the verification came from, e.g. "apollo". Recorded in the audit trail. */
  verificationSource: z.string().trim().min(1).max(60),
  /** When it was verified. Stale verification is still the approver's call, but it is recorded. */
  verifiedAt: z.string().datetime(),
});
export type CuratedContact = z.infer<typeof curatedContactSchema>;

/**
 * The approval that must accompany any write.
 *
 * `planHash` binds the approval to one exact list. Without it, an approval of a reviewed list
 * could be replayed against a different one, which is the same class of mistake as approving
 * a PR and merging a different branch.
 */
export const curatedApprovalSchema = z.object({
  approvedBy: z.string().trim().min(1).max(100),
  approvedAt: z.string().datetime(),
  planHash: z.string().trim().length(64),
});
export type CuratedApproval = z.infer<typeof curatedApprovalSchema>;

/**
 * What the HTTP body may carry. `approvedBy` is absent on purpose: the server fills it from
 * the authenticated admin session. A body that can name its own approver is not an approval,
 * and leaving the field in the schema would invite a caller to set it and be quietly ignored.
 */
export const curatedApprovalInputSchema = curatedApprovalSchema.omit({ approvedBy: true });
export type CuratedApprovalInput = z.infer<typeof curatedApprovalInputSchema>;

/**
 * The request body. `dry_run` defaults to TRUE: the safe mode is the one you get by
 * forgetting to pass anything.
 */
export const curatedEnrollmentRequestSchema = z.object({
  contacts: z.array(curatedContactSchema).min(1).max(500),
  dry_run: z.boolean().default(true),
  approval: curatedApprovalInputSchema.optional(),
}).strict();
export type CuratedEnrollmentRequest = z.infer<typeof curatedEnrollmentRequestSchema>;
