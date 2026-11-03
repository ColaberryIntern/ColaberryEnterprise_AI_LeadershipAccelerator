/**
 * C107 (C98 recommendation 3): a Today card is recorded as seen once it is at least half on screen, once per visit,
 * in batches. Uses a controllable IntersectionObserver so the test decides what is "on screen".
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useSeenTracker, FLUSH_MS } from '../useSeenTracker';
import { todayFeedApi } from '../todayFeedApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let callback: IntersectionObserverCallback | null = null;
const observed = new Set<Element>();
class ControlledObserver {
  constructor(cb: IntersectionObserverCallback) { callback = cb; }
  observe = (el: Element) => { observed.add(el); };
  unobserve = (el: Element) => { observed.delete(el); };
  disconnect = () => { observed.clear(); };
  takeRecords = () => [];
  root = null; rootMargin = ''; thresholds = [0.5];
}
function show(el: Element, ratio = 0.6) {
  act(() => { callback!([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver); });
}

function Feed({ refs, enabled = true }: { refs: string[]; enabled?: boolean }) {
  const track = useSeenTracker(enabled);
  return <div>{refs.map((r) => <div key={r} ref={track(r)} data-ref={r} />)}</div>;
}

let container: HTMLDivElement;
let root: Root;
let send: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  (global as unknown as { IntersectionObserver: unknown }).IntersectionObserver = ControlledObserver;
  callback = null; observed.clear();
  send = jest.spyOn(todayFeedApi, 'events').mockResolvedValue({ ok: true, recorded: 1 });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); send.mockRestore(); jest.useRealTimers(); });
const el = (ref: string) => container.querySelector(`[data-ref="${ref}"]`)!;

it('observes cards mounted before the observer existed', () => {
  act(() => { root.render(<Feed refs={['card:a', 'card:b']} />); });
  expect(observed.has(el('card:a'))).toBe(true);
  expect(observed.has(el('card:b'))).toBe(true);
});

it('records a card at least half on screen, batched after the flush delay', () => {
  act(() => { root.render(<Feed refs={['card:a', 'card:b', 'card:c']} />); });
  show(el('card:a'));
  show(el('card:b'));
  show(el('card:c'), 0.2); // a sliver is not "seen"
  expect(send).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(FLUSH_MS); });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith([
    { ref: 'card:a', event: 'seen', source: 'feed' },
    { ref: 'card:b', event: 'seen', source: 'feed' },
  ]);
});

it('records each card once per visit, however often it scrolls past', () => {
  act(() => { root.render(<Feed refs={['card:a']} />); });
  show(el('card:a'));
  show(el('card:a'));
  act(() => { jest.advanceTimersByTime(FLUSH_MS); });
  show(el('card:a'));
  act(() => { jest.advanceTimersByTime(FLUSH_MS); });
  expect(send).toHaveBeenCalledTimes(1);
});

it('sends what is queued when the visit ends', () => {
  act(() => { root.render(<Feed refs={['card:a']} />); });
  show(el('card:a'));
  act(() => root.unmount());
  expect(send).toHaveBeenCalledWith([{ ref: 'card:a', event: 'seen', source: 'feed' }]);
  root = createRoot(container);
});

it('a failed send is dropped quietly', async () => {
  send.mockRejectedValueOnce(new Error('offline'));
  act(() => { root.render(<Feed refs={['card:a']} />); });
  show(el('card:a'));
  await act(async () => { jest.advanceTimersByTime(FLUSH_MS); });
  expect(send).toHaveBeenCalledTimes(1);
});

it('records nothing while disabled, or with no IntersectionObserver at all', () => {
  act(() => { root.render(<Feed refs={['card:a']} enabled={false} />); });
  expect(callback).toBeNull();
  delete (global as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  act(() => { root.render(<Feed refs={['card:a', 'card:b']} />); });
  act(() => { jest.advanceTimersByTime(FLUSH_MS); });
  expect(send).not.toHaveBeenCalled();
});
