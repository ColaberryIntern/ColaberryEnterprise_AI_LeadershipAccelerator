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
});
