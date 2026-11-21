import { useRef } from 'react';
import type { WatchBeatPayload } from './VideoEmbed';
import { creditForTick } from './watchCredit';
import { retryDelayMs } from './watchRetry';

/**
 * useMediaBeats — turn a media element's timeupdate stream into watch beats.
 *
 * The same accumulator VideoEmbed runs for <video>: count seconds ACTUALLY
 * PLAYED (a playhead advance counts only as far as the wall clock backs it up,
 * so a scrub adds nothing and a throttled background tab is not robbed of the
 * minutes it really played — see watchCredit.ts),
 * remember the furthest playhead and the duration, and flush a beat every
 * FLUSH_AFTER_S of new play. Extracted so the podcast <audio> on the Today tile
 * measures listening exactly the way the video tile measures watching — one
 * definition of "75%", not two.
 *
 * Refs throughout so the handlers never go stale across the element being
 * destroyed and recreated as the tile scrolls in and out of view.
 */
// ONE beat shape for every player. VideoEmbed owns it; this hook only emits it.
// A second definition here was caught by tsc on 2026-09-11 — the handler could
// not be passed to VideoEmbed's onWatchBeat, which is the entire point.
export type { WatchBeatPayload } from './VideoEmbed';

export const FLUSH_AFTER_S = 15;          // flush a beat after this much new play time

// Ceiling on seconds re-credited after failed sends, and the same number VideoEmbed uses. Past
// this the backlog is a broken server rather than a listener's time, and replaying it as one beat
// would be a lie about what was heard.
const MAX_REBUFFERED_S = 600;

/**
 * `onBeat` may RETURN A PROMISE, and should. If it does and the promise rejects, the buffered
 * seconds are put back instead of being destroyed, and the next send waits (watchRetry.ts).
 * A caller that returns void keeps the old fire-and-forget behaviour exactly.
 *
 * This mirrors VideoEmbed's accumulator rather than sharing code with it. That is a deliberate
 * second copy of about ten lines: this repo's rule is to extract at the THIRD occurrence, and the
 * two buffers differ in shape (this one has no exit beat). If a third accumulator appears, lift
 * the retry bookkeeping out of both.
 */
export function useMediaBeats(
  onBeat: ((b: WatchBeatPayload) => void | Promise<unknown>) | undefined,
  provider: string,
) {
  const bufRef = useRef({ delta: 0, position: 0, duration: 0 });
  const lastPosRef = useRef<number | null>(null);
  // When the previous playhead sample arrived, so a gap can be measured against the clock.
  const lastTickAtRef = useRef<number | null>(null);
  const beatRef = useRef(onBeat);
  beatRef.current = onBeat;
  // Earliest clock time the next send may go out, and how many failures in a row we have had.
  // Without the wait, re-crediting a rejected beat would restore the buffer above FLUSH_AFTER_S --
  // the very condition that triggers a flush -- and the next timeupdate would resend immediately.
  const retryAtRef = useRef<number>(0);
  const failuresRef = useRef<number>(0);

  const flush = () => {
    const b = bufRef.current;
    if (!beatRef.current || b.delta <= 0) return;
    // Still waiting out a failure: keep buffering. The seconds are not lost, they go out as one
    // larger beat once the wait is over. Checked BEFORE the buffer is cleared, or the wait would
    // eat exactly the seconds it exists to preserve. Unlike VideoEmbed there is no exit beat to
    // exempt here, so a listener who closes the tab mid-wait loses that stretch -- the same
    // window that already applies to any sub-threshold tail, and worth its own change.
    if (retryAtRef.current > 0 && Date.now() < retryAtRef.current) return;
    bufRef.current = { delta: 0, position: b.position, duration: b.duration };
    const sent = beatRef.current({
      delta_s: Math.round(b.delta * 10) / 10,
      position_s: Math.round(b.position),
      duration_s: Math.round(b.duration || 0),
      provider,
    });

    // A caller that returns nothing behaves exactly as before.
    if (sent && typeof (sent as Promise<unknown>).then === 'function') {
      (sent as Promise<unknown>).then(
        () => { failuresRef.current = 0; retryAtRef.current = 0; },
        (err: unknown) => {
          bufRef.current.delta = Math.min(bufRef.current.delta + b.delta, MAX_REBUFFERED_S);
          failuresRef.current += 1;
          retryAtRef.current = Date.now() + retryDelayMs(err, failuresRef.current);
        },
      );
    }
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    const pos = el.currentTime;
    const dur = el.duration;
    const last = lastPosRef.current;
    const lastAt = lastTickAtRef.current;
    const nowMs = Date.now();
    lastPosRef.current = pos;
    lastTickAtRef.current = nowMs;
    if (last != null && !el.paused) {
      bufRef.current.delta += creditForTick(pos - last, lastAt == null ? 0 : (nowMs - lastAt) / 1000);
    }
    bufRef.current.position = Math.max(bufRef.current.position, pos);
    if (dur && Number.isFinite(dur) && dur > 0) bufRef.current.duration = Math.max(bufRef.current.duration, dur);
    if (bufRef.current.delta >= FLUSH_AFTER_S) flush();
  };

  /** On pause/end, send whatever is buffered so the last stretch is not lost. */
  const onPauseOrEnd = () => {
    if (bufRef.current.duration > 0 && lastPosRef.current != null) {
      bufRef.current.position = Math.max(bufRef.current.position, lastPosRef.current);
    }
    flush();
  };

  return { onTimeUpdate, onPauseOrEnd, flush };
}
