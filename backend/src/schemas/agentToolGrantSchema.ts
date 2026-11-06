import { z } from 'zod';

/**
 * AF3.5 — the inbound body for a tool grant.
 *
 * ## `.strict()` is load-bearing here, more than anywhere else in this ladder
 *
 * The one thing a grant must never do is move an autonomy level. A permissive object would
 * silently DROP an `autonomy_level` or `enabled` key and answer 200, and a caller reading that
 * 200 would reasonably conclude the field had been accepted. `.strict()` turns the same body
 * into a visible 400 naming the key it refused, so the boundary is something the caller is told
 * about rather than something they have to infer.
 *
 * The same reasoning, and the same wording, as `toolRequestDecisionSchema`. Kept consistent on
 * purpose: two gates in one ladder that disagree about how they refuse are two gates somebody
 * has to learn separately.
 */

/** Long enough for a real capability id, short enough that a paste cannot become a payload. */
export const CAPABILITY_ID_MAX = 200;
export const TOOL_NAME_MAX = 120;

export const GrantToolSchema = z
  .object({
    agent_id: z.string().uuid('agent_id must be an agent id.'),
    tool_name: z
      .string()
      .trim()
      .min(1, 'Name the tool being granted.')
      .max(TOOL_NAME_MAX, `A tool name is at most ${TOOL_NAME_MAX} characters.`),
    capability_id: z
      .string()
      .trim()
      .min(1, 'Name the capability this tool is granted for.')
      .max(CAPABILITY_ID_MAX, `A capability id is at most ${CAPABILITY_ID_MAX} characters.`),
    // Optional, and never the approver. The service refuses a grant whose approver and proposer
    // are the same person, so sending this can only ever narrow what is permitted.
    proposed_by: z
      .string()
      .trim()
      .max(320, 'An email address is at most 320 characters.')
      .optional(),
  })
  .strict();

export type GrantToolBody = z.infer<typeof GrantToolSchema>;
