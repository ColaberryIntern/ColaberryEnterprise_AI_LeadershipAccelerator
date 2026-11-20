import { z } from 'zod';

/**
 * Communications Hub response contracts (CH1.3). One schema per payload; routes send through
 * sendValidated so a drift between service and contract fails loudly outside production.
 */

/** The Today tiles and the hub's header state. Every count is a real count of hub rows; an empty hub is all zeros. */
export const CommsHubSummary = z.object({
  awaiting_approval: z.number().int().nonnegative(),
  scheduled_next_7_days: z.number().int().nonnegative(),
  upcoming_events: z.number().int().nonnegative(),
  events_missing_thumbnail: z.number().int().nonnegative(),
  needs_attention: z.number().int().nonnegative(),
  sending_paused: z.boolean(),
}).strict();
export type CommsHubSummary = z.infer<typeof CommsHubSummary>;
