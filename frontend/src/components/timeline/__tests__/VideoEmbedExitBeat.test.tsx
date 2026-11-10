/**
 * C119: a learner who closes the tab, backgrounds the app or locks the phone mid-video must still be recorded, at the
 * point they left. Before this, React cleanup never ran on unload, so up to 15 seconds of watch time was lost and a
 * learner who left in the first 15 seconds was not recorded at all. The exit beat carries `{ exiting: true }` so the
 * caller sends it as a keepalive request; ordinary beats stay one-argument, exactly as before.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import VideoEmbed, { type WatchBeatPayload, type WatchBeatMeta } from '../VideoEmbed';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import { keepaliveConfig } from '../../../utils/portalApi';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let calls: Array<[WatchBeatPayload, WatchBeatMeta | undefined, number]>;   // beat, meta, argument count
let visibility: DocumentVisibilityState;

const source = parseVideoUrl('/media/welcome/ali-avatar-welcome-v1.mp4');
/** Records each beat with its argument count, so a test can prove ordinary beats stay one-argument. */
function onBeatCounting(this: unknown, ...args: [WatchBeatPayload, WatchBeatMeta?]) {
  calls.push([args[0], args[1], args.length]);
}

const video = () => container.querySelector('video') as HTMLVideoElement;
/** One native timeupdate at `t` seconds of a 109-second video, as the browser fires it while playing. */
const tick = (t: number) => {
  const el = video();
  Object.defineProperty(el, 'currentTime', { configurable: true, value: t });
  Object.defineProperty(el, 'duration', { configurable: true, value: 109 });
  act(() => { el.dispatchEvent(new Event('timeupdate')); });
};
const play = (from: number, to: number) => { for (let t = from; t <= to; t += 0.5) tick(t); };
const hide = () => { visibility = 'hidden'; act(() => { document.dispatchEvent(new Event('visibilitychange')); }); };
const pagehide = () => act(() => { window.dispatchEvent(new Event('pagehide')); });

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
beforeEach(() => {
  calls = [];
  visibility = 'visible';
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<VideoEmbed source={source} title="Welcome" autoplay onWatchBeat={onBeatCounting} />);
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it('renders the self-hosted welcome video as a native player', () => {
  expect(source?.kind).toBe('file');
  expect(video()).not.toBeNull();
});

it('closing the tab sends the watch time buffered since the last beat, at the exit point, marked exiting', () => {
  play(0, 8);   // under FLUSH_AFTER_S: before C119, nothing was ever sent for this learner
  expect(calls).toHaveLength(0);
  pagehide();
  expect(calls).toHaveLength(1);
  const [beat, meta] = calls[0];
  expect(meta).toEqual({ exiting: true });
  expect(beat.position_s).toBe(8);
  expect(beat.delta_s).toBeCloseTo(8, 0);
  expect(beat.duration_s).toBe(109);
  expect(beat.provider).toBe('file');
});

it('backgrounding the app or locking the phone (visibility hidden) is an exit too', () => {
  play(0, 20);   // one ordinary beat at 15 s, then 5 more seconds buffered
  hide();
  expect(calls).toHaveLength(2);
  expect(calls[1][1]).toEqual({ exiting: true });
  expect(calls[1][0].position_s).toBe(20);
});

it('never double-sends when both visibilitychange and pagehide fire on the way out', () => {
  play(0, 6);
  hide();
  pagehide();
  expect(calls).toHaveLength(1);
});

it('keeps ordinary beats exactly as before: one argument, no exit flag', () => {
  play(0, 16);
  expect(calls).toHaveLength(1);
  expect(calls[0][2]).toBe(1);
  expect(calls[0][1]).toBeUndefined();
});

it('a pause that arrives after the page is hidden is sent as an exit', () => {
  play(0, 6);
  visibility = 'hidden';   // hidden first, with no visibilitychange handler run yet (browser event order varies)
  act(() => { video().dispatchEvent(new Event('pause')); });
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toEqual({ exiting: true });
});

it('a pause while the page is visible stays an ordinary beat', () => {
  play(0, 6);
  act(() => { video().dispatchEvent(new Event('pause')); });
  expect(calls).toHaveLength(1);
  expect(calls[0][2]).toBe(1);
});

it('stops listening once the player is gone', () => {
  play(0, 6);
  act(() => root.render(<div />));
  const before = calls.length;
  pagehide();
  hide();
  expect(calls).toHaveLength(before);
});

describe('keepaliveConfig', () => {
  it('sends an exit as a keepalive fetch, which outlives the page and keeps the auth header', () => {
    expect(keepaliveConfig(true)).toEqual({ adapter: 'fetch', fetchOptions: { keepalive: true } });
  });
  it('leaves ordinary calls on the default adapter', () => {
    expect(keepaliveConfig(false)).toBeUndefined();
    expect(keepaliveConfig(undefined)).toBeUndefined();
  });
});
