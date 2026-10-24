/**
 * When a finished broadcast becomes a watchable replay (L8.4).
 *
 * WHY THIS WAS MISSING AND WHY IT MATTERS. `ended -> processing -> replay_ready` has been in the
 * transition table since it was written, and nothing ever performed either step: `processing`
 * and `replay_ready` appeared in the broadcast source ONLY in the schema's allowed-values list.
 * Entitlement treats `live`, `reconnecting` and `replay_ready` as watchable, so every finished
 * class stopped at `ended` and every replay request was refused `not_watchable` — regardless of
 * whether a perfectly good recording was sitting in Cloudflare.
 *
 * So the recording binding on its own delivers nothing anybody can see. This is the step that
 * carries it to the surface.
 *
 * PUBLISHING IS A PRODUCER DECISION. These resolve to producer commands, not provider events,
 * for the same reason a webhook may not put a class on air: the provider reports facts, and
 * what the audience is shown is ours to decide.
 *
 * Pure. The runner does the I/O; nothing here opens a socket or a transaction.
 */

/** What the provider says about the recording. Cloudflare's `status.state`, narrowed. */
export type RecordingState =
  /** Still being produced: `inprogress`, `queued`, `pendingupload`, `downloading`. */
  | 'preparing'
  /** Playable. */
  | 'ready'
  /** Cloudflare gave up on it. */
  | 'error'
  /** We could not ask. OUR problem, never evidence about the recording. */
  | 'unreadable';

/** Cloudflare's vocabulary, mapped once so the rest of the file reasons in ours. */
export function narrowRecordingState(raw: unknown): RecordingState {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'ready') return 'ready';
  if (s === 'error') return 'error';
  if (s === 'inprogress' || s === 'queued' || s === 'pendingupload' || s === 'downloading') {
    return 'preparing';
  }
  // An unrecognised state is not 'preparing'. A future Cloudflare value must not be silently
  // treated as "still working on it" and quietly stall every replay with no signal.
  return 'unreadable';
}

export interface ReplayCandidate {
  editorial_state: string;
  /** The bound recording. Nothing can be published without one. */
  provider_instance_uuid: string | null;
}

export interface ReplayDecision {
  /** The producer command to issue, or null to leave it alone. */
  command: 'begin_processing' | 'publish_replay' | null;
  reason:
    /** Moving a finished show into processing, where it waits for the recording. */
    | 'recording_preparing'
    /** The recording is playable. Publish it. */
    | 'recording_ready'
    /** No recording was ever captured, so there is nothing to publish. */
    | 'no_recording'
    /** Cloudflare could not produce one. A human decides what to do. */
    | 'recording_failed'
    /** We could not ask; try again next tick. */
    | 'cannot_confirm'
    /** Not a state this step acts on. */
    | 'not_a_candidate';
}

/** The only states this step moves. Anything else is someone else's business. */
export const PROMOTABLE_STATES = ['ended', 'processing'] as const;

export function decideReplayPromotion(
  occurrence: ReplayCandidate,
  recording: RecordingState,
): ReplayDecision {
  if (!(PROMOTABLE_STATES as readonly string[]).includes(occurrence.editorial_state)) {
    return { command: null, reason: 'not_a_candidate' };
  }

  if (!occurrence.provider_instance_uuid) {
    // A show that aired before the binding existed, or one whose capture never happened. It
    // must NOT be promoted: `replay_ready` with nothing bound is an occurrence that advertises
    // a replay and then refuses to play it, which is worse than staying honestly ended.
    return { command: null, reason: 'no_recording' };
  }

  if (recording === 'unreadable') {
    // Our failure to ask is never a fact about the recording. Leave it and try again.
    return { command: null, reason: 'cannot_confirm' };
  }

  if (recording === 'error') {
    // Deliberately NOT advanced to anything. `ended` is the truthful terminal state for a show
    // whose recording failed: it aired, and there is no replay. Inventing a state for it would
    // mean inventing a surface to explain it.
    return { command: null, reason: 'recording_failed' };
  }

  if (recording === 'ready') {
    /**
     * `processing` publishes; `ended` only advances one step.
     *
     * The transition table forbids ended -> replay_ready directly, and that is right: a show
     * passes through processing so anything watching the state has a chance to see it. One step
     * per tick is also what makes this safe to run repeatedly — each tick either moves it or
     * does nothing, and the version guard arbitrates if two ticks ever overlap.
     */
    return occurrence.editorial_state === 'processing'
      ? { command: 'publish_replay', reason: 'recording_ready' }
      : { command: 'begin_processing', reason: 'recording_ready' };
  }

  // preparing
  return occurrence.editorial_state === 'ended'
    ? { command: 'begin_processing', reason: 'recording_preparing' }
    : { command: null, reason: 'recording_preparing' };
}
