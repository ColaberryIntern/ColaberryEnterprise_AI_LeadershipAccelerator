import { z } from 'zod';
import { TOOL_RUN_FREQUENCIES } from '../db/ensureAgentDomainToolRequestSchema';

/**
 * AF11.1 inbound schema for the tool-request payload.
 *
 * ## This schema checks SHAPE. It deliberately checks nothing about completeness
 *
 * Every field is optional here, including the ones the contract requires. That looks wrong at first
 * read and it is the important decision in this file: **presence is decided in exactly one place**,
 * `services/agentDomain/toolRequestContract.ts`, which returns a named rule per missing field.
 *
 * Splitting the same rule across a Zod `.min(1)` and a contract check would mean two definitions of
 * "complete" drifting apart, and the one the tests assert would not be the one the API enforces.
 * AF11.2, AF11.3 and AF11.6 all call the contract rather than this schema, so the contract has to be
 * the authority or the console and the API would disagree about whether a request is fileable.
 *
 * What this file is still load-bearing for:
 *
 *   - `.strict()`, so `{ purpse: '...' }` is a 400 rather than a silently dropped field. That is
 *     the house rule `agentChangeRequestSchema.ts` records: *"a silently ignored instruction is
 *     worse than a 400."* On a six-group form it matters more, not less — a dropped
 *     blast-radius field would leave the approver reading a blank where the answer was typed.
 *   - types, so `writes: 'yes'` cannot reach a boolean check that would read it as true.
 *   - lengths, so nothing unbounded is persisted.
 *
 * The limits are exported so this schema, its tests and any form share ONE number.
 */

export const TOOL_NAME_MAX = 120;
export const TOOL_PURPOSE_MAX = 1000;
export const TOOL_NARRATIVE_MAX = 1000;
export const TOOL_SIDE_EFFECTS_MAX = 2000;
export const TOOL_LIST_ITEM_MAX = 300;
export const TOOL_LIST_MAX_ITEMS = 50;

/**
 * One entry of a `reads` / `produces` / `touches` / `inputs` list.
 *
 * Trimmed, because a list of three blanks is not three answers — the contract drops empties and
 * then judges what is left, so `touches: ['', '', '']` refuses as `touches_missing` rather than
 * passing with a count of three.
 */
const listOf = (label: string) => z.array(
  z.string().trim().max(
    TOOL_LIST_ITEM_MAX,
    `Each ${label} entry can be at most ${TOOL_LIST_ITEM_MAX} characters.`,
  ),
).max(
  TOOL_LIST_MAX_ITEMS,
  `A tool request can list at most ${TOOL_LIST_MAX_ITEMS} ${label} entries.`,
).optional();

export const ToolRequestPayloadSchema = z.object({
  // WHO. No `domain_key`: it is already on the parent request, ownership-checked, and a second
  // copy from the wire could disagree with it.
  agent_id: z.string().uuid('The agent has to be identified by its id.').optional(),
  // WHAT — `tool_name`, `reads` and `produces` are the catalog's own field names
  tool_name: z.string().trim()
    .max(TOOL_NAME_MAX, `A tool name can be at most ${TOOL_NAME_MAX} characters.`)
    .optional(),
  purpose: z.string().trim()
    .max(TOOL_PURPOSE_MAX, `A purpose can be at most ${TOOL_PURPOSE_MAX} characters.`)
    .optional(),
  reads: listOf('reads'),
  produces: listOf('produces'),
  // WHAT FOR
  capability_id: z.string().trim().max(200).optional(),
  task_unblocked: z.string().trim()
    .max(TOOL_NARRATIVE_MAX, `That can be at most ${TOOL_NARRATIVE_MAX} characters.`)
    .optional(),
  manual_today: z.string().trim()
    .max(TOOL_NARRATIVE_MAX, `That can be at most ${TOOL_NARRATIVE_MAX} characters.`)
    .optional(),
  // WHEN
  needed_by: z.string().trim().max(10, 'A needed-by date looks like 2026-11-30.').optional(),
  run_frequency: z.enum(TOOL_RUN_FREQUENCIES, {
    message: `How often it runs has to be one of: ${TOOL_RUN_FREQUENCIES.join(', ')}.`,
  }).optional(),
  // WHERE
  touches: listOf('touches'),
  // HOW
  inputs: listOf('inputs'),
  writes: z.boolean({
    message: 'Whether this tool writes has to be true or false, not a word.',
  }).optional(),
  side_effects: z.string().trim()
    .max(TOOL_SIDE_EFFECTS_MAX, `That can be at most ${TOOL_SIDE_EFFECTS_MAX} characters.`)
    .optional(),
  reversible: z.boolean({
    message: 'Whether the change can be undone has to be true or false, not a word.',
  }).optional(),
  reversibility_note: z.string().trim()
    .max(TOOL_NARRATIVE_MAX, `That can be at most ${TOOL_NARRATIVE_MAX} characters.`)
    .optional(),
}).strict();

export type ToolRequestPayloadInput = z.infer<typeof ToolRequestPayloadSchema>;
