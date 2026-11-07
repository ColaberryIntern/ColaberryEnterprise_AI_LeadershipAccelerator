/**
 * C122: Maya's booking link in the shared chat dock. Only the exact booking path becomes a link; with a booking-sheet host on the
 * page it opens the sheet in place, without one it is a plain link to the campus, which opens the sheet from ?book=call.
 * Pins the path against the backend constant Maya's reply uses.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DmMessageText from '../DmMessageText';
import { BOOK_CALL_PATH, BOOK_CALL_EVENT, registerBookCallHost } from '../../../../components/campus/admissions/admissionsCallApi';
import { takeBookCallParam } from '../../../../components/campus/admissions/BookCallHost';
import { TOUR_PATH, TOUR_EVENT, registerTourHost, hasTourHost, requestTour, takeTourParam, useTourLinkHost } from '../../../../components/campus/tourLink';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); window.history.replaceState(null, '', '/'); });
const show = (content: string) => act(() => { root.render(<DmMessageText content={content} />); });
const link = () => container.querySelector('[data-testid="dm-book-call"]') as HTMLAnchorElement | null;

it('plain text stays plain text (no markup is ever interpreted)', () => {
  show('Hi <b>there</b> [x](https://evil.example) [y](/portal/admin)');
  expect(container.textContent).toBe('Hi <b>there</b> [x](https://evil.example) [y](/portal/admin)');
  expect(container.querySelector('a, b')).toBeNull();
});

it("Maya's booking link becomes one action link, with the text around it kept", () => {
  show(`Happy to help.\n\n[Book a call with admissions](${BOOK_CALL_PATH})`);
  expect(link()?.getAttribute('href')).toBe(BOOK_CALL_PATH);
  expect(link()?.textContent).toContain('Book a call with admissions');
  expect(container.textContent).toContain('Happy to help.');
});

it('with a sheet host mounted, a click opens the booking sheet in place', () => {
  const unregister = registerBookCallHost();
  let opened = 0;
  const on = () => { opened += 1; };
  window.addEventListener(BOOK_CALL_EVENT, on);
  show(`[Book a call with admissions](${BOOK_CALL_PATH})`);
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => { link()!.dispatchEvent(ev); });
  expect(opened).toBe(1);
  expect(ev.defaultPrevented).toBe(true);
  window.removeEventListener(BOOK_CALL_EVENT, on);
  unregister();
});

it('without a host, the click is left to navigate to the campus', () => {
  let opened = 0;
  const on = () => { opened += 1; };
  window.addEventListener(BOOK_CALL_EVENT, on);
  show(`[Book a call with admissions](${BOOK_CALL_PATH})`);
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  // jsdom does not navigate; preventDefault keeps it from logging "not implemented"
  container.addEventListener('click', (e) => e.preventDefault(), { once: true });
  act(() => { link()!.dispatchEvent(ev); });
  expect(opened).toBe(0);
  window.removeEventListener(BOOK_CALL_EVENT, on);
});

it('the campus opens the sheet once from ?book=call and removes the param', () => {
  window.history.replaceState(null, '', '/portal/campus?book=call&x=1');
  expect(takeBookCallParam()).toBe(true);
  expect(window.location.search).toBe('?x=1');
  expect(takeBookCallParam()).toBe(false);
});

it('the path matches the one Maya posts (backend maya/mayaPortalTools.ts)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', '..', 'backend', 'src', 'services', 'maya', 'mayaPortalTools.ts'), 'utf8');
  expect(src).toContain(`export const BOOK_CALL_PATH = '${BOOK_CALL_PATH}';`);
  expect(src).toContain(`export const TOUR_PATH = '${TOUR_PATH}';`);
});

describe("C123: Maya's tour link", () => {
  const tour = () => container.querySelector('[data-testid="dm-tour"]') as HTMLAnchorElement | null;

  it('becomes one action link inline with the sentence; a look-alike path does not', () => {
    show(`Sure, here it is: [Take the campus tour](${TOUR_PATH}). Enjoy! [x](/portal/campus?tour=go)`);
    expect(tour()?.getAttribute('href')).toBe(TOUR_PATH);
    expect(tour()?.textContent).toContain('Take the campus tour');
    expect(container.textContent).toContain('. Enjoy!');
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });

  it('on the campus home (a tour host is mounted), a click starts the tour in place', () => {
    const unregister = registerTourHost();
    let asked = 0;
    const on = () => { asked += 1; };
    window.addEventListener(TOUR_EVENT, on);
    show(`[Take the campus tour](${TOUR_PATH})`);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { tour()!.dispatchEvent(ev); });
    expect(asked).toBe(1);
    expect(ev.defaultPrevented).toBe(true);
    window.removeEventListener(TOUR_EVENT, on);
    unregister();
  });

  it('elsewhere, the click is left to navigate to the campus', () => {
    let asked = 0;
    const on = () => { asked += 1; };
    window.addEventListener(TOUR_EVENT, on);
    show(`[Take the campus tour](${TOUR_PATH})`);
    container.addEventListener('click', (e) => e.preventDefault(), { once: true });
    act(() => { tour()!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(asked).toBe(0);
    window.removeEventListener(TOUR_EVENT, on);
  });

  it('the campus takes ?tour=start once and removes it', () => {
    window.history.replaceState(null, '', '/portal/campus?tour=start&x=1');
    expect(takeTourParam()).toBe(true);
    expect(window.location.search).toBe('?x=1');
    expect(takeTourParam()).toBe(false);
  });
});

describe('C123: the campus home starts the tour from the link (useTourLinkHost)', () => {
  function Host({ ready, hasTour, start }: { ready: boolean; hasTour: boolean; start: () => void }): null {
    useTourLinkHost(ready, hasTour, start);
    return null;
  }
  const mount = (ready: boolean, hasTour: boolean, start: () => void) => act(() => { root.render(<Host ready={ready} hasTour={hasTour} start={start} />); });

  it('a request waits for the gate, then starts the tour exactly once', () => {
    const start = jest.fn();
    mount(false, true, start);
    act(() => { requestTour(); });
    expect(start).not.toHaveBeenCalled();
    mount(true, true, start);
    expect(start).toHaveBeenCalledTimes(1);
    mount(true, true, start);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('?tour=start on arrival starts it once past the gate', () => {
    window.history.replaceState(null, '', '/portal/campus?tour=start');
    const start = jest.fn();
    mount(true, true, start);
    expect(start).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  it('staff (no tour) drop the request instead of starting an empty tour', () => {
    const start = jest.fn();
    mount(true, false, start);
    act(() => { requestTour(); });
    expect(start).not.toHaveBeenCalled();
  });

  it('registers as the host while mounted, so the chat link starts it in place', () => {
    mount(true, true, jest.fn());
    expect(hasTourHost()).toBe(true);
    act(() => root.unmount());
    expect(hasTourHost()).toBe(false);
    root = createRoot(container);
  });
});
