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

/**
 * The producer commands a CLIENT may send over HTTP — a deliberate subset of the state
 * machine's `ProducerCommand`.
 *
 * `begin_processing` and `publish_replay` are producer commands in the machine but are issued
 * only by `runReplayTick` once the provider reports a ready recording, so they are absent
 * here on purpose: a replay publishes itself, and a hand-sent one would race the loop.
 *
 * Exported as an array rather than written inline, because the producer-state read describes
 * which commands are available right now and must not offer one this schema would answer 400
 * to. One list, read by both directions.
 */
export const SENDABLE_PRODUCER_COMMANDS = [
  'enter_backstage', 'return_to_scheduled', 'mark_content_started', 'go_live', 'end', 'cancel',
] as const;

export const producerCommandSchema = z
  .object({
    command: z.enum(SENDABLE_PRODUCER_COMMANDS),
    /** The version the caller believes it is acting on. Required — see above. */
    expected_version: z.number().int().nonnegative(),
  })
  .strict();
export type ProducerCommandInput = z.infer<typeof producerCommandSchema>;

export const occurrenceIdParamSchema = z
  .object({ id: z.string().uuid('Invalid occurrence id') })
  .strict();

/**
 * The producer-state read is keyed on the SESSION, not the occurrence — a producer opens the
 * class they are about to teach, and the occurrence key changes when a show is re-timed.
 */
export const sessionIdParamSchema = z
  .object({ sessionId: z.string().uuid('Invalid session id') })
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
 * One playback heartbeat from one tab.
 *
 * Three fields, and every one of them is a FACT ABOUT THE PLAYER, never about the person.
 * `session_id` is an opaque tab id the client generates; it is not identity and is never
 * trusted as such — the enrollment is taken from the JWT. `state` is what the media element
 * is doing. `intent` is whether this viewer chose to watch or the player started on its own,
 * which is the difference between an audience and a page view.
 *
 * What a client may NOT send is enforced twice over: `rejectUntrustedFields` names any
 * identity, entitlement or count field BEFORE this schema runs, and `.strict()` refuses
 * anything else unrecognised. Two layers because they fail differently — the first tells a
 * caller precisely which claim was refused, the second catches everything nobody thought of.
 */
export const playbackHeartbeatSchema = z
  .object({
    /** Opaque, client-generated, per tab. Bounded so a long id cannot bloat the row. */
    session_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid session id'),
    state: z.enum(['playing', 'paused', 'buffering', 'ended']),
    intent: z.enum(['deliberate', 'auto']),
  })
  .strict();
export type PlaybackHeartbeatInput = z.infer<typeof playbackHeartbeatSchema>;

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
