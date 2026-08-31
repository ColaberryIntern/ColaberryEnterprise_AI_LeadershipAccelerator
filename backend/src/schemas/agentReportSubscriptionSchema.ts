import { z } from 'zod';

// Runtime validation for AgentReportSubscription writes (AI Workforce
// Management, Checkpoint D). content_scope and channel are closed enums,
// not free text — see AgentReportSubscription.ts's own header comment for
// why (every value here is one the report generator already knows how to
// render, and channel is constrained to what's actually wired today).

export const AGENT_REPORT_CONTENT_SECTIONS = ['cost', 'activity', 'trust', 'tickets'] as const;
export const AGENT_REPORT_CADENCES = ['daily', 'weekly'] as const;
export const AGENT_REPORT_CHANNELS = ['email'] as const;

export const createReportSubscriptionInputSchema = z.object({
  contentScope: z.array(z.enum(AGENT_REPORT_CONTENT_SECTIONS)).min(1),
  cadence: z.enum(AGENT_REPORT_CADENCES),
  deliveryHourLocal: z.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(60).optional(),
  channel: z.enum(AGENT_REPORT_CHANNELS).optional(),
});
export type CreateReportSubscriptionInput = z.infer<typeof createReportSubscriptionInputSchema>;

export const updateReportSubscriptionInputSchema = z.object({
  contentScope: z.array(z.enum(AGENT_REPORT_CONTENT_SECTIONS)).min(1).optional(),
  cadence: z.enum(AGENT_REPORT_CADENCES).optional(),
  deliveryHourLocal: z.number().int().min(0).max(23).optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateReportSubscriptionInput = z.infer<typeof updateReportSubscriptionInputSchema>;
