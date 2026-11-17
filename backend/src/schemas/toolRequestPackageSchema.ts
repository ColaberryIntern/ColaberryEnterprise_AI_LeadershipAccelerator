import { z } from 'zod';
import { PACKAGE_RECOMMENDATIONS } from '../db/ensureToolRequestPackageSchema';

/**
 * AF11.8 inbound schema for the ten-block decision package.
 *
 * ## This schema checks SHAPE. It deliberately checks nothing about completeness
 *
 * Every field is optional, including the ten the contract requires. That is the same decision
 * `agentToolRequestSchema.ts` records and it matters more here: **presence is decided in exactly
 * one place**, `services/agentDomain/toolRequestPackageContract.ts`, which returns a named rule
 * AND the block it belongs to.
 *
 * A `.min(1)` here would be a second definition of "complete" drifting away from the one the
 * bounce is computed from, and the console would then tell an agent two different stories about
 * what is outstanding.
 *
 * There is a sharper reason than consistency, though. An incomplete package is **saved**, not
 * rejected: the bounce exists so an agent can keep its work and be told what is left. A required
 * field in this schema would turn that into a 400 and make a half-written package unsavable,
 * which would force every agent to compose all ten blocks in one shot.
 *
 * What this file IS load-bearing for:
 *
 *   - `.strict()`, so `{ reccomendation: 'A' }` is a 400 rather than a silently dropped field.
 *     On a ten-block form that matters more, not less: a dropped simulation block would leave the
 *     approver reading a blank where the evidence was typed.
 *   - types, so `options: 'A and B'` cannot reach a gate that expects a list and read as one
 *     entry.
 *   - lengths, so nothing unbounded is persisted.
 */

export const BLOCK_TEXT_MAX = 2000;
export const BLOCK_LINE_MAX = 500;
export const BLOCK_LIST_MAX_ITEMS = 20;
/** Three options at most, so the bound here agrees with `chk_adtrp_two_real_options`. */
export const MAX_OPTIONS = 3;
export const MAX_FINDINGS = 20;

const line = (label: string) => z.string().trim().max(
  BLOCK_LINE_MAX,
  `Each ${label} entry can be at most ${BLOCK_LINE_MAX} characters.`,
);

const listOf = (label: string, max = BLOCK_LIST_MAX_ITEMS) => z.array(line(label))
  .max(max, `A package can list at most ${max} ${label} entries.`)
  .optional();

const text = (label: string) => z.string().trim()
  .max(BLOCK_TEXT_MAX, `${label} can be at most ${BLOCK_TEXT_MAX} characters.`)
  .optional();

/**
 * One option. `key` is a loose string rather than an enum on purpose: the contract refuses a key
 * that is out of order and names the block, where a Zod enum would answer `invalid_enum_value`
 * and lose which of the ten blocks the agent should go and fix.
 */
const OptionSchema = z.object({
  key: z.string().trim().max(4).optional(),
  summary: line('option summary').optional(),
  what_happens: line('option outcome').optional(),
  verb: z.string().trim().max(60).optional(),
}).strict();

/** One measured finding and where the number came from. */
const FindingSchema = z.object({
  finding: line('finding').optional(),
  source: line('source').optional(),
}).strict();

export const ToolRequestPackagePayloadSchema = z.object({
  // 1, 2
  executive_summary: text('An executive summary'),
  problem: text('The problem'),
  // 3
  key_findings: z.array(FindingSchema)
    .max(MAX_FINDINGS, `At most ${MAX_FINDINGS} findings.`)
    .optional(),
  // 4 and 10 — one list, see the schema module's header
  options: z.array(OptionSchema)
    .max(MAX_OPTIONS, `At most ${MAX_OPTIONS} options, A to C.`)
    .optional(),
  // 5
  recommendation: z.enum(PACKAGE_RECOMMENDATIONS, {
    message: `A recommendation has to be one of: ${PACKAGE_RECOMMENDATIONS.join(', ')}.`,
  }).optional(),
  recommendation_reason: text('A recommendation reason'),
  // 6
  impact: text('The impact'),
  // 7 — both halves
  risk_can_break: listOf('risk'),
  risk_cannot_break: listOf('boundary'),
  // 8
  simulated_action: text('The simulated action'),
  simulated_against: text('What it was simulated against'),
  // A STRING, not `z.coerce.date()`. The contract decides whether it is a real time and whether
  // it is in the future, and it names the block when it is not; a coercion here would turn an
  // unparseable date into a Zod error that says nothing about the simulation block.
  simulated_at: z.string().trim().max(40).optional(),
  // 9
  steps_that_follow: listOf('step'),
}).strict();

export type ToolRequestPackagePayloadInput = z.infer<typeof ToolRequestPackagePayloadSchema>;
