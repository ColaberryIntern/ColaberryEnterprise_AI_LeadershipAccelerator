/**
 * The player starts where the student left off.
 *
 * Reported by the QA tester 2026-11-24: reopening a part-watched video always
 * started it from zero. The server had been storing the furthest playhead on
 * every watch beat since the gate shipped, and the player had never read it.
 *
 * A direct file is seeked once metadata has loaded; a cross-origin iframe takes
 * its start point in the URL, because the channel this app speaks to YouTube is
 * receive-only and there is no seek call to make.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import VideoEmbed from '../VideoEmbed';
import { parseVideoUrl } from '../../../utils/videoEmbed';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const fileSource = parseVideoUrl('/media/week4/class.mp4');
const ytSource = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
const loomSource = parseVideoUrl('https://www.loom.com/share/0123456789abcdef0123456789abcdef');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = async (props: Record<string, unknown>) => {
  await act(async () => {
    root.render(<VideoEmbed source={fileSource} title="Week 4 class" autoplay onWatchBeat={() => {}} {...props} />);
  });
};

/**
 * The element's seek, observed. jsdom implements no media pipeline, so
 * `currentTime` is replaced with a recording accessor and metadata arrival is
 * dispatched by hand - exactly as the sibling exit-beat suite does.
 */
function watchSeeks(durationS: number): { at: () => number | null } {
  const el = container.querySelector('video') as HTMLVideoElement;
  let seekedTo: number | null = null;
  Object.defineProperty(el, 'currentTime', {
    configurable: true, get: () => seekedTo ?? 0, set: (v: number) => { seekedTo = v; },
  });
  Object.defineProperty(el, 'duration', { configurable: true, value: durationS });
  Object.defineProperty(el, 'readyState', { configurable: true, value: 1 });  // HAVE_METADATA
  act(() => { el.dispatchEvent(new Event('loadedmetadata')); });
  return { at: () => seekedTo };
}

describe('a direct file', () => {
  it('starts at the stored second', async () => {
    await render({ resumeAtS: 612, resumeDurationS: 1200 });
    expect(watchSeeks(1200).at()).toBe(612);
  });

  it('starts at the beginning when there is nothing stored', async () => {
    await render({ resumeAtS: null, resumeDurationS: 1200 });
    expect(watchSeeks(1200).at()).toBeNull();
  });

  it('starts at the beginning for a video they already finished', async () => {
    // A completed card has to stay rewatchable; dropping someone on the closing
    // seconds of their own finished video reads as broken.
    await render({ resumeAtS: 1198, resumeDurationS: 1200 });
    expect(watchSeeks(1200).at()).toBeNull();
  });

  it('trusts the player\'s own duration over the server\'s when they disagree', async () => {
    // The server thinks this clip is an hour, so 1198s looks like the middle.
    // The element says 1200s, which makes it the end - and the element is right.
    await render({ resumeAtS: 1198, resumeDurationS: 3600 });
    expect(watchSeeks(1200).at()).toBeNull();
  });

  it('seeks once, so a student who scrubs away is not dragged back', async () => {
    await render({ resumeAtS: 612, resumeDurationS: 1200 });
    const el = container.querySelector('video') as HTMLVideoElement;
    const seeks = watchSeeks(1200);
    expect(seeks.at()).toBe(612);
    // They scrub to the start themselves, then the element reloads metadata.
    (el as any).currentTime = 0;
    act(() => { el.dispatchEvent(new Event('loadedmetadata')); });
    expect(seeks.at()).toBe(0);
  });
});

describe('an iframe provider', () => {
  const iframeSrc = () => (container.querySelector('iframe') as HTMLIFrameElement).getAttribute('src') || '';

  it('asks YouTube to start at the stored second', async () => {
    await render({ source: ytSource, resumeAtS: 612, resumeDurationS: 1200 });
    expect(iframeSrc()).toContain('start=612');
  });

  it('keeps the JS-API parameters that make watch tracking work', async () => {
    await render({ source: ytSource, resumeAtS: 612, resumeDurationS: 1200 });
    expect(iframeSrc()).toContain('enablejsapi=1');
    expect(iframeSrc()).toContain('origin=');
  });

  it('adds no start point when there is nothing to resume to', async () => {
    await render({ source: ytSource, resumeAtS: null, resumeDurationS: 1200 });
    expect(iframeSrc()).not.toContain('start=');
  });

  it('adds no start point for a video they already finished', async () => {
    await render({ source: ytSource, resumeAtS: 1195, resumeDurationS: 1200 });
    expect(iframeSrc()).not.toContain('start=');
  });

  it('leaves a provider with no start parameter alone rather than guessing', async () => {
    await render({ source: loomSource, resumeAtS: 612, resumeDurationS: 1200 });
    const src = iframeSrc();
    expect(src).toContain('loom.com');
    expect(src).not.toContain('start=');
    expect(src).not.toContain('#t=');
  });

  it('picks up a resume point that arrives after the player mounted', async () => {
    // The drawer autoplays immediately and fetches its verdict in parallel, so
    // the position routinely lands a moment after the iframe is already there.
    await render({ source: ytSource, resumeAtS: null, resumeDurationS: null });
    expect(iframeSrc()).not.toContain('start=');
    await render({ source: ytSource, resumeAtS: 612, resumeDurationS: 1200 });
    expect(iframeSrc()).toContain('start=612');
  });

  it('does not reload the player when a later verdict repeats itself', async () => {
    await render({ source: ytSource, resumeAtS: 612, resumeDurationS: 1200 });
    const first = iframeSrc();
    // A beat response arrives carrying a position further along. Re-pointing the
    // iframe here would restart playback underneath the student.
    await render({ source: ytSource, resumeAtS: 900, resumeDurationS: 1200 });
    expect(iframeSrc()).toBe(first);
  });
});
