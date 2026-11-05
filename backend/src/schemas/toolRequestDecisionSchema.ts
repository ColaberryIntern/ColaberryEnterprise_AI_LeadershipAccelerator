import { z } from 'zod';
import {
  SEND_BACK_FIELDS,
  TOOL_REQUEST_VERBS,
} from '../services/agentDomain/toolRequestDecisionContract';

/**
 * AF11.3 inbound schema — what the review console may send when Ali settles a tool request.
 *
 * `.strict()`, following `agentChangeRequestSchema.ts` and the reasoning it records: a silently
 * ignored field is worse than a 400. That matters more here than anywhere, because the fields a
 * body might carry and this schema does NOT accept are `autonomy_level`, `tools_granted`,
 * `enabled` and `abac_mode_override`. A lenient schema would drop them quietly; a strict one
 * answers 400 and names them, so an attempt to lift an autonomy level through this door is a
 * visible refusal rather than a no-op somebody could mistake for success.
 *
 * ## The enums come from the contract, not from a copy
 *
 * `TOOL_REQUEST_VERBS` and `SEND_BACK_FIELDS` are imported rather than retyped. A fifth verb added
 * to the contract would otherwise be refused at the door by a schema nobody remembered to update,
 * and the failure would look like a frontend bug.
 *
 * ## It checks SHAPE, never standing
 *
 * Whether this person may decide this request is the contract's job and the service's, where the
 * roster, the approver set and the request's status are readable. This file knows only whether the
 * body is usable. A schema that tried to answer the first question would be a second gate with a
 * different idea of the rules.
 */

export const DECISION_REASON_MAX = 1000;

/** A reason of only punctuation teaches nobody anything. Same rule the title gate uses. */
const HAS_A_LETTER = /\p{L}/u;

export const DecideToolRequestSchema = z.object({
  verb: z.enum(TOOL_REQUEST_VERBS as unknown as [string, ...string[]], {
    message: `A decision is one of: ${TOOL_REQUEST_VERBS.join(', ')}.`,
  }),
  reason: z.string().trim()
    .max(DECISION_REASON_MAX, `A reason can be at most ${DECISION_REASON_MAX} characters.`)
    .optional(),
  missing_field: z.enum(SEND_BACK_FIELDS as unknown as [string, ...string[]], {
    message: 'A send-back has to name one of the fields the request actually has.',
  }).optional(),
  assigned_tool_name: z.string().trim()
    .max(200, 'A tool name can be at most 200 characters.')
    .optional(),
}).strict().superRefine((val, ctx) => {
  const reason = (val.reason ?? '').trim();

  // The three verb-specific requirements. The contract refuses these too, and deliberately: this
  // one gives the console a field-level message while the form is still open, and that one is what
  // holds when a caller skips the console entirely. Two gates, one rule, neither trusting the other.
  if (val.verb === 'deny' && !reason) {
    ctx.addIssue({
      code: 'custom',
      path: ['reason'],
      message: 'Denying a tool request requires a reason the person who filed it can read.',
    });
  }
  if (val.verb === 'deny' && reason && !HAS_A_LETTER.test(reason)) {
    ctx.addIssue({
      code: 'custom',
      path: ['reason'],
      message: 'A reason has to contain words.',
    });
  }
  if (val.verb === 'send_back' && !val.missing_field) {
    ctx.addIssue({
      code: 'custom',
      path: ['missing_field'],
      message: 'A send-back has to name the field that is missing or too vague, so the person '
        + 'filing knows what to go and fix.',
    });
  }
  if (val.verb === 'assign_existing_tool' && !(val.assigned_tool_name ?? '').trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['assigned_tool_name'],
      message: 'Assigning an existing tool has to name which one.',
    });
  }

  // And the converse, so a body cannot carry words that belong to a different decision. A
  // `missing_field` riding along on an approval would be stored by nothing and read by nobody,
  // which is how a field quietly stops meaning anything.
  if (val.verb !== 'send_back' && val.missing_field) {
    ctx.addIssue({
      code: 'custom',
      path: ['missing_field'],
      message: 'Only a send-back names a missing field.',
    });
  }
  if (val.verb !== 'assign_existing_tool' && val.assigned_tool_name) {
    ctx.addIssue({
      code: 'custom',
      path: ['assigned_tool_name'],
      message: 'Only assigning an existing tool names a tool.',
    });
  }
});

export type DecideToolRequestInput = z.infer<typeof DecideToolRequestSchema>;
