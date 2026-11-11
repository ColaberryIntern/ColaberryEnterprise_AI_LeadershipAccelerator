import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ColaberryTv, { __resetTvLengthsForTests } from '../now/ColaberryTv';
import { applyOrder, follow, mmss, nextIndex, prevIndex, readLastFirst, saveLastFirst, shuffleOrder, type TvShort } from '../now/tvPlaylist';
import { AUTOPLAY_CHECK_MS, embedSrc } from '../now/useTvChannel';
import { readYtMessage, YT_STATE, ytCommand, ytHandshake } from '../../../utils/youtubeChannel';

/**
 * Campus v20 N2 (C132): Colaberry TV. Always on while Colaberry Now is open, one short after another, looping; driven over the embed's
 * postMessage channel (the CSP blocks YouTube's script). Closing stops it for real: the frame goes to about:blank.
 */
const short = (n: number, extra: Partial<TvShort> = {}): TvShort =>
  ({ id: `id-${n}`, youtube_id: `yt_short_0${n}`.slice(0, 11), title: `Short ${n}`, duration_s: null, created_at: '2026-11-11T15:00:00Z', ...extra });
const LIST = [short(1), short(2), short(3)];
const YT = 'https://www.youtube-nocookie.com';
const send = (data: unknown, origin = YT) => act(() => { window.dispatchEvent(new MessageEvent('message', { origin, data: JSON.stringify(data) })); });
const frame = () => screen.getByTestId('cn-tv-frame') as HTMLIFrameElement;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// A minimal render kit (this repo's campus tests use react-dom directly; there is no testing-library).
let container: HTMLDivElement;
let root: Root | null;
function render(el: React.ReactElement): { rerender: (e: React.ReactElement) => void; unmount: () => void } {
  act(() => { root!.render(el); });
  return { rerender: (e) => act(() => { root!.render(e); }), unmount: () => { act(() => root!.unmount()); root = null; } };
}
const screen = {
  getByTestId: (id: string): HTMLElement => { const e = container.querySelector('[data-testid="' + id + '"]'); if (!e) throw new Error('no ' + id); return e as HTMLElement; },
  queryByTestId: (id: string): HTMLElement | null => container.querySelector('[data-testid="' + id + '"]'),
  getAllByTestId: (id: string): HTMLElement[] => Array.from(container.querySelectorAll('[data-testid="' + id + '"]')),
  getByText: (t: string): HTMLElement => { const e = Array.from(container.querySelectorAll('*')).find((x) => x.textContent === t && !Array.from(x.children).some((c) => c.textContent === t)); if (!e) throw new Error('no text ' + t); return e as HTMLElement; },
};
const fireEvent = {
  click: (e: Element) => act(() => { (e as HTMLElement).click(); }),
  load: (e: Element) => act(() => { e.dispatchEvent(new Event('load')); }),
};
beforeEach(() => {
  __resetTvLengthsForTests(); window.sessionStorage.clear();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { if (root) act(() => root!.unmount()); root = null; container.remove(); });

describe('the YouTube channel (pure)', () => {
  it('reads state changes and info deliveries from YouTube only', () => {
    expect(readYtMessage({ origin: YT, data: '{"event":"onStateChange","info":0}' })).toEqual({ state: YT_STATE.ENDED });
    expect(readYtMessage({ origin: 'https://www.youtube.com', data: { event: 'infoDelivery', info: { playerState: 1, currentTime: 3, duration: 42.2, muted: true } } }))
      .toEqual({ state: 1, currentTime: 3, duration: 42.2, muted: true });
    expect(readYtMessage({ origin: YT, data: '{"event":"onReady"}' })).toEqual({ ready: true });
  });
  it.each([
    ['another origin', { origin: 'https://evil.test', data: '{"event":"onStateChange","info":0}' }],
    ['a lookalike origin', { origin: 'https://www.youtube.com.evil.test', data: '{"event":"onStateChange","info":0}' }],
    ['junk', { origin: YT, data: 'not json' }],
    ['another event', { origin: YT, data: '{"event":"apiInfoDelivery"}' }],
    ['no origin', { data: '{"event":"onStateChange","info":0}' }],
  ])('ignores %s', (_n, ev) => { expect(readYtMessage(ev)).toBeNull(); });
  it('builds the handshake and commands', () => {
    expect(JSON.parse(ytHandshake())).toEqual({ event: 'listening', id: 1, channel: 'widget' });
    expect(JSON.parse(ytCommand('mute'))).toEqual({ event: 'command', func: 'mute', args: [] });
  });
  it('the embed is youtube-nocookie with the JS API on, autoplaying, muted only when asked', () => {
    const s = embedSrc('Pa5J5T6MZok', false, 'https://enterprise.colaberry.ai');
    expect(s).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/Pa5J5T6MZok\?/);
    expect(s).toContain('enablejsapi=1');
    expect(s).toContain('autoplay=1');
    expect(s).not.toContain('mute=1');
    expect(embedSrc('Pa5J5T6MZok', true, 'x')).toContain('mute=1');
    expect(embedSrc(null, false, 'x')).toBe('about:blank');
  });
});

describe('the play order (pure)', () => {
  it('loops both ways', () => {
    expect([nextIndex(0, 3), nextIndex(2, 3), prevIndex(0, 3), nextIndex(0, 0)]).toEqual([1, 0, 2, 0]);
  });
  it('follows a playlist change: the playing short stays; a removed one moves to the next still on air', () => {
    expect(follow(LIST, [LIST[2], LIST[1]], 'id-2')).toEqual({ index: 1, moved: false });
    expect(follow(LIST, [LIST[0], LIST[2]], 'id-2')).toEqual({ index: 1, moved: true });
    expect(follow(LIST, [LIST[0]], 'id-3')).toEqual({ index: 0, moved: true });
    expect(follow(LIST, [], 'id-1')).toEqual({ index: 0, moved: true });
  });
  it('a length is shown only when known', () => {
    expect([mmss(42), mmss(61.4), mmss(null), mmss(0)]).toEqual(['0:42', '1:01', '', '']);
  });
});

describe('C137: full screen for events', () => {
  // jsdom has no Fullscreen API: a small stand-in that behaves like the browser's (sets fullscreenElement, fires fullscreenchange)
  let fsEl: Element | null = null;
  const fire = () => document.dispatchEvent(new Event('fullscreenchange'));
  const install = (enabled: boolean) => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsEl });
    (HTMLElement.prototype as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = jest.fn(function (this: HTMLElement) { fsEl = this; fire(); return Promise.resolve(); });
    (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = jest.fn(() => { fsEl = null; fire(); return Promise.resolve(); });
  };
  afterEach(() => { fsEl = null; });

  it('no full-screen support (iPhone Safari): no button, rather than a broken one', () => {
    install(false);
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    expect(screen.queryByTestId('cn-tv-fullscreen')).toBeNull();
  });

  it('the button puts OUR player box full screen; the shorts keep advancing by themselves; Exit leaves it', () => {
    install(true);
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.click(screen.getByTestId('cn-tv-fullscreen'));
    expect(fsEl).toBe(screen.getByTestId('cn-tv-vid'));
    expect(screen.getByTestId('cn-tv-fullscreen').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('cn-tv-vid').contains(frame())).toBe(true);
    send({ event: 'onStateChange', info: 0 });
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 2');
    expect(fsEl).toBe(screen.getByTestId('cn-tv-vid')); // still full screen on the next short
    fireEvent.click(screen.getByTestId('cn-tv-fs-exit'));
    expect(fsEl).toBeNull();
    expect(screen.queryByTestId('cn-tv-fs-exit')).toBeNull();
  });

  it('a refused request is logged and changes nothing', async () => {
    install(true);
    (HTMLElement.prototype as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = jest.fn(() => Promise.reject(Object.assign(new Error('no gesture'), { name: 'TypeError' })));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.click(screen.getByTestId('cn-tv-fullscreen'));
    await act(async () => { await Promise.resolve(); });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('colaberry_tv_fullscreen_failed'));
    expect(screen.queryByTestId('cn-tv-fs-exit')).toBeNull();
    warn.mockRestore();
  });
});

describe('C136: a shuffled order per opening', () => {
  const IDS = ['a', 'b', 'c', 'd', 'e'];
  it('is a permutation (every short once per loop)', () => {
    for (let n = 0; n < 50; n++) expect([...shuffleOrder(IDS, null)].sort()).toEqual(IDS);
  });
  it('never starts on last time\'s first short, even when the shuffle lands on it', () => {
    const stuck = () => 0.99; // Fisher-Yates leaves the order as is, so 'a' would lead again
    expect(shuffleOrder(IDS, null, stuck)[0]).toBe('a');
    expect(shuffleOrder(IDS, 'a', stuck)[0]).not.toBe('a');
    for (let n = 0; n < 200; n++) expect(shuffleOrder(IDS, 'c')[0]).not.toBe('c');
  });
  it('one short: it plays; none: nothing', () => {
    expect(shuffleOrder(['a'], 'a')).toEqual(['a']);
    expect(shuffleOrder([], 'a')).toEqual([]);
  });
  it('applyOrder keeps this opening\'s order and puts a newly added short at the end', () => {
    const v = (id: string) => ({ id });
    expect(applyOrder([v('a'), v('b'), v('c'), v('new')], ['c', 'a', 'b']).map((x) => x.id)).toEqual(['c', 'a', 'b', 'new']);
    expect(applyOrder([v('a'), v('c')], ['c', 'b', 'a']).map((x) => x.id)).toEqual(['c', 'a']);
  });
  it('remembers the first short across visits', () => {
    window.localStorage.clear();
    expect(readLastFirst()).toBeNull();
    saveLastFirst('b');
    expect(readLastFirst()).toBe('b');
  });
});

describe('<ColaberryTv />', () => {
  it('starts playing the first short when it opens, with sound, and counts "1 OF 3 · LOOPS"', () => {
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    expect(frame().src).toContain(`/embed/${LIST[0].youtube_id}`);
    expect(frame().src).toContain('autoplay=1');
    expect(frame().src).not.toContain('mute=1');
    expect(screen.getByTestId('cn-tv-count').textContent).toBe('1 OF 3 · LOOPS');
  });

  it('ENDED plays the next short, and after the last it loops to the first', () => {
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    send({ event: 'onStateChange', info: 0 });
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 2');
    send({ event: 'onStateChange', info: 0 });
    send({ event: 'onStateChange', info: 0 });
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 1');
    send({ event: 'onStateChange', info: 0 }, 'https://evil.test');
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 1');
  });

  it('▼, ▲ and the reel change the short; the current reel item is marked', () => {
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.click(screen.getByTestId('cn-tv-next'));
    expect(frame().src).toContain(LIST[1].youtube_id);
    fireEvent.click(screen.getByTestId('cn-tv-prev'));
    fireEvent.click(screen.getByTestId('cn-tv-prev'));
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 3');
    fireEvent.click(screen.getAllByTestId('cn-tv-reel-item')[1]);
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 2');
    expect(screen.getAllByTestId('cn-tv-reel-item')[1].getAttribute('aria-current')).toBe('true');
  });

  it('closing stops it: the frame goes to about:blank and no timer is left', () => {
    jest.useFakeTimers();
    const { unmount } = render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    const f = frame();
    fireEvent.load(f);
    unmount();
    expect(f.getAttribute('src')).toBe('about:blank');
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('if the browser blocks sound, it restarts muted and asks "Tap for sound"; the tap brings sound back', () => {
    jest.useFakeTimers();
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.load(frame());
    act(() => { jest.advanceTimersByTime(AUTOPLAY_CHECK_MS + 10); });
    expect(frame().src).toContain('mute=1');
    fireEvent.click(screen.getByTestId('cn-tv-tap'));
    expect(frame().src).not.toContain('mute=1');
    expect(screen.queryByTestId('cn-tv-tap')).toBeNull();
    jest.useRealTimers();
  });

  it('playing in time means no tap is asked for', () => {
    jest.useFakeTimers();
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.load(frame());
    send({ event: 'infoDelivery', info: { playerState: 1 } });
    act(() => { jest.advanceTimersByTime(AUTOPLAY_CHECK_MS + 10); });
    expect(screen.queryByTestId('cn-tv-tap')).toBeNull();
    jest.useRealTimers();
  });

  it('mute is remembered for the visit and does not reload the short', () => {
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    const before = frame().src;
    fireEvent.click(screen.getByTestId('cn-tv-mute'));
    expect(window.sessionStorage.getItem('cm-tv-muted')).toBe('1');
    expect(frame().src).toBe(before);
    fireEvent.click(screen.getByTestId('cn-tv-next'));
    expect(frame().src).toContain('mute=1');
  });

  it('no length text until the player reports one', () => {
    render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    expect(screen.getByText('the next one plays by itself')).toBeTruthy();
    send({ event: 'infoDelivery', info: { duration: 42.3 } });
    expect(screen.getByText('0:42 · the next one plays by itself')).toBeTruthy();
  });

  it('Manage TV only with can_manage; an empty playlist says so', () => {
    const onManage = jest.fn();
    const { rerender } = render(<ColaberryTv videos={LIST} canManage={false} onManage={onManage} />);
    expect(screen.queryByTestId('cn-tv-manage')).toBeNull();
    rerender(<ColaberryTv videos={LIST} canManage onManage={onManage} />);
    fireEvent.click(screen.getByTestId('cn-tv-manage'));
    expect(onManage).toHaveBeenCalled();
    rerender(<ColaberryTv videos={[]} canManage={false} onManage={onManage} />);
    expect(screen.getByTestId('cn-tv-empty')).toBeTruthy();
  });

  it('follows the playlist: when the playing short is removed the TV moves to the next one', () => {
    const { rerender } = render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.click(screen.getByTestId('cn-tv-next'));
    rerender(<ColaberryTv videos={[LIST[0], LIST[2]]} canManage={false} onManage={jest.fn()} />);
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 3');
  });

  it('a reorder keeps the playing short playing (independent verifier, T3 attempt 1)', () => {
    const { rerender } = render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.click(screen.getByTestId('cn-tv-next'));
    const src = frame().src;
    rerender(<ColaberryTv videos={[LIST[1], LIST[0], LIST[2]]} canManage={false} onManage={jest.fn()} />);
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 2');
    expect(frame().src).toBe(src);
    expect(screen.getByTestId('cn-tv-count').textContent).toBe('1 OF 3 · LOOPS');
  });

  it('removing a short BEFORE the playing one keeps the playing short playing', () => {
    const { rerender } = render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.click(screen.getByTestId('cn-tv-next'));
    rerender(<ColaberryTv videos={[LIST[1], LIST[2]]} canManage={false} onManage={jest.fn()} />);
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 2');
  });

  it('a fresh copy of the same list (the 30 s poll) changes nothing', () => {
    const { rerender } = render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} />);
    fireEvent.click(screen.getByTestId('cn-tv-next'));
    fireEvent.click(screen.getByTestId('cn-tv-next'));
    rerender(<ColaberryTv videos={LIST.map((s) => ({ ...s }))} canManage={false} onManage={jest.fn()} />);
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 3');
  });

  it('restart jumps back to the first short', () => {
    const { rerender } = render(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} restart={0} />);
    fireEvent.click(screen.getByTestId('cn-tv-next'));
    rerender(<ColaberryTv videos={LIST} canManage={false} onManage={jest.fn()} restart={1} />);
    expect(screen.getByTestId('cn-tv-title').textContent).toBe('Short 1');
  });
});
