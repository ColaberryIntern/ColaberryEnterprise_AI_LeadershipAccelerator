import { z } from 'zod';

/**
 * Inbound validation for the public `/r/:shortCode` redirect.
 *
 * This is an UNAUTHENTICATED endpoint reachable by anyone, so the path parameter is
 * attacker-controlled by definition. It is validated against the exact alphabet
 * `generateShortCode` emits rather than a loose pattern: the value goes into a database
 * lookup and appears in log lines, and "looks roughly like a code" is not a property worth
 * relying on at a public boundary.
 *
 * The QUERY is deliberately NOT constrained to a fixed shape. Real inbound traffic carries
 * whatever the ad platform appended — click IDs we have adopted, click IDs we have not, and
 * assorted vendor parameters — and rejecting an unrecognised parameter would drop a real
 * visitor's click to punish a platform for adding a field. Query values are instead read
 * defensively by `extractClickIds`, which takes only what it recognises and truncates it.
 */

/** The generated alphabet: Crockford-style, with I, L, O, U, 0 and 1 excluded. */
const SHORT_CODE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4,32}$/;

export const trackedLinkRedirectParamsSchema = z.object({
  shortCode: z
    .string()
    .min(4)
    .max(32)
    .regex(SHORT_CODE, 'Short code is not in the generated alphabet.'),
});

export type TrackedLinkRedirectParams = z.infer<typeof trackedLinkRedirectParamsSchema>;
