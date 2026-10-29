import { z } from 'zod';

/**
 * AF10.6 — the name an intern gives their own agent.
 *
 * The seven builders already chose names (Ellis, Maru, Vic, Maya, Pip, Dara, Ava) and until this
 * ticket none of them was stored anywhere in the product. They live in
 * `ai_agents.config.display_name`, a JSONB key, rather than a new column: `agent_name` is the
 * key `agentRegistrySeed.ts` findOrCreates on at every boot, so renaming it orphans the row and
 * recreates the original as a second agent on the next deploy.
 *
 * ## `.strict()` is deliberate
 *
 * One field, so a typo'd key is the only realistic mistake a caller can make, and a silently
 * ignored instruction is worse than a 400. `agentNudgeRoutes.ts` makes the same call for the same
 * reason.
 *
 * ## The length ceiling is a rendering constraint, not a database one
 *
 * JSONB would take any length. 60 characters is what fits the My Domain definition list and the
 * org chart beside it without wrapping, and a name nobody can read is not a name.
 */

/** 60 is the ceiling. Exported so the test and the frontend control agree on one number. */
export const AGENT_DISPLAY_NAME_MAX = 60;

/**
 * At least one letter. Without this, `"***"` and `"42"` are both legal agent identities, and the
 * uniqueness check downstream would then be reserving punctuation. Letters only as the
 * REQUIREMENT, not as the whole alphabet: the name itself may hold digits, spaces, hyphens and
 * apostrophes, because real names do.
 */
const HAS_A_LETTER = /\p{L}/u;

export const AgentDisplayNameSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, 'A name is required.')
    .max(AGENT_DISPLAY_NAME_MAX, `A name can be at most ${AGENT_DISPLAY_NAME_MAX} characters.`)
    .refine((v) => HAS_A_LETTER.test(v), 'A name needs at least one letter.'),
}).strict();

export type AgentDisplayNameInput = z.infer<typeof AgentDisplayNameSchema>;
