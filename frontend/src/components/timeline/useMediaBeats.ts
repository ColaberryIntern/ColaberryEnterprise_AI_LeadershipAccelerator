import { useRef } from 'react';
import type { WatchBeatPayload } from './VideoEmbed';

/**
 * useMediaBeats — turn a media element's timeupdate stream into watch beats.
 *
 * The same accumulator VideoEmbed runs for <video>: count seconds ACTUALLY
 * PLAYED (a position jump past MAX_TICK_DELTA_S is a seek and adds nothing),
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
export const MAX_TICK_DELTA_S = 2.5;      // a position jump beyond this = a seek, not playback

export function useMediaBeats(onBeat: ((b: WatchBeatPayload) => void) | undefined, provider: string) {
  const bufRef = useRef({ delta: 0, position: 0, duration: 0 });
  const lastPosRef = useRef<number | null>(null);
  const beatRef = useRef(onBeat);
  beatRef.current = onBeat;

  const flush = () => {
    const b = bufRef.current;
    if (!beatRef.current || b.delta <= 0) return;
    bufRef.current = { delta: 0, position: b.position, duration: b.duration };
    beatRef.current({
      delta_s: Math.round(b.delta * 10) / 10,
      position_s: Math.round(b.position),
      duration_s: Math.round(b.duration || 0),
      provider,
    });
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    const pos = el.currentTime;
    const dur = el.duration;
    const last = lastPosRef.current;
    lastPosRef.current = pos;
    if (last != null && !el.paused) {
      const d = pos - last;
      if (d > 0 && d < MAX_TICK_DELTA_S) bufRef.current.delta += d;
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
