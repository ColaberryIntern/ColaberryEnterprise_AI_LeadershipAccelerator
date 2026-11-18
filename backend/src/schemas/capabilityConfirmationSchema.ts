import { z } from 'zod';
import { CAPABILITY_ID_MAX } from './agentToolGrantSchema';

/**
 * AF11.0 — the inbound body for a capability confirmation.
 *
 * ## This schema checks SHAPE and nothing else
 *
 * `capabilityConfirmationContract` already decides whether a confirmation may stand, and it
 * returns a named rule for each reason it may not: `evidence_incomplete`,
 * `evidence_does_not_support_confirmation`, `confirmer_not_super_admin`, and six more. Every one
 * of those is a sentence the caller can act on.
 *
 * So this schema deliberately does **not** require the individual evidence fields. If it did,
 * a body missing `evaluated_by` would come back as a generic 400 about a missing key, and the
 * contract's `evidence_incomplete` — which names all four fields at once and explains why a
 * confirmation needs them — would become unreachable over HTTP. Judgement belongs in one place,
 * and it is not here.
 *
 * ## What it DOES refuse
 *
 * `.strict()`, for the same reason `GrantToolSchema` has it, and the reason is sharper here. The
 * one thing a confirmation must never do is carry the actor's identity. `confirmed_by`,
 * `actor_role` or `email` in the body of a permissive object would be silently dropped and
 * answered 200, and a caller reading that 200 would reasonably believe they had confirmed a
 * capability as somebody else. `.strict()` turns each into a visible 400 naming the key.
 *
 * The identity comes from the verified token in the controller and from nowhere else.
 */

/** Matches the ceiling the grant body uses, so one capability id cannot pass one gate and fail the other. */
export { CAPABILITY_ID_MAX };

/** Long enough for a real URL, a ticket link or a commit SHA with context around it. */
export const EVIDENCE_FIELD_MAX = 500;
/** The summary is prose a person wrote. Bounded so a paste cannot become a payload. */
export const EVIDENCE_SUMMARY_MAX = 4000;

const evidenceField = (label: string) =>
  z
    .string()
    .trim()
    .max(EVIDENCE_FIELD_MAX, `${label} is at most ${EVIDENCE_FIELD_MAX} characters.`)
    .optional();

export const ConfirmCapabilitySchema = z
  .object({
    capability_id: z
      .string()
      .trim()
      .min(1, 'Name the capability being confirmed.')
      .max(CAPABILITY_ID_MAX, `A capability id is at most ${CAPABILITY_ID_MAX} characters.`),
    /**
     * REQUIRED as a key, optional in its parts.
     *
     * Requiring the key pre-empts the contract's `evidence_missing` rule, which is the one
     * refusal this route answers as a 400 rather than a 409. That is the house ladder — shape
     * first, judgement second — and it is stated here so the difference is deliberate rather
     * than discovered. Every other rule the contract can produce is still reachable: send
     * `{}` and you get `evidence_incomplete` with its own sentence.
     */
    evidence: z
      .object({
        kind: evidenceField('An evidence kind'),
        source: evidenceField('An evidence source'),
        observed_at: evidenceField('An observation time'),
        evaluated_by: evidenceField('An evaluator'),
        summary: z
          .string()
          .trim()
          .max(EVIDENCE_SUMMARY_MAX, `A summary is at most ${EVIDENCE_SUMMARY_MAX} characters.`)
          .optional(),
      })
      .strict(),
  })
  .strict();

export type ConfirmCapabilityBody = z.infer<typeof ConfirmCapabilitySchema>;
