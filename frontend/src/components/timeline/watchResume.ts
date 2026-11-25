/**
 * watchResume — where a video should start, given how far this student already got.
 *
 * The server has stored a furthest-playhead (`max_position_s`) for every watched
 * card since the watch gate shipped, and the player never once read it: every
 * open started at zero. A student who stopped 18 minutes into a 20-minute class
 * had to scrub back to their spot by hand, and the usual outcome is that they
 * replay the opening instead, which earns nothing under the coverage gate.
 *
 * Two rules keep a resume from being worse than no resume:
 *
 *  - Below MIN_RESUME_S there is nothing worth restoring. Seeking a few seconds
 *    in is a jolt with no benefit, and it fights the player's own start.
 *  - Within END_TAIL_S of the end they have finished it. Dropping someone onto
 *    the closing seconds of a video they completed looks broken; a rewatch wants
 *    the top. This is also what stops a 100%-watched card from being unplayable.
 *
 * The caller passes the duration it actually knows: the real one from the player
 * for a direct file, the server's stored one for an iframe. A null duration only
 * disables the tail rule - it never blocks a resume, because the common case for
 * an unknown duration (Loom, Wistia) is also the case where scrubbing back by
 * hand is most annoying.
 */

/** Below this many seconds in, a resume is a jolt rather than a convenience. */
export const MIN_RESUME_S = 15;

/** This close to the end counts as finished — a rewatch starts from the top. */
export const END_TAIL_S = 20;

/**
 * The second to start playback at, or null to start from the beginning.
 * `positionS` is the furthest playhead the server recorded; `durationS` is the
 * clip's length when known.
 */
export function resumeTargetS(
  positionS: number | null | undefined,
  durationS: number | null | undefined,
): number | null {
  const pos = Number(positionS);
  if (!Number.isFinite(pos) || pos < MIN_RESUME_S) return null;
  const dur = Number(durationS);
  if (Number.isFinite(dur) && dur > 0 && pos >= dur - END_TAIL_S) return null;
  return Math.floor(pos);
}

/**
 * The same embed URL, asked to start `seconds` in.
 *
 * YouTube and Vimeo take the start point in the URL, which is why this is a
 * string transform and not a player call: both are cross-origin iframes with no
 * seek API available here (the YouTube channel this app speaks is receive-only
 * — see VideoEmbed's postMessage handshake). Loom and Wistia have no documented
 * start parameter, so they are returned untouched rather than given a guess.
 *
 * A URL that already carries a start point is left exactly as it is, so an
 * authored "start at the good bit" link is never overridden by watch history.
 */
export function withStartAt(
  embedUrl: string,
  provider: string | null | undefined,
  seconds: number | null,
): string {
  if (!embedUrl || seconds == null || !Number.isFinite(seconds) || seconds <= 0) return embedUrl;
  const at = Math.floor(seconds);
  if (provider === 'youtube') {
    if (/[?&]start=/.test(embedUrl)) return embedUrl;
    return embedUrl + (embedUrl.includes('?') ? '&' : '?') + `start=${at}`;
  }
  if (provider === 'vimeo') {
    if (/#t=/.test(embedUrl)) return embedUrl;
    return `${embedUrl}#t=${at}s`;
  }
  return embedUrl;
}
