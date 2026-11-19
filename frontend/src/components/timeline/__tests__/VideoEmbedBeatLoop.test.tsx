/**
 * The save loop that discarded watch progress (19 Nov 2026, reported by Swati Raman).
 *
 * VideoEmbed's iframe effect listed `onWatchBeat` in its dependency array, and its cleanup
 * FLUSHES a beat. TimelineCard passed an inline arrow, so the callback's identity changed on
 * every render of the card -- which tore the effect down, re-ran the provider handshake, and
 * emitted a beat, that often. Those beats then met an IP-keyed rate limiter whose key was the
 * Cloudflare edge rather than the learner, so the ones that lost the race were rejected; and
 * because the client clears its buffer BEFORE it sends, the seconds in a rejected beat were
 * destroyed rather than retried. Learners could not reach 75% on video cards.
 *
 * These tests pin all three halves of the fix: the effect no longer depends on the callback's
 * identity, it still reacts to tracking being switched on, and a rejected send puts the seconds
 * back instead of losing them.
 *
 * The native <video> path is covered by VideoEmbedExitBeat.test.tsx. This file deliberately uses
 * a YOUTUBE source, because the defect lives in the iframe branch and a file source never
 * executes it.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import VideoEmbed, { type WatchBeatPayload } from '../VideoEmbed';
import { parseVideoUrl } from '../../../utils/videoEmbed';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const source = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

let container: HTMLDivElement;
let root: Root;
let beats: WatchBeatPayload[];
let now: number;
let nowSpy: jest.SpyInstance;

/** One YouTube infoDelivery message, one second of wall clock after the previous one. */
const tick = (positionS: number) => {
  now += 1000;
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: positionS, duration: 600, playerState: 1 },
      }),
    }));
  });
};
/** Play from `from` to `to` seconds, one sample a second, so the clock never limits credit. */
const play = (from: number, to: number) => { for (let t = from; t <= to; t += 1) tick(t); };

const render = (onWatchBeat?: (b: WatchBeatPayload) => void | Promise<unknown>) => {
  act(() => {
    root.render(<VideoEmbed source={source} title="Lesson" autoplay onWatchBeat={onWatchBeat} />);
  });
};

beforeEach(() => {
  beats = [];
  now = 1_700_000_000_000;
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  nowSpy.mockRestore();
});

it('uses the iframe path, which is where the defect lives', () => {
  expect(source?.kind).toBe('iframe');
  expect(source?.provider).toBe('youtube');
});

it('a re-render with a brand new callback identity does not emit a beat', () => {
  // A fresh arrow every render is exactly what TimelineCard used to pass.
  render((b) => { beats.push(b); });
  play(0, 8);                       // 8s buffered, under the 15s flush threshold
  expect(beats).toHaveLength(0);

  for (let i = 0; i < 5; i += 1) render((b) => { beats.push(b); });

  // Before the fix each of these re-renders tore the effect down and flushed, so this was 5
  // beats carrying slivers of watch time -- 5 POSTs for 8 seconds of video.
  expect(beats).toHaveLength(0);
});

it('still flushes normally once enough play time accumulates', () => {
  render((b) => { beats.push(b); });
  play(0, 20);
  expect(beats).toHaveLength(1);
  expect(beats[0].provider).toBe('youtube');
  expect(beats[0].delta_s).toBeGreaterThanOrEqual(15);
});

it('still reacts when tracking is switched on, which is the only change the effect must notice', () => {
  render(undefined);                // admin preview: no tracking at all
  play(0, 20);
  expect(beats).toHaveLength(0);

  render((b) => { beats.push(b); }); // tracking appears -> the effect must start listening
  play(21, 41);
  expect(beats.length).toBeGreaterThanOrEqual(1);
});

it('re-credits the buffered seconds when the send is rejected, instead of destroying them', async () => {
  // The limiter used to reject beats that lost a race against every other learner on the same
  // Cloudflare PoP. A rejected beat must not cost the learner the time they actually watched.
  let failNext = true;
  render((b) => {
    beats.push(b);
    if (failNext) { failNext = false; return Promise.reject(new Error('429')); }
    return Promise.resolve();
  });

  play(0, 20);
  expect(beats).toHaveLength(1);
  const lost = beats[0].delta_s;
  expect(lost).toBeGreaterThanOrEqual(15);

  await act(async () => { await Promise.resolve(); });  // let the rejection handler run

  // Only a little more playback, far under the flush threshold on its own. It flushes anyway
  // because the re-credited seconds are back in the buffer, and the beat carries them.
  play(21, 24);
  expect(beats).toHaveLength(2);
  expect(beats[1].delta_s).toBeGreaterThanOrEqual(lost);
});
