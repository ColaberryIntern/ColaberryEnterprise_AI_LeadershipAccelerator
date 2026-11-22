import { z } from 'zod';

/**
 * Career Prep v27, CP6.2 (kit F3): the body of one event the inbox manager pushes to POST /api/integrations/inbox/events.
 * The contract both sides share. Unknown keys are dropped (not refused), so the sender can add fields without breaking
 * us; every field we use is bounded. `confirmation_code` / `confirmation_link` carry Gmail's forwarding confirmation.
 */
const text = (n: number) => z.string().max(n).nullable().optional();
export const INBOX_EVENT_TYPES = ['email.classified', 'interview.detected', 'interview.updated', 'forwarding.confirmation'] as const;
export const InboxEventSchema = z.object({
  event_id: z.string().trim().min(1).max(128),
  message_id: z.string().trim().min(1).max(255),
  type: z.enum(INBOX_EVENT_TYPES),
  to_address: z.string().trim().min(3).max(254),
  received_at: z.string().datetime({ offset: true }),
  category: text(40),
  sub_type: text(60),
  confidence: z.number().min(0).max(1).nullable().optional(),
  company: text(200),
  position: text(200),
  contact: z.object({ name: text(160), email: text(254) }).nullable().optional(),
  proposed_times: z.array(z.string().max(64)).max(20).optional(),
  meeting_link: text(2048),
  subject: text(998),
  snippet: text(280),
  approved_by: text(160),
  needs_review: z.boolean().optional(),
  confirmation_code: text(32),
  confirmation_link: text(2048),
});
export type InboxEvent = z.infer<typeof InboxEventSchema>;
