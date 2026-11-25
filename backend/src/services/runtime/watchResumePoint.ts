/**
 * watchResumePoint — the stored playhead, shaped for the player.
 *
 * `max_position_s` has been recorded on every watch beat since the watch gate
 * shipped, and nothing has ever read it back: the UI only ever asked for a
 * percentage, so every reopen started at zero. This turns that stored second
 * into something the client can act on.
 *
 * Deliberately NOT in watchProgressMath: nothing here folds a beat or decides a
 * gate, and the decision of whether a resume is WORTH making belongs to the
 * client, which knows the duration of the player it actually loaded (see the
 * frontend's watchResume.ts). This module only reports what was stored.
 */
import type { WatchState } from './watchProgressMath';

export interface WatchResumePoint {
  /** Furthest second reached, or null when there is nothing stored. */
  position_s: number | null;
  /** The clip's length as the server knows it, or null when never measurable. */
  duration_s: number | null;
}

export const NO_RESUME_POINT: WatchResumePoint = { position_s: null, duration_s: null };

/**
 * The resume point held in a stored watch blob. A position past the known
 * duration is clamped to it rather than trusted: that reads as "they reached
 * the end", which is exactly how the client treats it (start from the top).
 */
export function resumePointOf(watch: WatchState | null | undefined): WatchResumePoint {
  if (!watch || typeof watch !== 'object') return NO_RESUME_POINT;

  const rawDuration = Number(watch.duration_s);
  const duration_s = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : null;

  const rawPosition = Number(watch.max_position_s);
  if (!Number.isFinite(rawPosition) || rawPosition <= 0) return { position_s: null, duration_s };

  const position_s = duration_s != null ? Math.min(Math.round(rawPosition), duration_s) : Math.round(rawPosition);
  return { position_s, duration_s };
}
