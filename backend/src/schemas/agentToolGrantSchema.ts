import { z } from 'zod';
import { TOOL_ENVIRONMENTS } from '../db/ensureAgentDomainToolRequestSchema';

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
/** A dataset name is a Postgres identifier. 63 is the engine's own ceiling. */
export const DATASET_NAME_MAX = 63;
/**
 * How many datasets one grant may cover.
 *
 * Bounded because the array is persisted as jsonb and read on every grant listing, and because a
 * grant covering 400 tables is not a scope — it is the absence of one wearing the shape of a
 * list. The catalog held 633 datasets on 15 Nov 2026, so this is a deliberate fraction of it.
 */
export const GRANT_DATASETS_MAX = 50;

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
    // Phase 2b — WHERE. REQUIRED, and deliberately not defaulted.
    //
    // This route has no frontend, so requiring a new field breaks no screen; it breaks an API
    // caller, visibly, with a sentence naming the two values. A default would have been the
    // quieter change and the wrong one: `'sandbox'` reads as the safe guess while silently
    // recording that a production grant is not a production grant.
    environment: z.enum(TOOL_ENVIRONMENTS, {
      message: `Where this grant applies has to be one of: ${TOOL_ENVIRONMENTS.join(', ')}.`,
    }),
    // Phase 2b — WHAT DATA. Optional, because a tool that sends email reads no table and an
    // empty scope is the honest record for it. SHAPE only: whether these names are real
    // datasets, and whether they stay inside what the request asked for, is the contract's
    // judgement and is decided in exactly one place.
    datasets: z
      .array(
        z.string().trim()
          .min(1, 'A dataset name cannot be blank.')
          .max(DATASET_NAME_MAX, `A dataset name is at most ${DATASET_NAME_MAX} characters.`),
      )
      .max(GRANT_DATASETS_MAX, `A grant covers at most ${GRANT_DATASETS_MAX} datasets.`)
      .optional(),
  })
  .strict();

export type GrantToolBody = z.infer<typeof GrantToolSchema>;
