/**
 * The beat accumulator behind podcast listen-to-earn. It must count seconds
 * actually played, ignore seeks, flush on a cadence, and never lose the last
 * stretch before a pause. If it over-counts, students earn 35 points for
 * scrubbing to the end; if it under-counts, honest listeners never reach 75%.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useMediaBeats, FLUSH_AFTER_S, MAX_TICK_DELTA_S, type WatchBeatPayload } from '../useMediaBeats';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let handlers: ReturnType<typeof useMediaBeats>;
const Harness: React.FC<{ onBeat: (b: WatchBeatPayload) => void }> = ({ onBeat }) => {
  handlers = useMediaBeats(onBeat, 'audio');
  return null;
};

let container: HTMLDivElement;
let root: Root;
let beats: WatchBeatPayload[];

/** A synthetic timeupdate from a media element at `t` seconds of `dur`. */
const tick = (t: number, dur = 600, paused = false) =>
  handlers.onTimeUpdate({ currentTarget: { currentTime: t, duration: dur, paused } } as any);

beforeEach(() => {
  beats = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); root.render(<Harness onBeat={(b) => beats.push(b)} />); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

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
  tick(500);                  // scrubbed 499s ahead — a jump past MAX_TICK_DELTA_S
  expect(MAX_TICK_DELTA_S).toBeLessThan(499);
  handlers.flush();
  // Only the 1 real second counts; the 499 does not.
  expect(beats).toHaveLength(1);
  expect(beats[0].delta_s).toBeLessThanOrEqual(1.5);
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
