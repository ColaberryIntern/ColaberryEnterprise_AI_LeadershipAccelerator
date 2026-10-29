import { z } from 'zod';

/**
 * AF4.2 inbound schemas — what an intern may send, and what a decision may say.
 *
 * `.strict()` on both, following `agentDisplayNameSchema.ts` and the reasoning it records: a
 * silently ignored instruction is worse than a 400. If an intern sends `{title, descripton}` with
 * the typo, they should be told, not have the body quietly dropped and wonder later why their
 * request has no detail on it.
 *
 * Every message is a full sentence addressed to the person who will read it. These surface verbatim
 * in the portal — `agentDomainApi.ts`'s `errorMessage()` renders the server's own sentence and only
 * falls back when the request never got an answer, so a terse `"invalid"` here becomes a terse
 * `"invalid"` on their screen.
 *
 * The limits are exported so the schema, its tests and the frontend share ONE number. The frontend
 * duplicates the value with a comment pointing back here, which is the established convention in
 * this repo rather than importing across the stack boundary.
 */

export const CHANGE_REQUEST_TITLE_MAX = 140;
export const CHANGE_REQUEST_DESCRIPTION_MAX = 4000;
export const DECLINED_REASON_MAX = 1000;

/** A title of only punctuation or digits tells a reviewer nothing. Same rule as display names. */
const HAS_A_LETTER = /\p{L}/u;

export const FileChangeRequestSchema = z.object({
  domain_key: z.string().trim().min(1, 'A change request has to name the domain it is about.'),
  title: z.string().trim()
    .min(1, 'A title is required.')
    .max(CHANGE_REQUEST_TITLE_MAX, `A title can be at most ${CHANGE_REQUEST_TITLE_MAX} characters.`)
    .refine((v) => HAS_A_LETTER.test(v), 'A title needs at least one letter.'),
  description: z.string().trim()
    .max(CHANGE_REQUEST_DESCRIPTION_MAX, `A description can be at most ${CHANGE_REQUEST_DESCRIPTION_MAX} characters.`)
    .optional(),
}).strict();

export type FileChangeRequestInput = z.infer<typeof FileChangeRequestSchema>;

/**
 * A decision. `declined_reason` is REQUIRED when declining and REFUSED when approving.
 *
 * Required on a decline because a decline the intern cannot read the reason for is how they learn
 * to stop filing requests, which is the opposite of what this ticket is for. Refused on an approval
 * because a stored "reason" on an approved row is a field two readers will interpret differently,
 * and the gate would have no way to tell which meaning was intended.
 *
 * Expressed with `superRefine` rather than a discriminated union so that BOTH failures can be
 * reported in one response alongside any other problem with the body.
 */
export const DecideChangeRequestSchema = z.object({
  decision: z.enum(['approved', 'declined'], {
    message: "A decision has to be either 'approved' or 'declined'.",
  }),
  declined_reason: z.string().trim()
    .max(DECLINED_REASON_MAX, `A reason can be at most ${DECLINED_REASON_MAX} characters.`)
    .optional(),
}).strict().superRefine((val, ctx) => {
  const hasReason = typeof val.declined_reason === 'string' && val.declined_reason.length > 0;
  if (val.decision === 'declined' && !hasReason) {
    ctx.addIssue({
      code: 'custom',
      path: ['declined_reason'],
      message: 'Declining a change request requires a reason the person who filed it can read.',
    });
  }
  if (val.decision === 'approved' && hasReason) {
    ctx.addIssue({
      code: 'custom',
      path: ['declined_reason'],
      message: 'An approval cannot carry a decline reason.',
    });
  }
});

export type DecideChangeRequestInput = z.infer<typeof DecideChangeRequestSchema>;
