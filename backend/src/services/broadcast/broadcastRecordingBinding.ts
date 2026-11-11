/**
 * Which recording belongs to which occurrence (L8.4).
 *
 * WHY THIS IS NOT A RESOLVER FOR `/bm/`, which is what the ticket originally asked for.
 * A Cloudflare occurrence never reaches `/bm/`: the grant controller branches on
 * `provider === 'cloudflare'` and returns a Cloudflare URL, and `/bm/` serves bytes from local
 * disk. Making replay work through `/bm/` would mean downloading every 38-minute class to the
 * VPS to re-serve what Cloudflare's edge already serves, signed. Ali chose the other path on
 * 2026-10-23: bind the recording's video uid and sign THAT. `/bm/` stays exactly as it is,
 * correct and tested, for recordings that genuinely sit on disk.
 *
 * THE DEFECT THIS EXISTS TO FIX. For an ended Cloudflare occurrence the controller signs
 * `provider_session_id` — the LIVE INPUT uid — unconditionally. Test 2's occurrence is `ended`
 * and a replay grant for it hands back a signed live manifest for an input that stopped
 * streaming days ago. The recording itself is fine and sitting in Cloudflare; nothing points
 * at it.
 *
 * THE BINDING IS OBSERVED, NOT INFERRED. `readLiveLifecycle` already returns a NEW video uid
 * per broadcast, and the health loop already calls it every minute for everything on air —
 * then throws that uid away. Capturing it while the stream is running is exact: no matching
 * recordings to occurrences by timestamp, no ambiguity to resolve, and no extra provider call.
 *
 * `provider_instance_uuid` has existed on the model and in the schema since the table was
 * created and NOTHING HAS EVER WRITTEN IT — both production occurrences carry null. This is
 * the field it was for. Same shape of gap as `ended_at` before L7.4.
 */

/** What the provider reports for an input this tick. */
export interface LifecycleObservation {
  live: boolean;
  /** The video being recorded right now. Null while the input is idle. */
  videoUid: string | null;
}

/** Just enough of the occurrence to decide. Keeps this pure and fixture-testable. */
export interface BindableOccurrence {
  id: string;
  editorial_state: string;
  provider: string | null;
  provider_instance_uuid: string | null;
}

export interface BindingDecision {
  /** The uid to persist, or null to leave the row alone. */
  capture: string | null;
  reason:
    /** Nothing is streaming, so there is no recording to name yet. */
    | 'no_video_yet'
    /** First sight of this broadcast's video. Write it. */
    | 'captured'
    /** Already bound to this same video. Nothing to do. */
    | 'already_bound'
    /**
     * Already bound to a DIFFERENT video. Refused, loudly: see the comment below.
     */
    | 'conflict'
    /** A rehearsal. Recorded by the provider, but never this occurrence's replay. */
    | 'not_on_air'
    /** Not a Cloudflare occurrence; this binding has no meaning. */
    | 'not_cloudflare';
}

/** The only provider whose recordings this understands. */
const CLOUDFLARE = 'cloudflare';
/** Cloudflare uids are 32 lowercase hex characters. Anything else is not a uid. */
const UID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * States whose video is the class. `backstage` is observed by the health loop but is NOT here.
 *
 * THE DEFECT THIS GUARD FIXES: a rehearsal could become the published replay.
 *
 * Every piece was already true and documented separately, which is why nothing caught it:
 *
 *   - `OBSERVED_STATES` includes `backstage` (broadcastHealthRunner.ts:29), because entering
 *     backstage is "what makes the health loop start watching for a feed".
 *   - the live input is created with `recording: { mode: 'automatic' }`
 *     (cloudflareStreamProvider.ts:310), so Cloudflare records whatever is pushed to it,
 *     whatever our editorial state happens to say.
 *   - this function bound the FIRST uid it saw, in any observed state.
 *   - a second, different uid is then refused as a `conflict` rather than replacing the first.
 *
 * Put together: a producer enters backstage and starts OBS to check the feed, which is exactly
 * what backstage is for. Cloudflare records that and mints uid A. The loop binds A. The producer
 * stops OBS, goes live, and Cloudflare mints uid B for the real class - which is refused as a
 * conflict. The occurrence ends bound to A, and `resolvePlaybackTarget` serves the REHEARSAL as
 * the replay. A student opening the replay watches staff setting up.
 *
 * The conflict branch's own reasoning is what gives it away: it keeps the first recording
 * because that is "the one the audience actually watched". During backstage the audience
 * watched nothing, so the premise does not hold and the tie-break silently picks the wrong one.
 *
 * WHY WAITING FOR ON-AIR IS SAFE IN BOTH DIRECTIONS. Cloudflare mints one video per continuous
 * RTMP connection, not per editorial state:
 *
 *   - OBS pushes from backstage straight through go_live: ONE uid. Skipping the backstage ticks
 *     costs nothing; the same uid is bound on the first live tick.
 *   - OBS is stopped after the rehearsal and restarted for the class: TWO uids. The rehearsal's
 *     is never bound, and the class's is captured cleanly instead of being refused.
 *
 * So no path loses a recording it would otherwise have had, and the broken path is fixed.
 */
const ON_AIR_STATES = ['live', 'reconnecting'];

/**
 * Decide whether to record this observation against the occurrence.
 *
 * Pure. The caller does the write, which is what lets every branch be argued with in a test.
 */
export function decideRecordingBinding(
  occurrence: BindableOccurrence,
  observation: LifecycleObservation,
): BindingDecision {
  if (occurrence.provider !== CLOUDFLARE) {
    return { capture: null, reason: 'not_cloudflare' };
  }

  // Before the uid is even looked at: a rehearsal's video is not this occurrence's replay, so
  // there is nothing to decide. See ON_AIR_STATES.
  if (!ON_AIR_STATES.includes(occurrence.editorial_state)) {
    return { capture: null, reason: 'not_on_air' };
  }

  const uid = observation.videoUid;
  if (!uid || !UID_PATTERN.test(uid)) {
    // Includes the idle case and a malformed value. Neither is evidence of a recording, and
    // writing a malformed uid would produce a replay url that signs nonsense.
    return { capture: null, reason: 'no_video_yet' };
  }

  if (!occurrence.provider_instance_uuid) {
    return { capture: uid, reason: 'captured' };
  }

  if (occurrence.provider_instance_uuid === uid) {
    // Idempotency: the loop sees the same uid every minute for the length of the show.
    return { capture: null, reason: 'already_bound' };
  }

  /**
   * A DIFFERENT uid against an occurrence that already has one.
   *
   * Cloudflare mints a new video per broadcast, so this means the input streamed twice under
   * one occurrence — a producer stopped and restarted, say. Overwriting would silently throw
   * away the first recording and leave the replay pointing at whichever stretch happened to be
   * last. Refusing keeps the first, which is the one the audience actually watched, and makes
   * the second visible as a conflict somebody can decide about.
   */
  return { capture: null, reason: 'conflict' };
}

/**
 * Which uid should be signed for playback, given an occurrence's state.
 *
 * The whole point of L8.4 in one function: a show that is on air plays from its LIVE INPUT, and
 * a show that is over plays from its RECORDING. Signing the live input for an ended show is the
 * bug this ticket exists to fix, and it is the default the code had.
 */
export type PlaybackTarget =
  | { kind: 'live'; uid: string }
  | { kind: 'replay'; uid: string }
  | { kind: 'none'; reason: 'live_input_not_bound' | 'recording_not_bound' };

/** States in which the live input is the thing to play. Mirrors `isOnAir`. */
const ON_AIR = ['live', 'reconnecting'];

export function resolvePlaybackTarget(occurrence: {
  editorial_state: string;
  provider_session_id: string | null;
  provider_instance_uuid: string | null;
}): PlaybackTarget {
  if (ON_AIR.includes(occurrence.editorial_state)) {
    return occurrence.provider_session_id
      ? { kind: 'live', uid: occurrence.provider_session_id }
      : { kind: 'none', reason: 'live_input_not_bound' };
  }

  /**
   * Anything not on air plays from the recording, INCLUDING `backstage` and `scheduled`.
   *
   * That reads oddly until you consider the alternative: those states would otherwise fall to
   * the live branch and hand a viewer a signed manifest for an input nobody is streaming to.
   * Entitlement has already decided this viewer may watch something; the honest answer when
   * there is nothing recorded yet is "not bound", not a url that will fail at the player.
   */
  return occurrence.provider_instance_uuid
    ? { kind: 'replay', uid: occurrence.provider_instance_uuid }
    : { kind: 'none', reason: 'recording_not_bound' };
}
