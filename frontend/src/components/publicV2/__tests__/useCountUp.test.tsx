/**
 * useCountUp.test.tsx
 *
 * THE DEFECT THIS SUITE EXISTS FOR.
 *
 * The hook carried a 2.5s "backstop" that finished the count that long after
 * MOUNT, unconditionally, so a figure could never be left sitting at zero. The
 * accolade band sits about 3,200px below the fold, so the timer always beat a
 * human scrolling down to it: by the time the numbers were on screen they had
 * already settled, and the animation effectively did not exist. Measured on
 * production before the fix -- every figure reported `data-settled="true"` while
 * still 3,200px below the viewport.
 *
 * A backstop that cannot tell "the observer is broken" from "the reader has not
 * scrolled here yet" resolves that ambiguity the wrong way every time. It now
 * only rescues a figure that is genuinely ON SCREEN and still at zero.
 *
 * Uses createRoot + act rather than @testing-library, which is not a dependency
 * of this repo -- the same pattern as HomeV2.test.tsx.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import useCountUp, { type CountUp } from '../useCountUp';

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let lastCallback: IOCallback | null = null;
let disconnected = 0;
let latest: CountUp | null = null;

class FakeIO {
  constructor(cb: IOCallback) { lastCallback = cb; }

  observe(): void { /* intersection is driven explicitly by the test */ }

  disconnect(): void { disconnected += 1; }

  unobserve(): void { /* unused */ }
}

function Probe({ text }: { text: string }): React.ReactElement {
  const c = useCountUp(text);
  latest = c;
  return <p ref={c.ref as React.RefObject<HTMLParagraphElement>}>{c.display}</p>;
}

let container: HTMLElement;
let root: Root;

/** Places the hook's element on or off screen for the backstop's rect check. */
function setRect(onScreen: boolean): void {
  Element.prototype.getBoundingClientRect = function rect(): DOMRect {
    return (onScreen ? { top: 100, bottom: 200 } : { top: 3200, bottom: 3400 }) as DOMRect;
  };
}

function mount(text: string): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<Probe text={text} />); });
}

beforeEach(() => {
  jest.useFakeTimers();
  lastCallback = null;
  disconnected = 0;
  latest = null;
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
  jest.useRealTimers();
});

describe('useCountUp', () => {
  it('starts at zero and has not settled before the figure is seen', () => {
    setRect(false);
    mount('2,500+ certified');

    expect(latest?.display).toBe('0+ certified');
    expect(latest?.settled).toBe(false);
  });

  /**
   * The regression itself. Off screen, the backstop must re-arm rather than
   * finish -- even after many times its own interval.
   */
  it('does NOT finish while the figure is still below the fold', () => {
    setRect(false);
    mount('2,500+ certified');

    act(() => { jest.advanceTimersByTime(2500 * 8); });

    expect(latest?.settled).toBe(false);
    expect(latest?.display).toBe('0+ certified');
  });

  /**
   * The guarantee the backstop was written for, preserved: a figure that IS on
   * screen must never be left at zero, even if the observer never calls back.
   */
  it('still rescues a figure that is on screen and never observed', () => {
    setRect(true);
    mount('2,500+ certified');
    expect(latest?.settled).toBe(false);

    act(() => { jest.advanceTimersByTime(2600); });

    expect(latest?.display).toBe('2,500+ certified');
    expect(latest?.settled).toBe(true);
  });

  it('disconnects the observer once it has fired', () => {
    setRect(true);
    mount('1,000+ hires');

    act(() => { lastCallback?.([{ isIntersecting: true }]); });

    expect(disconnected).toBeGreaterThan(0);
  });

  /**
   * A figure whose number is not the first thing in the string still animates:
   * the words before it are held as a prefix and only the digits move. Written
   * after this expectation was asserted the other way round and failed --
   * "Consulting and Training 12+ years" counts from "…0+ years", which is the
   * behaviour we want, since every tile in the band should move.
   *
   * What matters for the claim is the END state, asserted below: the string
   * comes back byte-for-byte, never a reformatted version of itself.
   */
  it('animates an embedded number while preserving the words around it', () => {
    setRect(false);
    mount('Consulting and Training 12+ years');

    expect(latest?.display).toBe('Consulting and Training 0+ years');
    expect(latest?.settled).toBe(false);
  });

  it('ends on the registry wording exactly, prefix and suffix intact', () => {
    setRect(true);
    mount('Consulting and Training 12+ years');

    act(() => { jest.advanceTimersByTime(2600); });

    expect(latest?.display).toBe('Consulting and Training 12+ years');
    expect(latest?.settled).toBe(true);
  });
});
