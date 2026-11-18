/**
 * The beat accumulator behind podcast listen-to-earn. It must count seconds
 * actually played, ignore seeks, flush on a cadence, and never lose the last
 * stretch before a pause. If it over-counts, students earn 35 points for
 * scrubbing to the end; if it under-counts, honest listeners never reach 75%.
 *
 * These tests drive a fake clock alongside the playhead, because that is the
 * pair the accumulator actually judges (2026-11-18): a playhead advance counts
 * only as far as real time backs it up. Playing for a second takes a second;
 * dragging the scrubber a minute ahead takes none.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useMediaBeats, FLUSH_AFTER_S, type WatchBeatPayload } from '../useMediaBeats';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let handlers: ReturnType<typeof useMediaBeats>;
const Harness: React.FC<{ onBeat: (b: WatchBeatPayload) => void }> = ({ onBeat }) => {
  handlers = useMediaBeats(onBeat, 'audio');
  return null;
};

let container: HTMLDivElement;
let root: Root;
let beats: WatchBeatPayload[];
let nowMs: number;
let lastPlayhead: number;

const raw = (t: number, dur: number, paused: boolean) =>
  handlers.onTimeUpdate({ currentTarget: { currentTime: t, duration: dur, paused } } as any);

/** A timeupdate from a media element genuinely PLAYING to `t`: the wall clock
 *  moves forward by as much as the playhead did. */
const tick = (t: number, dur = 600, paused = false) => {
  const advanced = t - lastPlayhead;
  if (advanced > 0) nowMs += advanced * 1000;
  lastPlayhead = t;
  raw(t, dur, paused);
};

/** A SEEK: the playhead leaps but no real time passes. */
const scrub = (t: number, dur = 600) => { lastPlayhead = t; raw(t, dur, false); };

/** Time passing with no samples at all — a backgrounded tab, a buffering stall,
 *  a sleeping laptop. The next sample lands far ahead of the last one. */
const gapThenTick = (gapS: number, dur = 600) => {
  nowMs += gapS * 1000;
  const t = lastPlayhead + gapS;
  lastPlayhead = t;
  raw(t, dur, false);
};

beforeEach(() => {
  beats = [];
  nowMs = 1_700_000_000_000;
  lastPlayhead = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); root.render(<Harness onBeat={(b) => beats.push(b)} />); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });

it('emits one beat after FLUSH_AFTER_S seconds of real playback, carrying position and duration', () => {
  // 1-second ticks, as a media element produces them.
  for (let t = 0; t <= FLUSH_AFTER_S + 1; t++) tick(t);
  expect(beats).toHaveLength(1);
  expect(beats[0].delta_s).toBeGreaterThanOrEqual(FLUSH_AFTER_S);
  // The flush fires ON the tick that crosses the threshold — 15 s of play at
  // t=15 — not the tick after. Asserting the exact tick pins the cadence.
  expect(beats[0].position_s).toBe(FLUSH_AFTER_S);
  expect(beats[0].duration_s).toBe(600);
  expect(beats[0].provider).toBe('audio');
});

it('does NOT count a seek as listening', () => {
  tick(0); tick(1);
  scrub(500);                 // dragged 499s ahead in no time at all
  handlers.flush();
  // Only the 1 real second counts; the 499 does not.
  expect(beats).toHaveLength(1);
  expect(beats[0].delta_s).toBeLessThanOrEqual(1.5);
});

it('REGRESSION: a gap with no samples still counts, because the clock backs it up', () => {
  // The 2026-11-18 bug: a backgrounded tab is sampled about once a minute, and
  // every one of those minutes used to be discarded as if it were a seek.
  tick(0);
  gapThenTick(60);
  handlers.flush();
  expect(beats).toHaveLength(1);
  expect(beats[0].delta_s).toBeGreaterThanOrEqual(59);
});

it('does not accrue while paused', () => {
  tick(0);
  for (let t = 1; t <= 20; t++) tick(t, 600, true);   // element reports paused
  handlers.flush();
  expect(beats).toHaveLength(0);
});

it('flushes the buffered tail on pause so the last stretch is not lost', () => {
  for (let t = 0; t <= 5; t++) tick(t);   // 5s: under the cadence, still buffered
  expect(beats).toHaveLength(0);
  handlers.onPauseOrEnd();
  expect(beats).toHaveLength(1);
  expect(beats[0].delta_s).toBeGreaterThanOrEqual(4.5);
});

it('never emits an empty beat', () => {
  handlers.onPauseOrEnd();
  handlers.flush();
  expect(beats).toHaveLength(0);
});
