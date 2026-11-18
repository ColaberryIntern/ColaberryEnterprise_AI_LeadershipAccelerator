/**
 * watchCredit — how much of a playhead jump counts as "watched".
 *
 * THE BUG THIS REPLACES (2026-11-18, reported by a student who finished a
 * 59:48 video and was credited 55%): both players counted a playhead advance
 * only when it was smaller than a FIXED 2.5 seconds, on the theory that
 * anything bigger must be a scrub. But the size of a playhead advance is not a
 * property of the student — it is a property of how often the page happens to
 * be sampled. Browsers throttle timers and postMessage delivery in a
 * backgrounded tab to roughly once a minute, YouTube's channel goes quiet
 * during a buffering stall, and a sleeping laptop stops sampling entirely.
 * Every one of those gaps arrived as a >2.5s advance and was thrown away as a
 * seek, so real playback earned nothing. The loss therefore scaled with how
 * long a video was — exactly backwards. Production bore this out: credited
 * time against ground covered averaged 0.98 under 5 minutes, 0.91 at 5-10
 * minutes, and 0.70 over 30 minutes.
 *
 * THE RULE INSTEAD: playback cannot outrun the clock. Credit the playhead
 * advance, but never more than the wall-clock time that actually elapsed
 * between the two samples (times MAX_PLAYBACK_RATE, so 1.5x and 2x viewers are
 * not short-changed). A real watch always has the clock behind it, however
 * sparsely it was sampled. A scrub does not: dragging 40 minutes ahead takes a
 * fraction of a second of real time, so it still earns a fraction of a second.
 * That is a stricter anti-scrub test than the old constant, not a looser one —
 * the old rule let someone scrub 2.4 seconds at a time for free.
 */

/** Fastest playback we will credit at face value. YouTube's own ceiling is 2x. */
export const MAX_PLAYBACK_RATE = 2.5;

/** Slack for timestamp quantization, so samples landing in the same millisecond
 *  are not starved. Small enough that a scrub still earns next to nothing. */
export const TICK_GRACE_S = 0.5;

/**
 * Seconds of watch credit for one playhead sample.
 *
 * @param positionDeltaS how far the playhead moved since the previous sample
 * @param elapsedWallClockS real time that passed between the two samples
 */
export function creditForTick(positionDeltaS: number, elapsedWallClockS: number): number {
  const advance = Number(positionDeltaS);
  if (!Number.isFinite(advance) || advance <= 0) return 0;      // paused, rewound, or junk
  const elapsed = Number(elapsedWallClockS);
  const clock = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
  return Math.min(advance, clock * MAX_PLAYBACK_RATE + TICK_GRACE_S);
}
