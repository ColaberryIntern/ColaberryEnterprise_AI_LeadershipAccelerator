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

/** The window of the component's OWN iframe. VideoEmbed now ignores a player that is not this
 *  one, so every message a test sends has to claim to come from here or it is correctly dropped. */
const ownWindow = (): Window => {
  const el = container.querySelector('iframe');
  if (!el?.contentWindow) throw new Error('iframe is not mounted, so there is no own window to post from');
  return el.contentWindow;
};

/** One YouTube infoDelivery message, one second of wall clock after the previous one. */
const tick = (positionS: number, from: Window | null = null) => {
  now += 1000;
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      source: from ?? ownWindow(),
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

/**
 * The second half of the same bug, found in production on 20 Nov 2026 by Swati Raman after the
 * loop fix shipped. The origin check passes for EVERY YouTube player on the page, so a card
 * showing two players had each tracker counting the other's playback too: watch time credited at
 * roughly 2x real play (158s watched, 324s credited), and up to 3.5x once the players drifted.
 * The direction of the fault had flipped -- progress was no longer destroyed, it was inflated,
 * and a learner could pass the 75% gate without watching 75%.
 */
describe('a tracker counts only its own player', () => {
  /** A DIFFERENT YouTube player on the same page, which must not feed this component. */
  const otherPlayer = (): Window => {
    const el = document.createElement('iframe');
    document.body.appendChild(el);
    if (!el.contentWindow) throw new Error('the second iframe has no contentWindow');
    return el.contentWindow;
  };

  it('ignores time updates posted by another player on the page', () => {
    render((b) => { beats.push(b); });
    const other = otherPlayer();

    // Well past the 15s flush threshold. Every one of these carries a correct YouTube origin and
    // a well-formed infoDelivery payload: the ONLY thing wrong with them is who sent them.
    for (let t = 0; t <= 40; t += 1) tick(t, other);

    expect(beats).toHaveLength(0);
  });

  it('still credits its own player, so the filter is not simply dropping everything', () => {
    render((b) => { beats.push(b); });
    const other = otherPlayer();

    // Interleaved, the way two players on one card actually behave.
    for (let t = 0; t <= 20; t += 1) { tick(t, other); tick(t); }

    // Exactly one player's worth of time, not two. Before the fix this credited both streams.
    expect(beats.length).toBeGreaterThanOrEqual(1);
    const credited = beats.reduce((n, b) => n + b.delta_s, 0);
    expect(credited).toBeLessThanOrEqual(21);
  });
});
