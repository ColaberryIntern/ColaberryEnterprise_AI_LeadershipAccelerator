import { z } from 'zod';

/**
 * Request contracts for the Colaberry Live broadcast surface.
 *
 * Every one is `.strict()`: an unknown key is a 400, not a silently ignored field. That
 * matters more than usual here because these bodies carry access and lifecycle decisions,
 * and a typo'd key that is quietly dropped would look like a working request that did
 * nothing. Note the deploy consequence — a `.strict()` route rejects a body from a NEWER
 * frontend than the running backend, so these ship backend-first, never frontend-only.
 *
 * `expected_version` is required on every mutation rather than optional. Optimistic
 * concurrency that a client can skip is not concurrency control at all: the one caller who
 * omits it is exactly the caller racing someone else.
 */

export const producerCommandSchema = z
  .object({
    command: z.enum(['enter_backstage', 'return_to_scheduled', 'mark_content_started', 'go_live', 'end', 'cancel']),
    /** The version the caller believes it is acting on. Required — see above. */
    expected_version: z.number().int().nonnegative(),
  })
  .strict();
export type ProducerCommandInput = z.infer<typeof producerCommandSchema>;

export const occurrenceIdParamSchema = z
  .object({ id: z.string().uuid('Invalid occurrence id') })
  .strict();

export const playbackGrantSchema = z
  .object({
    /**
     * Which asset is being requested. A slug, never a path: the key grammar in
     * broadcastPlaybackGrant rejects anything else, but refusing it at the edge means a
     * traversal attempt never reaches the signer at all.
     */
    asset: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,80}$/i, 'Invalid asset name'),
  })
  .strict();
export type PlaybackGrantInput = z.infer<typeof playbackGrantSchema>;

/**
 * Deliberately NOT in any schema: viewer identity, role, paid status, preview deadline, or
 * occurrence state. Request §7 — "Never let a client supply its own identity, role, paid
 * status, source URL, campaign recipient list or authoritative viewer count." All of those
 * are resolved server-side from the JWT and the occurrence row. If one ever appears in a
 * schema here, that is the bug.
 */
export const FORBIDDEN_CLIENT_SUPPLIED_FIELDS = [
  'enrollment_id', 'is_admin', 'is_producer', 'payment_status', 'access_mode',
  'content_started_at', 'preview_seconds', 'editorial_state', 'viewer_count',
] as const;
